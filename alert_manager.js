/**
 * 알림 관리 모듈
 * - 서버 정상 복구 시 알림 자동 해결
 * - 오래된 알림 자동 정리
 */
import { Alert, MonitoringRecord, ServerStatus, ErrorLevel } from './models/index.js';
import { settings } from './config.js';
import { Op } from 'sequelize';

export class AlertManager {
  /**
   * 서버가 정상 상태로 복구되었는지 확인하고 관련 알림 자동 해결
   * @param {string} provider - 'custom' or 'openai'
   * @param {import('./models/index.js').MonitoringRecord} record - 최근 모니터링 기록
   */
  async autoResolveAlerts(provider, record) {
    if (!settings.ALERT_AUTO_RESOLVE_ENABLED) {
      return;
    }
    
    // 서버가 정상 상태로 복구된 경우
    if (record.status === ServerStatus.HEALTHY) {
      const providerKeyword = provider === 'custom' ? 'LLM 서버' : 
                              provider === 'openai-api' ? 'OpenAI API' :
                              provider === 'openai' ? 'OpenAI' :
                              provider === 'claude' ? 'Claude' :
                              provider === 'gemini' ? 'Gemini' :
                              provider === 'cloudflare' ? 'Cloudflare' :
                              provider === 'twilio' ? 'Twilio' :
                              provider === 'channeltalk' ? '채널톡' :
                              provider === 'aws' ? 'AWS' : provider;
      
      // 해당 provider의 미해결 알림 찾기
      const unresolvedAlerts = await Alert.findAll({
        where: {
          resolved: 0,
          message: {
            [Op.like]: `%${providerKeyword}%`,
          },
        },
      });
      
      // 최근 10분 이내에 정상 상태가 확인된 경우에만 자동 해결
      const recentHealthyRecords = await MonitoringRecord.count({
        where: {
          provider: provider,
          status: ServerStatus.HEALTHY,
          timestamp: {
            [Op.gte]: new Date(Date.now() - 10 * 60 * 1000), // 최근 10분
          },
        },
      });
      
      // 최근 10분 동안 최소 2번 이상 정상 상태가 확인되면 안정적으로 복구된 것으로 간주
      if (recentHealthyRecords >= 2 && unresolvedAlerts.length > 0) {
        const now = new Date();
        const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000); // 5분 전
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24시간 전
        const alertsToResolve = [];
        const criticalAlertsToKeep = [];
        
        // CRITICAL 알림이 5분 이상 지속된 경우 히스토리에 남기기 위해 자동 해결에서 제외
        // 단, 서버가 정상 복구된 후 24시간이 지난 CRITICAL 알림은 자동 해결 처리
        for (const alert of unresolvedAlerts) {
          const isCriticalAndLongDuration = alert.error_level === ErrorLevel.CRITICAL && 
                                            alert.timestamp <= fiveMinutesAgo;
          
          if (isCriticalAndLongDuration) {
            // CRITICAL 알림이 5분 이상 지속되었지만, 24시간이 지나지 않았으면 히스토리에 보존
            // 24시간이 지났으면 자동 해결 처리 (히스토리는 해결된 상태로 남음)
            if (alert.timestamp <= twentyFourHoursAgo) {
              alertsToResolve.push(alert);
            } else {
              criticalAlertsToKeep.push(alert);
            }
          } else {
            alertsToResolve.push(alert);
          }
        }
        
        // CRITICAL이 아닌 알림, 5분 미만 지속된 CRITICAL 알림, 또는 24시간 경과한 CRITICAL 알림 자동 해결
        for (const alert of alertsToResolve) {
          alert.resolved = 1;
          alert.resolved_at = now;
          await alert.save();
        }
        
        if (alertsToResolve.length > 0) {
          console.log(`✓ ${alertsToResolve.length}개의 ${providerKeyword} 관련 알림이 자동으로 해결되었습니다.`);
        }
        
        if (criticalAlertsToKeep.length > 0) {
          console.log(`ℹ ${criticalAlertsToKeep.length}개의 CRITICAL 알림이 5분 이상 지속되어 히스토리에 보존됩니다. (24시간 후 자동 해결)`);
        }
      }
    }
  }
  
  /**
   * 오래된 해결된 알림 정리
   */
  async cleanupOldAlerts() {
    const cutoffDate = new Date(Date.now() - settings.ALERT_CLEANUP_DAYS * 24 * 60 * 60 * 1000);
    
    const deletedCount = await Alert.destroy({
      where: {
        resolved: 1,
        resolved_at: {
          [Op.lt]: cutoffDate,
        },
      },
    });
    
    if (deletedCount > 0) {
      console.log(`✓ ${deletedCount}개의 해결된 알림이 정리되었습니다. (${settings.ALERT_CLEANUP_DAYS}일 이상 경과)`);
    }
    
    return deletedCount;
  }
  
  /**
   * 활성 알림 개수 제한 확인 및 오래된 알림 정리
   */
  async enforceActiveAlertLimit() {
    const activeCount = await Alert.count({
      where: {
        resolved: 0,
      },
    });
    
    if (activeCount > settings.ALERT_MAX_ACTIVE) {
      // 가장 오래된 활성 알림부터 해결 처리
      const excessCount = activeCount - settings.ALERT_MAX_ACTIVE;
      const oldestAlerts = await Alert.findAll({
        where: {
          resolved: 0,
        },
        order: [['timestamp', 'ASC']],
        limit: excessCount,
      });
      
      const now = new Date();
      for (const alert of oldestAlerts) {
        alert.resolved = 1;
        alert.resolved_at = now;
        await alert.save();
      }
      
      console.log(`⚠ 활성 알림이 ${settings.ALERT_MAX_ACTIVE}개를 초과하여 가장 오래된 ${excessCount}개 알림이 자동 해결되었습니다.`);
    }
  }
  
  /**
   * 정기적인 알림 관리 작업 실행
   */
  async performMaintenance() {
    try {
      await this.cleanupOldAlerts();
      await this.enforceActiveAlertLimit();
    } catch (error) {
      console.error('알림 관리 작업 중 오류:', error);
    }
  }
}
