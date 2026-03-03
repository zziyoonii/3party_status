/**
 * Slack 알림 모듈
 */
import axios from 'axios';
import { settings } from './config.js';
import { MonitoringRecord, Alert } from './models/index.js';
import { ServerStatus, ErrorLevel } from './models/index.js';
import { Op } from 'sequelize';

export class SlackNotifier {
  /**
   * @param {import('sequelize').Sequelize} sequelize - Sequelize 인스턴스
   */
  constructor(sequelize) {
    this.sequelize = sequelize;
    this.enabled = settings.SLACK_ENABLED && settings.SLACK_WEBHOOK_URL;
    this.webhookUrl = settings.SLACK_WEBHOOK_URL;
    this.downDurationMinutes = settings.SLACK_DOWN_DURATION_MINUTES;
  }
  
  /**
   * 서버 다운 상태가 지속 시간 이상인지 확인
   * @param {string} provider - 'custom' or 'openai'
   * @returns {Promise<{isDown: boolean, durationMinutes: number, lastHealthyTime: Date|null}>}
   */
  async checkDownDuration(provider) {
    // 최근 HEALTHY 상태 기록 찾기
    const lastHealthy = await MonitoringRecord.findOne({
      where: {
        provider: provider,
        status: ServerStatus.HEALTHY,
      },
      order: [['timestamp', 'DESC']],
    });
    
    // 최근 DOWN 또는 DEGRADED 상태 기록 찾기
    const recentDown = await MonitoringRecord.findOne({
      where: {
        provider: provider,
        status: {
          [Op.in]: [ServerStatus.DOWN, ServerStatus.DEGRADED],
        },
      },
      order: [['timestamp', 'DESC']],
    });
    
    if (!recentDown) {
      return {
        isDown: false,
        durationMinutes: 0,
        lastHealthyTime: lastHealthy?.timestamp || null,
      };
    }
    
    // 마지막 정상 시간이 없거나, 다운 시간이 마지막 정상 시간보다 이후인 경우
    const downTime = new Date(recentDown.timestamp);
    const lastHealthyTime = lastHealthy ? new Date(lastHealthy.timestamp) : null;
    
    if (!lastHealthyTime || downTime > lastHealthyTime) {
      const now = new Date();
      const durationMs = now - downTime;
      const durationMinutes = durationMs / (1000 * 60);
      
      return {
        isDown: durationMinutes >= this.downDurationMinutes,
        durationMinutes: durationMinutes,
        lastHealthyTime: lastHealthyTime,
      };
    }
    
    return {
      isDown: false,
      durationMinutes: 0,
      lastHealthyTime: lastHealthyTime,
    };
  }
  
  /**
   * 이미 알림을 보냈는지 확인 (중복 방지)
   * @param {string} provider - 'custom' or 'openai'
   * @returns {Promise<boolean>}
   */
  async hasRecentNotification(provider, record) {
    const threshold = new Date(Date.now() - 60 * 60 * 1000); // 1시간 이내
    
    // provider에 따른 서버 이름으로 검색
    const serverName = this.getServerDisplayName(provider, record?.server_url);
    
    const recentAlert = await Alert.findOne({
      where: {
        message: {
          [Op.like]: `%Slack 알림: ${serverName}%`,
        },
        timestamp: {
          [Op.gte]: threshold,
        },
      },
    });
    
    return !!recentAlert;
  }
  
  /**
   * Slack 메시지 전송
   * @param {string} message - 메시지 내용
   * @param {string} provider - 'custom', 'openai', 'claude' 등
   * @param {number} durationMinutes - 다운 지속 시간 (분)
   * @param {import('./models/index.js').MonitoringRecord} record - 모니터링 기록 (optional)
   * @returns {Promise<boolean>}
   */
  async sendSlackMessage(message, provider, durationMinutes, record = null) {
    if (!this.enabled) {
      console.log('Slack 알림이 비활성화되어 있습니다.');
      return false;
    }
    
    try {
      const serverName = provider === 'custom' ? 'LLM 서버' : 
                        provider === 'openai-api' ? 'OpenAI API' : 'OpenAI 서비스';
      const durationText = durationMinutes >= 60 
        ? `${Math.floor(durationMinutes / 60)}시간 ${Math.floor(durationMinutes % 60)}분`
        : `${Math.floor(durationMinutes)}분`;
      
      const payload = {
        text: `🚨 서버 다운 알림`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '🚨 서버 다운 알림',
              emoji: true,
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*서버:*\n${serverName}`,
              },
              {
                type: 'mrkdwn',
                text: `*다운 지속 시간:*\n${durationText}`,
              },
            ],
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*상세 정보:*\n${message}`,
            },
          },
          {
            type: 'divider',
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `⏰ 알림 시간: ${new Date().toLocaleString('ko-KR')}`,
              },
            ],
          },
        ],
      };
      
      const response = await axios.post(this.webhookUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });
      
      if (response.status === 200) {
        console.log(`✓ Slack 알림 전송 성공: ${serverName}`);
        
        // 알림 기록 저장
        await Alert.create({
          timestamp: new Date(),
          error_level: durationMinutes >= 30 ? 'CRITICAL' : 'ERROR',
          message: `Slack 알림: ${serverName} 다운 상태가 ${durationText} 이상 지속됨`,
        });
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('✗ Slack 알림 전송 실패:', error.message);
      return false;
    }
  }
  
  /**
   * provider에 따른 서버 이름 가져오기 (확장 가능)
   * @param {string} provider - provider 이름
   * @param {string} serverUrl - 서버 URL (optional)
   * @returns {string} 서버 표시 이름
   */
  getServerDisplayName(provider, serverUrl = '') {
    const providerNames = {
      'custom': 'LLM 서버',
      'openai': 'OpenAI 서비스',
      'openai-api': 'OpenAI API',
      'claude': 'Claude 서비스',
      'claude-api': 'Claude API',
      'gemini': 'Gemini 서비스',
      'gemini-api': 'Gemini API',
      'cloudflare': 'Cloudflare',
      'twilio': 'Twilio',
      'channeltalk': '채널톡',
      'aws': 'AWS',
      // 나중에 다른 provider 추가 가능
    };
    
    const baseName = providerNames[provider] || provider;
    
    // custom provider의 경우 server_url 포함
    if (provider === 'custom' && serverUrl) {
      try {
        const url = new URL(serverUrl);
        return `${baseName} (${url.hostname}${url.port ? ':' + url.port : ''})`;
      } catch {
        return `${baseName} (${serverUrl})`;
      }
    }
    
    return baseName;
  }

  /**
   * CRITICAL 알림이 5분 이상 지속되었는지 확인
   * @param {string} provider - 'custom', 'openai', 'claude' 등
   * @param {import('./models/index.js').MonitoringRecord} record - 모니터링 기록 (서버 URL 정보 포함)
   * @returns {Promise<{hasCritical: boolean, alert: Alert|null, durationMinutes: number}>}
   */
  async checkCriticalAlertDuration(provider, record) {
    const criticalThreshold = new Date(Date.now() - this.downDurationMinutes * 60 * 1000);
    
    // provider에 따른 서버 이름으로 검색 패턴 생성
    const serverName = this.getServerDisplayName(provider, record?.server_url);
    const searchPattern = `%${serverName}%`;
    
    // 미해결된 CRITICAL 알림 찾기
    const criticalAlert = await Alert.findOne({
      where: {
        error_level: ErrorLevel.CRITICAL,
        resolved: 0,
        message: {
          [Op.like]: searchPattern,
        },
        timestamp: {
          [Op.lte]: criticalThreshold, // 5분 이상 지속된 알림
        },
      },
      order: [['timestamp', 'ASC']], // 가장 오래된 것부터
    });
    
    if (!criticalAlert) {
      return {
        hasCritical: false,
        alert: null,
        durationMinutes: 0,
      };
    }
    
    const now = new Date();
    const durationMs = now - new Date(criticalAlert.timestamp);
    const durationMinutes = durationMs / (1000 * 60);
    
    return {
      hasCritical: true,
      alert: criticalAlert,
      durationMinutes: durationMinutes,
    };
  }

  /**
   * CRITICAL 알림에 대한 Slack 알림 전송
   * @param {string} provider - 'custom' or 'openai'
   * @param {Alert} alert - CRITICAL 알림
   * @param {number} durationMinutes - 지속 시간 (분)
   * @param {import('./models/index.js').MonitoringRecord} record - 모니터링 기록
   * @returns {Promise<boolean>}
   */
  async sendCriticalAlertSlackMessage(provider, alert, durationMinutes, record) {
    if (!this.enabled) {
      console.log('Slack 알림이 비활성화되어 있습니다.');
      return false;
    }
    
    try {
      let serverName;
      if (provider === 'custom') {
        // custom의 경우 server_url을 활용하여 서버 이름 생성
        const serverUrl = record?.server_url || '알 수 없음';
        // URL에서 호스트명 추출 또는 전체 URL 사용
        try {
          const url = new URL(serverUrl);
          serverName = `LLM 서버 (${url.hostname}${url.port ? ':' + url.port : ''})`;
        } catch {
          serverName = `LLM 서버 (${serverUrl})`;
        }
      } else if (provider === 'openai-api') {
        serverName = 'OpenAI API';
      } else {
        serverName = 'OpenAI 서비스';
      }
      const durationText = durationMinutes >= 60 
        ? `${Math.floor(durationMinutes / 60)}시간 ${Math.floor(durationMinutes % 60)}분`
        : `${Math.floor(durationMinutes)}분`;
      
      const payload = {
        text: `🚨 CRITICAL 이슈 알림`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '🚨 CRITICAL 이슈 알림',
              emoji: true,
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*서버:*\n${serverName}`,
              },
              {
                type: 'mrkdwn',
                text: `*지속 시간:*\n${durationText}`,
              },
            ],
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*알림 내용:*\n${alert.message}`,
            },
          },
          {
            type: 'divider',
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `⏰ 알림 발생 시간: ${new Date(alert.timestamp).toLocaleString('ko-KR')}\n⏰ 현재 시간: ${new Date().toLocaleString('ko-KR')}`,
              },
            ],
          },
        ],
      };
      
      const response = await axios.post(this.webhookUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });
      
      if (response.status === 200) {
        console.log(`✓ CRITICAL 이슈 Slack 알림 전송 성공: ${serverName}`);
        
        // 알림 기록 저장 (중복 방지를 위해)
        await Alert.create({
          timestamp: new Date(),
          error_level: ErrorLevel.CRITICAL,
          message: `Slack 알림: ${serverName} CRITICAL 이슈가 ${durationText} 이상 지속됨`,
        });
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('✗ CRITICAL 이슈 Slack 알림 전송 실패:', error.message);
      return false;
    }
  }

  /**
   * CRITICAL 알림 확인 및 Slack 알림 발송
   * @param {string} provider - 'custom' or 'openai'
   * @param {import('./models/index.js').MonitoringRecord} record - 모니터링 기록
   * @returns {Promise<void>}
   */
  async checkAndNotifyCritical(provider, record) {
    if (!this.enabled) {
      return;
    }
    
    const criticalCheck = await this.checkCriticalAlertDuration(provider, record);
    
    if (criticalCheck.hasCritical) {
      // 최근에 CRITICAL 알림을 보냈는지 확인 (중복 방지)
      const hasRecent = await this.hasRecentCriticalNotification(provider, record);
      
      if (!hasRecent) {
        await this.sendCriticalAlertSlackMessage(
          provider, 
          criticalCheck.alert, 
          criticalCheck.durationMinutes,
          record
        );
      }
    }
  }

  /**
   * 최근에 CRITICAL 알림을 보냈는지 확인 (중복 방지)
   * @param {string} provider - 'custom' or 'openai'
   * @param {import('./models/index.js').MonitoringRecord} record - 모니터링 기록
   * @returns {Promise<boolean>}
   */
  async hasRecentCriticalNotification(provider, record) {
    const threshold = new Date(Date.now() - 60 * 60 * 1000); // 1시간 이내
    
    // provider에 따른 서버 이름으로 검색 패턴 생성
    const serverName = this.getServerDisplayName(provider, record?.server_url);
    const searchPattern = `%Slack 알림: ${serverName} CRITICAL 이슈%`;
    
    const recentAlert = await Alert.findOne({
      where: {
        error_level: ErrorLevel.CRITICAL,
        message: {
          [Op.like]: searchPattern,
        },
        timestamp: {
          [Op.gte]: threshold,
        },
      },
    });
    
    return !!recentAlert;
  }

  /**
   * 서버 다운 상태 확인 및 알림 발송
   * @param {string} provider - 'custom' or 'openai'
   * @param {import('./models/index.js').MonitoringRecord} record - 최근 모니터링 기록
   * @returns {Promise<void>}
   */
  async checkAndNotify(provider, record) {
    if (!this.enabled) {
      return;
    }
    
    // DOWN 또는 DEGRADED 상태인 경우에만 확인
    if (record.status !== ServerStatus.DOWN && record.status !== ServerStatus.DEGRADED) {
      return;
    }
    
    const downCheck = await this.checkDownDuration(provider);
    
    if (downCheck.isDown) {
      // 최근에 알림을 보냈는지 확인 (중복 방지)
      const hasRecent = await this.hasRecentNotification(provider);
      
      if (!hasRecent) {
        const serverName = provider === 'custom' ? 'LLM 서버' : 
                        provider === 'openai-api' ? 'OpenAI API' : 'OpenAI 서비스';
        const message = `${serverName}가 ${Math.floor(downCheck.durationMinutes)}분 이상 다운 상태입니다.\n` +
          `상태: ${record.status}\n` +
          `오류 메시지: ${record.error_message || 'N/A'}\n` +
          `마지막 정상 시간: ${downCheck.lastHealthyTime ? downCheck.lastHealthyTime.toLocaleString('ko-KR') : '알 수 없음'}`;
        
        await this.sendSlackMessage(message, provider, downCheck.durationMinutes);
      }
    }
  }
}
