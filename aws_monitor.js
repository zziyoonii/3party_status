/**
 * AWS Status 페이지 모니터링 모듈
 * (AWS는 Statuspage.io 형식 공개 API가 없어, 상태 페이지 도달 가능성으로 모니터링)
 */
import axios from 'axios';
import { MonitoringRecord, ServerStatus, ErrorLevel, Alert } from './models/index.js';
import { settings } from './config.js';
import { Op } from 'sequelize';
import { SlackNotifier } from './slack_notifier.js';
import { AlertManager } from './alert_manager.js';

export class AWSStatusMonitor {
  /**
   * @param {import('sequelize').Sequelize} sequelize - Sequelize 인스턴스
   */
  constructor(sequelize) {
    this.sequelize = sequelize;
    this.status_url = settings.AWS_STATUS_URL;
    this.timeout = settings.AWS_STATUS_TIMEOUT * 1000; // 밀리초로 변환
    this.slackNotifier = new SlackNotifier(sequelize);
    this.alertManager = new AlertManager();
  }

  async checkAWSStatus() {
    const startTime = Date.now();
    let status = ServerStatus.UNKNOWN;
    let response_time_ms = null;
    let error_message = null;
    let http_status_code = null;
    let additional_data = null;

    try {
      const url = this.status_url.replace(/\/$/, '');
      console.log(`[AWS] Checking status at: ${url}`);

      const response = await axios.get(url, {
        timeout: this.timeout,
        validateStatus: () => true, // 모든 상태 코드 허용 (4xx/5xx도 처리)
      });

      response_time_ms = Date.now() - startTime;
      http_status_code = response.status;

      if (response.status === 200) {
        status = ServerStatus.HEALTHY;
        additional_data = JSON.stringify({
          url,
          status_code: response.status,
          note: 'AWS status page reachable (no public status API)',
        });
      } else {
        status = ServerStatus.DOWN;
        error_message = `AWS Status page returned HTTP ${response.status}`;
        additional_data = JSON.stringify({ url, status_code: response.status });
      }
    } catch (error) {
      response_time_ms = Date.now() - startTime;

      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        status = ServerStatus.DOWN;
        error_message = 'AWS Status page request timeout';
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        status = ServerStatus.DOWN;
        error_message = 'AWS Status page connection error';
      } else {
        status = ServerStatus.DOWN;
        error_message = `Unexpected error checking AWS Status: ${error.message}`;
      }
    }

    const record = await MonitoringRecord.create({
      timestamp: new Date(),
      server_url: this.status_url,
      provider: 'aws',
      status,
      response_time_ms,
      error_message,
      http_status_code,
      additional_data,
    });

    console.log(`[AWS] Record created: status=${status}, response_time=${response_time_ms}ms`);

    return record;
  }

  async analyzeErrorLevel(record) {
    if (record.status === ServerStatus.HEALTHY || record.status === ServerStatus.UNKNOWN) {
      return null;
    }

    const windowStart = new Date(Date.now() - settings.ERROR_WINDOW_MINUTES * 60 * 1000);
    const recentErrors = await MonitoringRecord.count({
      where: {
        timestamp: { [Op.gte]: windowStart },
        provider: 'aws',
        status: { [Op.in]: [ServerStatus.DEGRADED, ServerStatus.DOWN] },
      },
    });

    if (recentErrors >= settings.ERROR_THRESHOLD_CRITICAL) return ErrorLevel.CRITICAL;
    if (recentErrors >= settings.ERROR_THRESHOLD_ERROR) return ErrorLevel.ERROR;
    if (recentErrors >= settings.ERROR_THRESHOLD_WARNING) return ErrorLevel.WARNING;
    return ErrorLevel.INFO;
  }

  async createAlertIfNeeded(record, error_level) {
    if (error_level === null) return null;

    const recentAlert = await Alert.findOne({
      where: {
        error_level: error_level,
        resolved: 0,
        message: { [Op.like]: '%AWS%' },
      },
      order: [['timestamp', 'DESC']],
    });

    if (!recentAlert || error_level === ErrorLevel.ERROR || error_level === ErrorLevel.CRITICAL) {
      const alert = await Alert.create({
        timestamp: new Date(),
        error_level: error_level,
        message: `AWS 서비스 상태 이상 감지: ${record.status}. 오류 메시지: ${record.error_message || 'N/A'}`,
      });
      return alert;
    }

    return recentAlert;
  }

  async monitor() {
    const record = await this.checkAWSStatus();
    const error_level = await this.analyzeErrorLevel(record);

    if (error_level) {
      record.error_level = error_level;
      await record.save();
    }

    const alert = await this.createAlertIfNeeded(record, error_level);
    await this.alertManager.autoResolveAlerts('aws', record);
    await this.slackNotifier.checkAndNotify('aws', record);
    await this.slackNotifier.checkAndNotifyCritical('aws', record);

    return { record, error_level, alert };
  }
}
