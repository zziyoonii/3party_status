/**
 * Twilio Status API 모니터링 모듈
 */
import axios from 'axios';
import { MonitoringRecord, ServerStatus, ErrorLevel, Alert } from './models/index.js';
import { settings } from './config.js';
import { Op } from 'sequelize';
import { SlackNotifier } from './slack_notifier.js';
import { AlertManager } from './alert_manager.js';

export class TwilioStatusMonitor {
  /**
   * @param {import('sequelize').Sequelize} sequelize - Sequelize 인스턴스
   */
  constructor(sequelize) {
    this.sequelize = sequelize;
    this.api_url = settings.TWILIO_STATUS_API_URL;
    this.timeout = settings.TWILIO_STATUS_TIMEOUT * 1000; // 밀리초로 변환
    this.slackNotifier = new SlackNotifier(sequelize);
    this.alertManager = new AlertManager();
  }
  
  async checkTwilioStatus() {
    const startTime = Date.now();
    let status = ServerStatus.UNKNOWN;
    let response_time_ms = null;
    let error_message = null;
    let http_status_code = null;
    let additional_data = null;
    
    try {
      // Statuspage.io API 엔드포인트들 체크
      const statusUrl = `${this.api_url}/status.json`;
      const componentsUrl = `${this.api_url}/components.json`;
      
      // 전체 상태 체크
      const statusResponse = await axios.get(statusUrl, {
        timeout: this.timeout,
      });
      
      response_time_ms = Date.now() - startTime;
      http_status_code = statusResponse.status;
      
      if (statusResponse.status === 200) {
        const statusData = statusResponse.data;
        const indicator = statusData?.status?.indicator || 'unknown';

        // 컴포넌트 정보 항상 fetch (한국 관련 필터링 목적)
        let componentsData = null;
        try {
          const componentsResponse = await axios.get(componentsUrl, { timeout: this.timeout });
          if (componentsResponse.status === 200) {
            componentsData = componentsResponse.data;
          }
        } catch (e) {
          // 컴포넌트 fetch 실패 시 전역 indicator로 폴백
        }

        // 한국 관련 컴포넌트 필터링
        const koreanKeywords = ['korea', 'seoul', 'apac', 'asia pacific'];
        const koreanComponents = componentsData?.components?.filter(c =>
          c.name && koreanKeywords.some(kw => c.name.toLowerCase().includes(kw))
        ) ?? [];

        console.log(`[Twilio] Korean components found: ${JSON.stringify(koreanComponents.map(c => c.name))}`);

        if (koreanComponents.length > 0) {
          const affectedComponents = koreanComponents.filter(c => c.status !== 'operational');
          const hasDown = koreanComponents.some(c => c.status === 'major_outage');
          const hasDegraded = koreanComponents.some(c =>
            ['degraded_performance', 'partial_outage', 'under_maintenance'].includes(c.status)
          );

          if (hasDown) {
            status = ServerStatus.DOWN;
            error_message = `Twilio 한국 서비스 이상: ${affectedComponents.map(c => `${c.name} (${c.status})`).join(', ')}`;
          } else if (hasDegraded) {
            status = ServerStatus.DEGRADED;
            error_message = `Twilio 한국 서비스 이상: ${affectedComponents.map(c => `${c.name} (${c.status})`).join(', ')}`;
          } else {
            status = ServerStatus.HEALTHY;
          }
        } else {
          // 한국 컴포넌트 없으면 전역 indicator로 폴백
          // minor는 한국과 무관한 지역 이슈일 가능성 높음 → HEALTHY
          if (indicator === 'none' || indicator === 'minor') {
            status = ServerStatus.HEALTHY;
          } else if (indicator === 'maintenance') {
            status = ServerStatus.DEGRADED;
            error_message = `Twilio Status: ${indicator}`;
          } else if (indicator === 'major' || indicator === 'critical') {
            status = ServerStatus.DOWN;
            error_message = `Twilio Status: ${indicator}`;
          }
        }

        additional_data = JSON.stringify({ status: statusData, components: componentsData });
      } else {
        status = ServerStatus.DOWN;
        error_message = `Twilio Status API error: ${statusResponse.status}`;
      }
    } catch (error) {
      response_time_ms = Date.now() - startTime;
      
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        status = ServerStatus.DOWN;
        error_message = 'Twilio Status API request timeout';
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        status = ServerStatus.DOWN;
        error_message = 'Twilio Status API connection error';
      } else {
        status = ServerStatus.DOWN;
        error_message = `Unexpected error checking Twilio Status: ${error.message}`;
      }
    }
    
    // 모니터링 기록 저장
    const record = await MonitoringRecord.create({
      timestamp: new Date(),
      server_url: this.api_url,
      provider: 'twilio',
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
    
    // Twilio 서버의 최근 시간 윈도우 내의 실제 오류 개수 확인 (UNKNOWN 제외)
    const windowStart = new Date(Date.now() - settings.ERROR_WINDOW_MINUTES * 60 * 1000);
    const recentErrors = await MonitoringRecord.count({
      where: {
        timestamp: {
          [Op.gte]: windowStart,
        },
        provider: 'twilio',
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
    if (error_level === null) return null;

    const levelRank = { INFO: 0, WARNING: 1, ERROR: 2, CRITICAL: 3 };
    const now = new Date();
    const message = `Twilio 서비스 상태 이상 감지: ${record.status}. 오류 메시지: ${record.error_message || 'N/A'}`;

    const latestUnresolved = await Alert.findOne({
      where: { resolved: 0, message: { [Op.like]: '%Twilio%' } },
      order: [['timestamp', 'DESC']],
    });

    if (latestUnresolved && levelRank[error_level] > levelRank[latestUnresolved.error_level]) {
      latestUnresolved.resolved = 1;
      latestUnresolved.resolved_at = now;
      await latestUnresolved.save();
      return await Alert.create({ timestamp: now, error_level, message });
    }

    if (latestUnresolved && latestUnresolved.error_level === error_level) {
      await Alert.update(
        { resolved: 1, resolved_at: now },
        { where: { resolved: 0, message: { [Op.like]: '%Twilio%' }, id: { [Op.ne]: latestUnresolved.id } } }
      );
      return latestUnresolved;
    }

    return await Alert.create({ timestamp: now, error_level, message });
  }
  
  async monitor() {
    const record = await this.checkTwilioStatus();
    const error_level = await this.analyzeErrorLevel(record);
    
    // 오류 수준 업데이트
    if (error_level) {
      record.error_level = error_level;
      await record.save();
    }
    
    // 알림 생성
    const alert = await this.createAlertIfNeeded(record, error_level);
    
    // 서버 정상 복구 시 알림 자동 해결
    await this.alertManager.autoResolveAlerts('twilio', record);
    
    // Slack 알림 확인 및 발송 (다운 상태가 5분 이상 지속된 경우)
    await this.slackNotifier.checkAndNotify('twilio', record);
    
    // CRITICAL 이슈가 5분 이상 지속된 경우 Slack 알림 발송
    await this.slackNotifier.checkAndNotifyCritical('twilio', record);
    
    return {
      record: record,
      error_level: error_level,
      alert: alert,
    };
  }
}
