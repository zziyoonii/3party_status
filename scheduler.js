/**
 * 모니터링 스케줄러
 */
import { LLMServerMonitor } from './monitor.js';
import { OpenAIStatusMonitor } from './openai_monitor.js';
import { OpenAIAPIMonitor } from './openai_api_monitor.js';
import { ClaudeStatusMonitor } from './claude_monitor.js';
import { GeminiStatusMonitor } from './gemini_monitor.js';
import { CloudflareStatusMonitor } from './cloudflare_monitor.js';
import { TwilioStatusMonitor } from './twilio_monitor.js';
import { ChannelTalkStatusMonitor } from './channeltalk_monitor.js';
import { AWSStatusMonitor } from './aws_monitor.js';
import { sequelize } from './database.js';
import { settings } from './config.js';
import { AlertManager } from './alert_manager.js';
import { Op } from 'sequelize';

export class MonitoringScheduler {
  constructor() {
    this.intervals = [];
    this.isRunning = false;
    this.alertManager = new AlertManager();
  }
  
  async runMonitoring() {
    try {
      // 자체 LLM 서버 모니터링
      const monitor = new LLMServerMonitor(sequelize);
      const result = await monitor.monitor();
      
      console.log(
        `Custom LLM Server Monitoring - Status: ${result.record.status}, ` +
        `Error Level: ${result.error_level || 'None'}`
      );
      
      if (result.alert) {
        console.warn(
          `Alert created - Level: ${result.alert.error_level}, ` +
          `Message: ${result.alert.message}`
        );
      }
    } catch (error) {
      console.error('Custom LLM Server Monitoring error:', error);
    }
  }
  
  async runOpenAIMonitoring() {
    if (!settings.OPENAI_STATUS_ENABLED) {
      return;
    }
    
    try {
      const openaiMonitor = new OpenAIStatusMonitor(sequelize);
      const result = await openaiMonitor.monitor();
      
      console.log(
        `OpenAI Status Monitoring - Status: ${result.record.status}, ` +
        `Error Level: ${result.error_level || 'None'}`
      );
      
      if (result.alert) {
        console.warn(
          `OpenAI Alert created - Level: ${result.alert.error_level}, ` +
          `Message: ${result.alert.message}`
        );
      }
    } catch (error) {
      console.error('OpenAI Status Monitoring error:', error);
    }
  }
  
  async runOpenAIAPIMonitoring() {
    if (!settings.OPENAI_API_ENABLED) {
      return;
    }
    
    try {
      const openaiAPIMonitor = new OpenAIAPIMonitor(sequelize);
      const result = await openaiAPIMonitor.monitor();
      
      console.log(
        `OpenAI API Monitoring - Status: ${result.record.status}, ` +
        `Error Level: ${result.error_level || 'None'}`
      );
      
      if (result.alert) {
        console.warn(
          `OpenAI API Alert created - Level: ${result.alert.error_level}, ` +
          `Message: ${result.alert.message}`
        );
      }
    } catch (error) {
      console.error('OpenAI API Monitoring error:', error);
    }
  }
  
  async runClaudeMonitoring() {
    if (!settings.CLAUDE_STATUS_ENABLED) {
      return;
    }
    
    try {
      const claudeMonitor = new ClaudeStatusMonitor(sequelize);
      const result = await claudeMonitor.monitor();
      
      console.log(
        `Claude Status Monitoring - Status: ${result.record.status}, ` +
        `Error Level: ${result.error_level || 'None'}`
      );
      
      if (result.alert) {
        console.warn(
          `Claude Alert created - Level: ${result.alert.error_level}, ` +
          `Message: ${result.alert.message}`
        );
      }
    } catch (error) {
      console.error('Claude Status Monitoring error:', error);
    }
  }
  
  async runGeminiMonitoring() {
    if (!settings.GEMINI_STATUS_ENABLED) {
      return;
    }
    
    try {
      const geminiMonitor = new GeminiStatusMonitor(sequelize);
      const result = await geminiMonitor.monitor();
      
      console.log(
        `Gemini Status Monitoring - Status: ${result.record.status}, ` +
        `Error Level: ${result.error_level || 'None'}`
      );
      
      if (result.alert) {
        console.warn(
          `Gemini Alert created - Level: ${result.alert.error_level}, ` +
          `Message: ${result.alert.message}`
        );
      }
    } catch (error) {
      console.error('Gemini Status Monitoring error:', error);
    }
  }
  
  async runCloudflareMonitoring() {
    if (!settings.CLOUDFLARE_STATUS_ENABLED) {
      console.log('[Cloudflare] Monitoring is disabled');
      return;
    }
    
    try {
      console.log('[Cloudflare] Starting monitoring...');
      const cloudflareMonitor = new CloudflareStatusMonitor(sequelize);
      const result = await cloudflareMonitor.monitor();
      
      console.log(
        `[Cloudflare] Status Monitoring completed - Status: ${result.record.status}, ` +
        `Error Level: ${result.error_level || 'None'}, ` +
        `Response Time: ${result.record.response_time_ms}ms`
      );
      
      if (result.alert) {
        console.warn(
          `[Cloudflare] Alert created - Level: ${result.alert.error_level}, ` +
          `Message: ${result.alert.message}`
        );
      }
    } catch (error) {
      console.error('[Cloudflare] Status Monitoring error:', error);
      console.error('[Cloudflare] Error stack:', error.stack);
    }
  }
  
  async runTwilioMonitoring() {
    if (!settings.TWILIO_STATUS_ENABLED) {
      return;
    }
    
    try {
      const twilioMonitor = new TwilioStatusMonitor(sequelize);
      const result = await twilioMonitor.monitor();
      
      console.log(
        `Twilio Status Monitoring - Status: ${result.record.status}, ` +
        `Error Level: ${result.error_level || 'None'}`
      );
      
      if (result.alert) {
        console.warn(
          `Twilio Alert created - Level: ${result.alert.error_level}, ` +
          `Message: ${result.alert.message}`
        );
      }
    } catch (error) {
      console.error('Twilio Status Monitoring error:', error);
    }
  }
  
  async runChannelTalkMonitoring() {
    if (!settings.CHANNELTALK_STATUS_ENABLED) {
      return;
    }
    
    try {
      const channeltalkMonitor = new ChannelTalkStatusMonitor(sequelize);
      const result = await channeltalkMonitor.monitor();
      
      console.log(
        `ChannelTalk Status Monitoring - Status: ${result.record.status}, ` +
        `Error Level: ${result.error_level || 'None'}`
      );
      
      if (result.alert) {
        console.warn(
          `ChannelTalk Alert created - Level: ${result.alert.error_level}, ` +
          `Message: ${result.alert.message}`
        );
      }
    } catch (error) {
      console.error('ChannelTalk Status Monitoring error:', error);
    }
  }

  async runAWSMonitoring() {
    if (!settings.AWS_STATUS_ENABLED) {
      return;
    }
    try {
      console.log('[AWS] Starting monitoring...');
      const awsMonitor = new AWSStatusMonitor(sequelize);
      const result = await awsMonitor.monitor();
      console.log(
        `[AWS] Status Monitoring completed - Status: ${result.record.status}, ` +
        `Error Level: ${result.error_level || 'None'}, ` +
        `Response Time: ${result.record.response_time_ms}ms`
      );
      if (result.alert) {
        console.warn(
          `[AWS] Alert created - Level: ${result.alert.error_level}, ` +
          `Message: ${result.alert.message}`
        );
      }
    } catch (error) {
      console.error('[AWS] Status Monitoring error:', error);
    }
  }
  
  start() {
    if (this.isRunning) {
      console.warn('Scheduler is already running');
      return;
    }
    
    const intervalMs = settings.MONITORING_INTERVAL * 1000;
    
    // Custom 서버 모니터링 작업 등록 (활성화된 경우에만)
    if (settings.CUSTOM_SERVER_ENABLED) {
      const llmInterval = setInterval(async () => {
        await this.runMonitoring();
      }, intervalMs);
      
      this.intervals.push(llmInterval);
    }
    
    // OpenAI Status 모니터링 작업 등록
    if (settings.OPENAI_STATUS_ENABLED) {
      const openaiInterval = setInterval(async () => {
        await this.runOpenAIMonitoring();
      }, intervalMs);
      
      this.intervals.push(openaiInterval);
    }
    
    // OpenAI API 직접 모니터링 작업 등록
    if (settings.OPENAI_API_ENABLED) {
      const openaiAPIInterval = setInterval(async () => {
        await this.runOpenAIAPIMonitoring();
      }, intervalMs);
      
      this.intervals.push(openaiAPIInterval);
    }
    
    // Claude Status 모니터링 작업 등록
    if (settings.CLAUDE_STATUS_ENABLED) {
      const claudeInterval = setInterval(async () => {
        await this.runClaudeMonitoring();
      }, intervalMs);
      
      this.intervals.push(claudeInterval);
    }
    
    // Gemini Status 모니터링 작업 등록
    if (settings.GEMINI_STATUS_ENABLED) {
      const geminiInterval = setInterval(async () => {
        await this.runGeminiMonitoring();
      }, intervalMs);
      
      this.intervals.push(geminiInterval);
    }
    
    // Cloudflare Status 모니터링 작업 등록
    if (settings.CLOUDFLARE_STATUS_ENABLED) {
      const cloudflareInterval = setInterval(async () => {
        await this.runCloudflareMonitoring();
      }, intervalMs);
      
      this.intervals.push(cloudflareInterval);
    }
    
    // Twilio Status 모니터링 작업 등록
    if (settings.TWILIO_STATUS_ENABLED) {
      const twilioInterval = setInterval(async () => {
        await this.runTwilioMonitoring();
      }, intervalMs);
      
      this.intervals.push(twilioInterval);
    }
    
    // 채널톡 Status 모니터링 작업 등록
    if (settings.CHANNELTALK_STATUS_ENABLED) {
      const channeltalkInterval = setInterval(async () => {
        await this.runChannelTalkMonitoring();
      }, intervalMs);
      
      this.intervals.push(channeltalkInterval);
    }

    // AWS Status 모니터링 작업 등록
    if (settings.AWS_STATUS_ENABLED) {
      const awsInterval = setInterval(async () => {
        await this.runAWSMonitoring();
      }, intervalMs);
      
      this.intervals.push(awsInterval);
    }
    
    this.isRunning = true;
    
    console.log(`Monitoring scheduler started (interval: ${settings.MONITORING_INTERVAL}s)`);
    
    // 시작 시 즉시 한 번 실행
    if (settings.CUSTOM_SERVER_ENABLED) {
      this.runMonitoring();
    }
    if (settings.OPENAI_STATUS_ENABLED) {
      this.runOpenAIMonitoring();
    }
    if (settings.OPENAI_API_ENABLED) {
      this.runOpenAIAPIMonitoring();
    }
    if (settings.CLAUDE_STATUS_ENABLED) {
      this.runClaudeMonitoring();
    }
    if (settings.GEMINI_STATUS_ENABLED) {
      this.runGeminiMonitoring();
    }
    if (settings.CLOUDFLARE_STATUS_ENABLED) {
      this.runCloudflareMonitoring();
    }
    if (settings.TWILIO_STATUS_ENABLED) {
      this.runTwilioMonitoring();
    }
    if (settings.CHANNELTALK_STATUS_ENABLED) {
      this.runChannelTalkMonitoring();
    }
    if (settings.AWS_STATUS_ENABLED) {
      this.runAWSMonitoring();
    }
    
    // 알림 관리 작업 (30분마다 실행)
    const maintenanceInterval = setInterval(async () => {
      await this.alertManager.performMaintenance();
    }, 30 * 60 * 1000);
    this.intervals.push(maintenanceInterval);

    // MonitoringRecord 정리 (1시간마다, 2일 초과 기록 삭제)
    const recordCleanupInterval = setInterval(
      () => this.cleanupOldMonitoringRecords(),
      60 * 60 * 1000
    );
    this.intervals.push(recordCleanupInterval);

    // 시작 시 한 번 실행
    setTimeout(() => {
      this.alertManager.performMaintenance();
      this.cleanupOldMonitoringRecords();
    }, 5000);
  }

  async cleanupOldMonitoringRecords() {
    try {
      const { MonitoringRecord } = await import('./models/index.js');
      const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const deleted = await MonitoringRecord.destroy({ where: { timestamp: { [Op.lt]: cutoff } } });
      if (deleted > 0) console.log(`[Cleanup] MonitoringRecord ${deleted}건 삭제`);
    } catch (err) {
      console.error('[Cleanup] MonitoringRecord 정리 실패:', err.message);
    }
  }

  stop() {
    if (!this.isRunning) {
      return;
    }
    
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];
    this.isRunning = false;
    
    console.log('Monitoring scheduler stopped');
  }
}
