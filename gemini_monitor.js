/**
 * Gemini Status 모니터링 모듈
 * Google Cloud Status API (status.cloud.google.com/api/v2) 사용
 * API 키가 있으면 Gemini API 직접 호출로 더 정확하게 모니터링
 */
import axios from 'axios';
import { MonitoringRecord, ServerStatus, ErrorLevel, Alert } from './models/index.js';
import { settings } from './config.js';
import { Op } from 'sequelize';
import { SlackNotifier } from './slack_notifier.js';
import { AlertManager } from './alert_manager.js';

// Google Cloud 공식 Status API (Statuspage.io 형식)
const GOOGLE_CLOUD_STATUS_API = 'https://status.cloud.google.com/api/v2';

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
      // API 키 없으면 Google Cloud 공식 Status API 사용
      try {
        const statusUrl = `${GOOGLE_CLOUD_STATUS_API}/status.json`;
        const statusResponse = await axios.get(statusUrl, { timeout: this.timeout });

        response_time_ms = Date.now() - startTime;
        http_status_code = statusResponse.status;

        if (statusResponse.status === 200) {
          const statusData = statusResponse.data;
          // Statuspage.io 형식: status.indicator = "none" | "minor" | "major" | "critical"
          const indicator = statusData?.status?.indicator || 'unknown';

          if (indicator === 'none') {
            status = ServerStatus.HEALTHY;
          } else if (indicator === 'minor' || indicator === 'maintenance') {
            status = ServerStatus.DEGRADED;
            error_message = `Google Cloud Status: ${indicator}`;
          } else if (indicator === 'major' || indicator === 'critical') {
            status = ServerStatus.DOWN;
            error_message = `Google Cloud Status: ${indicator}`;
          } else {
            status = ServerStatus.DEGRADED;
            error_message = `Google Cloud Status: unknown indicator (${indicator})`;
          }

          // 컴포넌트 중 AI Platform / Vertex AI 관련 문제 확인
          try {
            const componentsResponse = await axios.get(`${GOOGLE_CLOUD_STATUS_API}/components.json`, { timeout: this.timeout });
            if (componentsResponse.status === 200) {
              const components = componentsResponse.data?.components || [];
              const aiComponents = components.filter(c =>
                c?.name && (
                  c.name.includes('Vertex AI') ||
                  c.name.includes('AI Platform') ||
                  c.name.includes('Generative')
                )
              );
              const problematic = aiComponents.filter(c => c.status && c.status !== 'operational');

              if (problematic.length > 0 && status === ServerStatus.HEALTHY) {
                status = ServerStatus.DEGRADED;
                error_message = `Gemini/AI 관련 컴포넌트 이상: ${problematic.map(c => c.name).join(', ')}`;
              }

              additional_data = JSON.stringify({
                method: 'google_cloud_status_api',
                indicator,
                ai_components: aiComponents.map(c => ({ name: c.name, status: c.status })),
              });
            }
          } catch {
            additional_data = JSON.stringify({ method: 'google_cloud_status_api', indicator });
          }
        } else {
          status = ServerStatus.DOWN;
          error_message = `Google Cloud Status API error: ${statusResponse.status}`;
        }
      } catch (error) {
        response_time_ms = Date.now() - startTime;

        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
          status = ServerStatus.DOWN;
          error_message = 'Google Cloud Status API: Request timeout';
        } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
          status = ServerStatus.DOWN;
          error_message = 'Google Cloud Status API: Connection error';
        } else {
          status = ServerStatus.DOWN;
          error_message = `Google Cloud Status API: ${error.message}`;
        }

        additional_data = JSON.stringify({ method: 'google_cloud_status_api', error: error.message });
      }
    }

    const serverUrl = this.api_key ? this.api_url : GOOGLE_CLOUD_STATUS_API;
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
