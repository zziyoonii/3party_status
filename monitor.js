/**
 * LLM 서버 모니터링 모듈
 */
import axios from 'axios';
import { MonitoringRecord, ServerStatus, ErrorLevel, Alert } from './models/index.js';
import { settings } from './config.js';
import { Op } from 'sequelize';
import { SlackNotifier } from './slack_notifier.js';
import { AlertManager } from './alert_manager.js';

export class LLMServerMonitor {
  /**
   * @param {import('sequelize').Sequelize} sequelize - Sequelize 인스턴스
   */
  constructor(sequelize) {
    this.sequelize = sequelize;
    this.server_url = settings.LLM_SERVER_URL;
    this.health_endpoint = settings.LLM_HEALTH_CHECK_ENDPOINT;
    this.timeout = settings.LLM_API_TIMEOUT * 1000; // 밀리초로 변환
    this.slackNotifier = new SlackNotifier(sequelize);
    this.alertManager = new AlertManager();
  }
  
  async checkServerHealth() {
    /** @type {import('./models/index.js').MonitoringRecord} */
    const startTime = Date.now();
    let status = ServerStatus.UNKNOWN;
    let response_time_ms = null;
    let error_message = null;
    let http_status_code = null;
    
    try {
      const url = `${this.server_url}${this.health_endpoint}`;
      const response = await axios.get(url, {
        timeout: this.timeout,
      });
      
      response_time_ms = Date.now() - startTime;
      http_status_code = response.status;
      
      if (response.status === 200) {
        status = ServerStatus.HEALTHY;
      } else if (response.status >= 500) {
        status = ServerStatus.DOWN;
        error_message = `Server error: ${response.status}`;
      } else {
        status = ServerStatus.DEGRADED;
        error_message = `Unexpected status: ${response.status}`;
      }
    } catch (error) {
      response_time_ms = Date.now() - startTime;
      
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        status = ServerStatus.DOWN;
        error_message = 'Request timeout';
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        status = ServerStatus.DOWN;
        error_message = 'Connection error - server may be down';
      } else {
        status = ServerStatus.DOWN;
        error_message = `Unexpected error: ${error.message}`;
      }
    }
    
    // 모니터링 기록 저장
    const record = await MonitoringRecord.create({
      timestamp: new Date(),
      server_url: this.server_url,
      provider: 'custom',
      status: status,
      response_time_ms: response_time_ms,
      error_message: error_message,
      http_status_code: http_status_code,
    });
    
    return record;
  }
  
  async analyzeErrorLevel(record) {
    if (record.status === ServerStatus.HEALTHY) {
      return null;
    }
    
    // 최근 시간 윈도우 내의 오류 개수 확인 (자체 서버만)
    const windowStart = new Date(Date.now() - settings.ERROR_WINDOW_MINUTES * 60 * 1000);
    const recentErrors = await MonitoringRecord.count({
      where: {
        timestamp: {
          [Op.gte]: windowStart,
        },
        provider: 'custom',
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
    
    // 최근 동일한 수준의 미해결 알림이 있는지 확인 (자체 서버 관련)
    const recentAlert = await Alert.findOne({
      where: {
        error_level: error_level,
        resolved: 0,
        message: {
          [Op.notLike]: '%OpenAI%',
        },
      },
      order: [['timestamp', 'DESC']],
    });
    
    // 새로운 알림이 필요한 경우 (수준이 상승했거나, 알림이 없는 경우)
    if (!recentAlert || error_level === ErrorLevel.ERROR || error_level === ErrorLevel.CRITICAL) {
      const alert = await Alert.create({
        timestamp: new Date(),
        error_level: error_level,
        message: `LLM 서버 (${record.server_url}) 상태 이상 감지: ${record.status}. 오류 메시지: ${record.error_message || 'N/A'}`,
      });
      return alert;
    }
    
    return recentAlert;
  }
  
  async monitor() {
    const record = await this.checkServerHealth();
    const error_level = await this.analyzeErrorLevel(record);
    
    // 오류 수준 업데이트
    if (error_level) {
      record.error_level = error_level;
      await record.save();
    }
    
    // 알림 생성
    const alert = await this.createAlertIfNeeded(record, error_level);
    
    // 서버 정상 복구 시 알림 자동 해결
    await this.alertManager.autoResolveAlerts('custom', record);
    
    // Slack 알림 확인 및 발송 (다운 상태가 5분 이상 지속된 경우)
    await this.slackNotifier.checkAndNotify('custom', record);
    
    // CRITICAL 이슈가 5분 이상 지속된 경우 Slack 알림 발송
    await this.slackNotifier.checkAndNotifyCritical('custom', record);
    
    return {
      record: record,
      error_level: error_level,
      alert: alert,
    };
  }
}
