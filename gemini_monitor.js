/**
 * Gemini Status 모니터링 모듈
 * 참고: Google은 공식 Status API를 제공하지 않으므로, Google Cloud Status 페이지를 모니터링합니다.
 */
import axios from 'axios';
import { MonitoringRecord, ServerStatus, ErrorLevel, Alert } from './models/index.js';
import { settings } from './config.js';
import { Op } from 'sequelize';
import { SlackNotifier } from './slack_notifier.js';
import { AlertManager } from './alert_manager.js';

export class GeminiStatusMonitor {
  /**
   * @param {import('sequelize').Sequelize} sequelize - Sequelize 인스턴스
   */
  constructor(sequelize) {
    this.sequelize = sequelize;
    this.api_url = settings.GEMINI_API_URL;
    this.api_key = settings.GEMINI_API_KEY;
    this.status_url = settings.GEMINI_STATUS_URL;
    this.timeout = settings.GEMINI_STATUS_TIMEOUT * 1000; // 밀리초로 변환
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
    
    // API 키가 있으면 Gemini API를 직접 호출 (더 정확함)
    if (this.api_key) {
      try {
        const modelsUrl = `${this.api_url}/models?key=${this.api_key}`;
        const response = await axios.get(modelsUrl, {
          timeout: this.timeout,
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        response_time_ms = Date.now() - startTime;
        http_status_code = response.status;
        
        if (response.status === 200 && response.data && response.data.models) {
          status = ServerStatus.HEALTHY;
          additional_data = JSON.stringify({
            method: 'api_direct',
            models_count: response.data.models.length,
            note: 'Gemini API models endpoint check successful',
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
        } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
          status = ServerStatus.DOWN;
          error_message = 'Gemini API: Connection error';
        } else {
          status = ServerStatus.DOWN;
          error_message = `Gemini API: ${error.message}`;
        }
        
        additional_data = JSON.stringify({
          method: 'api_direct',
          error: error.message,
        });
      }
    } else {
      // API 키가 없으면 Status 페이지 체크 (덜 정확함)
      try {
        const response = await axios.get(this.status_url, {
          timeout: this.timeout,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; StatusMonitor/1.0)',
          },
        });
        
        response_time_ms = Date.now() - startTime;
        http_status_code = response.status;
        
        if (response.status === 200) {
          // HTML 페이지에서 상태 정보 추출 시도
          const html = response.data;
          
          // Google Cloud Status 페이지는 복잡한 구조를 가지고 있어서
          // 단순 키워드 검색보다는 페이지 접근 성공 여부로 판단
          // 실제로는 Status 페이지에 Gemini 전용 섹션이 없으므로
          // 페이지가 접근 가능하면 정상으로 간주 (더 보수적인 접근)
          
          // 다만 명확한 오류 키워드가 있으면 DEGRADED로 설정
          const hasCriticalIncident = html.includes('critical') || 
                                      html.includes('major outage') ||
                                      html.includes('service disruption');
          
          if (hasCriticalIncident) {
            status = ServerStatus.DEGRADED;
            error_message = 'Gemini: Potential critical incident detected on Google Cloud Status page';
          } else {
            // 페이지 접근 성공 = 정상 (Google Cloud Status는 모든 서비스 통합 페이지)
            // Gemini 전용 Status API가 없으므로 페이지 접근 가능 여부로 판단
            status = ServerStatus.HEALTHY;
          }
          
          additional_data = JSON.stringify({
            method: 'status_page_scraping',
            page_accessible: true,
            has_critical_incident: hasCriticalIncident,
            note: 'Google does not provide official Status API for Gemini. Monitoring Google Cloud Status page accessibility. For more accurate monitoring, set GEMINI_API_KEY in .env file to use direct API calls.',
          });
        } else {
          status = ServerStatus.DOWN;
          error_message = `Gemini Status page error: ${response.status}`;
        }
      } catch (error) {
        response_time_ms = Date.now() - startTime;
        
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
          status = ServerStatus.DOWN;
          error_message = 'Gemini Status page request timeout';
        } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
          status = ServerStatus.DOWN;
          error_message = 'Gemini Status page connection error';
        } else {
          status = ServerStatus.DOWN;
          error_message = `Unexpected error checking Gemini Status: ${error.message}`;
        }
        
        additional_data = JSON.stringify({
          method: 'status_page_scraping',
          error: error.message,
        });
      }
    }
    
    // 모니터링 기록 저장
    // API 키가 있으면 실제 API URL, 없으면 Status 페이지 URL 저장
    const serverUrl = this.api_key ? this.api_url : this.status_url;
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
