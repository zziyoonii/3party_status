/**
 * OpenAI API 직접 모니터링 모듈
 * 실제 OpenAI API 엔드포인트를 호출하여 서비스가 정상 작동하는지 확인
 */
import axios from 'axios';
import { MonitoringRecord, ServerStatus, ErrorLevel, Alert } from './models/index.js';
import { settings } from './config.js';
import { Op } from 'sequelize';
import { SlackNotifier } from './slack_notifier.js';
import { AlertManager } from './alert_manager.js';

export class OpenAIAPIMonitor {
  /**
   * @param {import('sequelize').Sequelize} sequelize - Sequelize 인스턴스
   */
  constructor(sequelize) {
    this.sequelize = sequelize;
    this.api_url = settings.OPENAI_API_URL || 'https://api.openai.com/v1';
    this.api_key = settings.OPENAI_API_KEY || '';
    this.timeout = settings.OPENAI_API_TIMEOUT * 1000; // 밀리초로 변환
    this.slackNotifier = new SlackNotifier(sequelize);
    this.alertManager = new AlertManager();
  }
  
  async checkOpenAIAPI() {
    const startTime = Date.now();
    let status = ServerStatus.UNKNOWN;
    let response_time_ms = null;
    let error_message = null;
    let http_status_code = null;
    let additional_data = null;
    
    try {
      // OpenAI API의 models 엔드포인트 호출 (가벼운 요청)
      const url = `${this.api_url}/models`;
      const headers = {};
      
      if (this.api_key) {
        headers['Authorization'] = `Bearer ${this.api_key}`;
      }
      
      const response = await axios.get(url, {
        headers,
        timeout: this.timeout,
      });
      
      response_time_ms = Date.now() - startTime;
      http_status_code = response.status;
      
      if (response.status === 200) {
        status = ServerStatus.HEALTHY;
        // 응답 데이터 저장
        const models = response.data?.data || [];
        const modelIds = models.map(m => m.id).slice(0, 20); // 최대 20개 모델 ID만 저장
        
        additional_data = JSON.stringify({
          model_count: models.length,
          models: modelIds,
          object: response.data?.object || null,
          has_more: response.data?.has_more || false,
          // 전체 응답 데이터도 포함 (크기 제한 고려)
          full_response: {
            object: response.data?.object,
            data_count: models.length,
            sample_models: modelIds.slice(0, 5), // 샘플 5개만
          },
        });
      } else if (response.status >= 500) {
        status = ServerStatus.DOWN;
        error_message = `OpenAI API error: ${response.status}`;
      } else if (response.status === 401) {
        status = ServerStatus.DEGRADED;
        error_message = 'OpenAI API: Authentication failed (API key may be invalid)';
      } else if (response.status === 429) {
        status = ServerStatus.DEGRADED;
        error_message = 'OpenAI API: Rate limit exceeded';
      } else {
        status = ServerStatus.DEGRADED;
        error_message = `OpenAI API: Unexpected status ${response.status}`;
      }
    } catch (error) {
      response_time_ms = Date.now() - startTime;
      
      if (error.response) {
        // API가 응답했지만 오류 상태 코드
        http_status_code = error.response.status;
        
        if (error.response.status >= 500) {
          status = ServerStatus.DOWN;
          error_message = `OpenAI API server error: ${error.response.status}`;
        } else if (error.response.status === 401) {
          status = ServerStatus.DEGRADED;
          error_message = 'OpenAI API: Authentication failed';
        } else if (error.response.status === 429) {
          status = ServerStatus.DEGRADED;
          error_message = 'OpenAI API: Rate limit exceeded';
        } else {
          status = ServerStatus.DEGRADED;
          error_message = `OpenAI API error: ${error.response.status}`;
        }
      } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        status = ServerStatus.DOWN;
        error_message = 'OpenAI API request timeout';
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        status = ServerStatus.DOWN;
        error_message = 'OpenAI API connection error';
      } else {
        status = ServerStatus.DOWN;
        error_message = `Unexpected error checking OpenAI API: ${error.message}`;
      }
    }
    
    // 모니터링 기록 저장
    const record = await MonitoringRecord.create({
      timestamp: new Date(),
      server_url: this.api_url,
      provider: 'openai-api',
      status: status,
      response_time_ms: response_time_ms,
      error_message: error_message,
      http_status_code: http_status_code,
      additional_data: additional_data,
    });
    
    return record;
  }
  
  async analyzeErrorLevel(record) {
    if (record.status === ServerStatus.HEALTHY) {
      return null;
    }
    
    // OpenAI API의 최근 시간 윈도우 내의 오류 개수 확인
    const windowStart = new Date(Date.now() - settings.ERROR_WINDOW_MINUTES * 60 * 1000);
    const recentErrors = await MonitoringRecord.count({
      where: {
        timestamp: {
          [Op.gte]: windowStart,
        },
        provider: 'openai-api',
        status: {
          [Op.ne]: ServerStatus.HEALTHY,
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
    
    // 최근 동일한 수준의 미해결 알림이 있는지 확인 (OpenAI API 관련)
    const recentAlert = await Alert.findOne({
      where: {
        error_level: error_level,
        resolved: 0,
        message: {
          [Op.like]: '%OpenAI API%',
        },
      },
      order: [['timestamp', 'DESC']],
    });
    
    // 새로운 알림이 필요한 경우
    if (!recentAlert || error_level === ErrorLevel.ERROR || error_level === ErrorLevel.CRITICAL) {
      const alert = await Alert.create({
        timestamp: new Date(),
        error_level: error_level,
        message: `OpenAI API 상태 이상 감지: ${record.status}. 오류 메시지: ${record.error_message || 'N/A'}`,
      });
      return alert;
    }
    
    return recentAlert;
  }
  
  async monitor() {
    const record = await this.checkOpenAIAPI();
    const error_level = await this.analyzeErrorLevel(record);
    
    // 오류 수준 업데이트
    if (error_level) {
      record.error_level = error_level;
      await record.save();
    }
    
    // 알림 생성
    const alert = await this.createAlertIfNeeded(record, error_level);
    
    // 서버 정상 복구 시 알림 자동 해결
    await this.alertManager.autoResolveAlerts('openai-api', record);
    
    // Slack 알림 확인 및 발송 (다운 상태가 5분 이상 지속된 경우)
    await this.slackNotifier.checkAndNotify('openai-api', record);
    
    // CRITICAL 이슈가 5분 이상 지속된 경우 Slack 알림 발송
    await this.slackNotifier.checkAndNotifyCritical('openai-api', record);
    
    return {
      record: record,
      error_level: error_level,
      alert: alert,
    };
  }
}
