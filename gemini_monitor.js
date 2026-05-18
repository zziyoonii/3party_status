/**
 * Gemini Status 모니터링 모듈
 * API 키 없이도 Gemini API 엔드포인트에 직접 요청해 인프라 상태 확인
 * - 400/401/403 응답 → 서버 정상 (인증 필요하지만 서비스는 살아있음)
 * - 5xx 응답 → 서버 이상 (DEGRADED/DOWN)
 * - 연결 실패/타임아웃 → DOWN
 * API 키가 있으면 실제 models API 호출로 더 정확하게 확인
 */
import axios from 'axios';
import { MonitoringRecord, ServerStatus, ErrorLevel, Alert } from './models/index.js';
import { settings } from './config.js';
import { Op } from 'sequelize';
import { SlackNotifier } from './slack_notifier.js';
import { AlertManager } from './alert_manager.js';

export class GeminiStatusMonitor {
  constructor(sequelize) {
    this.sequelize = sequelize;
    this.api_url = settings.GEMINI_API_URL;
    this.api_key = settings.GEMINI_API_KEY;
    this.timeout = settings.GEMINI_STATUS_TIMEOUT * 1000;
    this.slackNotifier = new SlackNotifier(sequelize);
    this.alertManager = new AlertManager();
  }

  async checkGeminiStatus() {
    const startTime = Date.now();
    let status = ServerStatus.UNKNOWN;
    let response_time_ms = null;
    let error_message = null;
    let http_status_code = null;
    let additional_data = null;

    // API 키가 있으면 Gemini API 직접 호출 (가장 정확)
    if (this.api_key) {
      try {
        const modelsUrl = `${this.api_url}/models?key=${this.api_key}`;
        const response = await axios.get(modelsUrl, {
          timeout: this.timeout,
          headers: { 'Content-Type': 'application/json' },
        });

        response_time_ms = Date.now() - startTime;
        http_status_code = response.status;

        if (response.status === 200 && response.data && response.data.models) {
          status = ServerStatus.HEALTHY;
          additional_data = JSON.stringify({
            method: 'api_direct',
            models_count: response.data.models.length,
          });
        } else {
          status = ServerStatus.DEGRADED;
          error_message = 'Gemini API: Unexpected response format';
        }
      } catch (error) {
        response_time_ms = Date.now() - startTime;

        if (error.response) {
          http_status_code = error.response.status;
          if (error.response.status === 401 || error.response.status === 403) {
            status = ServerStatus.DEGRADED;
            error_message = 'Gemini API: Authentication error (invalid API key?)';
          } else if (error.response.status >= 500) {
            status = ServerStatus.DOWN;
            error_message = `Gemini API: Server error ${error.response.status}`;
          } else {
            status = ServerStatus.DEGRADED;
            error_message = `Gemini API: HTTP ${error.response.status}`;
          }
        } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
          status = ServerStatus.DOWN;
          error_message = 'Gemini API: Request timeout';
        } else {
          status = ServerStatus.DOWN;
          error_message = `Gemini API: ${error.message}`;
        }

        additional_data = JSON.stringify({ method: 'api_direct', error: error.message });
      }
    } else {
      // API 키 없으면 Gemini API 엔드포인트에 인증 없이 요청
      // 400/401/403 = 서버 정상 (인증 필요), 5xx = 서버 이상, 연결 실패 = 다운
      const probeUrl = `${this.api_url}/models`;
      try {
        const response = await axios.get(probeUrl, { timeout: this.timeout });

        response_time_ms = Date.now() - startTime;
        http_status_code = response.status;
        // 인증 없이 200이 오면 정상
        status = ServerStatus.HEALTHY;
        additional_data = JSON.stringify({ method: 'api_probe', note: 'Unauthenticated probe succeeded' });
      } catch (error) {
        response_time_ms = Date.now() - startTime;

        if (error.response) {
          http_status_code = error.response.status;

          if (error.response.status === 400 || error.response.status === 401 || error.response.status === 403) {
            // 인증 오류 = 서버는 살아있음
            status = ServerStatus.HEALTHY;
            additional_data = JSON.stringify({
              method: 'api_probe',
              note: `API reachable (HTTP ${error.response.status} = auth required, server is up)`,
            });
          } else if (error.response.status >= 500) {
            status = ServerStatus.DOWN;
            error_message = `Gemini API: Server error ${error.response.status}`;
            additional_data = JSON.stringify({ method: 'api_probe', error: error.message });
          } else {
            status = ServerStatus.DEGRADED;
            error_message = `Gemini API: HTTP ${error.response.status}`;
            additional_data = JSON.stringify({ method: 'api_probe', error: error.message });
          }
        } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
          status = ServerStatus.DOWN;
          error_message = 'Gemini API: Request timeout';
          additional_data = JSON.stringify({ method: 'api_probe', error: error.message });
        } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
          status = ServerStatus.DOWN;
          error_message = 'Gemini API: Connection error';
          additional_data = JSON.stringify({ method: 'api_probe', error: error.message });
        } else {
          status = ServerStatus.DOWN;
          error_message = `Gemini API: ${error.message}`;
          additional_data = JSON.stringify({ method: 'api_probe', error: error.message });
        }
      }
    }

    const serverUrl = this.api_url;
    const record = await MonitoringRecord.create({
      timestamp: new Date(),
      server_url: serverUrl,
      provider: 'gemini',
      status: status,
      response_time_ms: response_time_ms,
      error_message: error_message,
      http_status_code: http_status_code,
      additional_data: additional_data,
    });
    
    return record;
  }
  
  async analyzeErrorLevel(record) {
    // HEALTHY나 UNKNOWN 상태는 오류 수준 없음
    if (record.status === ServerStatus.HEALTHY || record.status === ServerStatus.UNKNOWN) {
      return null;
    }
    
    // Gemini 서버의 최근 시간 윈도우 내의 실제 오류 개수 확인 (UNKNOWN 제외)
    const windowStart = new Date(Date.now() - settings.ERROR_WINDOW_MINUTES * 60 * 1000);
    const recentErrors = await MonitoringRecord.count({
      where: {
        timestamp: {
          [Op.gte]: windowStart,
        },
        provider: 'gemini',
        status: {
          [Op.in]: [ServerStatus.DEGRADED, ServerStatus.DOWN], // UNKNOWN은 제외
        },
      },
    });
    
    // 오류 수준 결정
    if (recentErrors >= settings.ERROR_THRESHOLD_CRITICAL) {
      return ErrorLevel.CRITICAL;
    } else if (recentErrors >= settings.ERROR_THRESHOLD_ERROR) {
      return ErrorLevel.ERROR;
    } else if (recentErrors >= settings.ERROR_THRESHOLD_WARNING) {
      return ErrorLevel.WARNING;
    } else {
      return ErrorLevel.INFO;
    }
  }
  
  async createAlertIfNeeded(record, error_level) {
    if (error_level === null) {
      return null;
    }
    
    // 최근 동일한 수준의 미해결 알림이 있는지 확인 (Gemini 관련)
    const recentAlert = await Alert.findOne({
      where: {
        error_level: error_level,
        resolved: 0,
        message: {
          [Op.like]: '%Gemini%',
        },
      },
      order: [['timestamp', 'DESC']],
    });
    
    // 새로운 알림이 필요한 경우
    if (!recentAlert || error_level === ErrorLevel.ERROR || error_level === ErrorLevel.CRITICAL) {
      const alert = await Alert.create({
        timestamp: new Date(),
        error_level: error_level,
        message: `Gemini 서비스 상태 이상 감지: ${record.status}. 오류 메시지: ${record.error_message || 'N/A'}`,
      });
      return alert;
    }
    
    return recentAlert;
  }
  
  async monitor() {
    const record = await this.checkGeminiStatus();
    const error_level = await this.analyzeErrorLevel(record);
    
    // 오류 수준 업데이트
    if (error_level) {
      record.error_level = error_level;
      await record.save();
    }
    
    // 알림 생성
    const alert = await this.createAlertIfNeeded(record, error_level);
    
    // 서버 정상 복구 시 알림 자동 해결
    await this.alertManager.autoResolveAlerts('gemini', record);
    
    // Slack 알림 확인 및 발송 (다운 상태가 5분 이상 지속된 경우)
    await this.slackNotifier.checkAndNotify('gemini', record);
    
    // CRITICAL 이슈가 5분 이상 지속된 경우 Slack 알림 발송
    await this.slackNotifier.checkAndNotifyCritical('gemini', record);
    
    return {
      record: record,
      error_level: error_level,
      alert: alert,
    };
  }
}
