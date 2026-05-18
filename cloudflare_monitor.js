/**
 * Cloudflare Status API 모니터링 모듈
 */
import axios from 'axios';
import { MonitoringRecord, ServerStatus, ErrorLevel, Alert } from './models/index.js';
import { settings } from './config.js';
import { Op } from 'sequelize';
import { SlackNotifier } from './slack_notifier.js';
import { AlertManager } from './alert_manager.js';

export class CloudflareStatusMonitor {
  /**
   * @param {import('sequelize').Sequelize} sequelize - Sequelize 인스턴스
   */
  constructor(sequelize) {
    this.sequelize = sequelize;
    this.api_url = settings.CLOUDFLARE_STATUS_API_URL;
    this.timeout = settings.CLOUDFLARE_STATUS_TIMEOUT * 1000; // 밀리초로 변환
    this.slackNotifier = new SlackNotifier(sequelize);
    this.alertManager = new AlertManager();
  }
  
  async checkCloudflareStatus() {
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
      
      console.log(`[Cloudflare] Checking status at: ${statusUrl}`);
      
      // 전체 상태 체크
      const statusResponse = await axios.get(statusUrl, {
        timeout: this.timeout,
      });
      
      response_time_ms = Date.now() - startTime;
      http_status_code = statusResponse.status;
      
      if (statusResponse.status === 200) {
        const statusData = statusResponse.data;
        
        // Statuspage.io의 상태 확인
        // status.indicator: "none", "minor", "major", "critical", "maintenance"
        const indicator = statusData?.status?.indicator || 'unknown';
        
        if (indicator === 'none') {
          status = ServerStatus.HEALTHY;
        } else if (indicator === 'minor' || indicator === 'maintenance') {
          status = ServerStatus.DEGRADED;
          error_message = `Cloudflare Status: ${indicator}`;
        } else if (indicator === 'major' || indicator === 'critical') {
          status = ServerStatus.DOWN;
          error_message = `Cloudflare Status: ${indicator}`;
        }
        
        // 컴포넌트 상태도 확인 (전체 상태가 none일 때는 무시)
        // 전체 상태가 none이면 일부 지역 컴포넌트 문제는 무시 (전체 서비스는 정상)
        if (indicator !== 'none') {
          try {
            const componentsResponse = await axios.get(componentsUrl, {
              timeout: this.timeout,
            });
            
            if (componentsResponse.status === 200) {
              const componentsData = componentsResponse.data;
              additional_data = JSON.stringify({
                status: statusData,
                components: componentsData,
              });
              
              // 전체 상태가 이미 문제가 있는 경우에만 컴포넌트 세부 정보 확인
              // 전체 상태가 none이면 컴포넌트 체크는 하지 않음
            }
          } catch (e) {
            // 컴포넌트 체크 실패는 무시 (전체 상태가 더 중요)
          }
        } else {
          // 전체 상태가 none일 때는 컴포넌트 정보만 저장 (상태 변경 없음)
          try {
            const componentsResponse = await axios.get(componentsUrl, {
              timeout: this.timeout,
            });
            
            if (componentsResponse.status === 200) {
              const componentsData = componentsResponse.data;
              additional_data = JSON.stringify({
                status: statusData,
                components: componentsData,
              });
            }
          } catch (e) {
            // 컴포넌트 체크 실패는 무시
          }
        }
        
        if (!additional_data) {
          additional_data = JSON.stringify(statusData);
        }
      } else {
        status = ServerStatus.DOWN;
        error_message = `Cloudflare Status API error: ${statusResponse.status}`;
      }
    } catch (error) {
      response_time_ms = Date.now() - startTime;
      
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        status = ServerStatus.DOWN;
        error_message = 'Cloudflare Status API request timeout';
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        status = ServerStatus.DOWN;
        error_message = 'Cloudflare Status API connection error';
      } else {
        status = ServerStatus.DOWN;
        error_message = `Unexpected error checking Cloudflare Status: ${error.message}`;
      }
    }
    
    // 모니터링 기록 저장
    const record = await MonitoringRecord.create({
      timestamp: new Date(),
      server_url: this.api_url,
      provider: 'cloudflare',
      status: status,
      response_time_ms: response_time_ms,
      error_message: error_message,
      http_status_code: http_status_code,
      additional_data: additional_data,
    });
    
    console.log(`[Cloudflare] Record created: status=${status}, response_time=${response_time_ms}ms`);
    
    return record;
  }
  
  async analyzeErrorLevel(record) {
    // HEALTHY나 UNKNOWN 상태는 오류 수준 없음
    if (record.status === ServerStatus.HEALTHY || record.status === ServerStatus.UNKNOWN) {
      return null;
    }
    
    // Cloudflare 서버의 최근 시간 윈도우 내의 실제 오류 개수 확인 (UNKNOWN 제외)
    const windowStart = new Date(Date.now() - settings.ERROR_WINDOW_MINUTES * 60 * 1000);
    const recentErrors = await MonitoringRecord.count({
      where: {
        timestamp: {
          [Op.gte]: windowStart,
        },
        provider: 'cloudflare',
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
    
    // 최근 동일한 수준의 미해결 알림이 있는지 확인 (Cloudflare 관련)
    const recentAlert = await Alert.findOne({
      where: {
        error_level: error_level,
        resolved: 0,
        message: {
          [Op.like]: '%Cloudflare%',
        },
      },
      order: [['timestamp', 'DESC']],
    });
    
    // 새로운 알림이 필요한 경우
    if (!recentAlert || error_level === ErrorLevel.ERROR || error_level === ErrorLevel.CRITICAL) {
      const alert = await Alert.create({
        timestamp: new Date(),
        error_level: error_level,
        message: `Cloudflare 서비스 상태 이상 감지: ${record.status}. 오류 메시지: ${record.error_message || 'N/A'}`,
      });
      return alert;
    }
    
    return recentAlert;
  }
  
  async monitor() {
    const record = await this.checkCloudflareStatus();
    const error_level = await this.analyzeErrorLevel(record);
    
    // 오류 수준 업데이트
    if (error_level) {
      record.error_level = error_level;
      await record.save();
    }
    
    // 알림 생성
    const alert = await this.createAlertIfNeeded(record, error_level);
    
    // 서버 정상 복구 시 알림 자동 해결
    await this.alertManager.autoResolveAlerts('cloudflare', record);
    
    // Slack 알림 확인 및 발송 (다운 상태가 5분 이상 지속된 경우)
    await this.slackNotifier.checkAndNotify('cloudflare', record);
    
    // CRITICAL 이슈가 5분 이상 지속된 경우 Slack 알림 발송
    await this.slackNotifier.checkAndNotifyCritical('cloudflare', record);
    
    return {
      record: record,
      error_level: error_level,
      alert: alert,
    };
  }
}
