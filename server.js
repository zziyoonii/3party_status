/**
 * LLM 서버 모니터링 API 서버
 */
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initDb, sequelize } from './database.js';
import { MonitoringRecord, Alert, ServerStatus, ErrorLevel } from './models/index.js';
import { LLMServerMonitor } from './monitor.js';
import { OpenAIStatusMonitor } from './openai_monitor.js';
import { CloudflareStatusMonitor } from './cloudflare_monitor.js';
import { TwilioStatusMonitor } from './twilio_monitor.js';
import { ChannelTalkStatusMonitor } from './channeltalk_monitor.js';
import { AWSStatusMonitor } from './aws_monitor.js';
import { MonitoringScheduler } from './scheduler.js';
import { settings } from './config.js';
import { Op } from 'sequelize';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const logger = console;

// 미들웨어 설정
app.use(cors());
app.use(express.json());

// 정적 파일 서빙 (대시보드)
app.use(express.static(join(__dirname, 'public')));

// 전역 스케줄러 인스턴스
const scheduler = new MonitoringScheduler();

// 애플리케이션 시작 시 실행
async function startup() {
  try {
    await initDb();
    scheduler.start();
    logger.info('Application started');
  } catch (error) {
    logger.error('Startup error:', error);
    process.exit(1);
  }
}

// 애플리케이션 종료 시 실행
function shutdown() {
  scheduler.stop();
  logger.info('Application stopped');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// 라우트 정의
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.get('/api', (req, res) => {
  res.json({
    message: 'LLM Server Monitoring API',
    version: '1.0.0',
    status: 'running',
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.post('/api/monitor/check', async (req, res) => {
  try {
    const provider = req.query.provider || 'custom';
    
    if (provider === 'openai') {
      if (!settings.OPENAI_STATUS_ENABLED) {
        return res.status(400).json({
          error: 'OpenAI Status monitoring is disabled',
        });
      }
      const monitor = new OpenAIStatusMonitor(sequelize);
      const result = await monitor.monitor();
      
      return res.json({
        success: true,
        provider: provider,
        status: result.record.status,
        error_level: result.error_level || null,
        response_time_ms: result.record.response_time_ms,
        alert_created: result.alert !== null,
      });
    } else if (provider === 'cloudflare') {
      if (!settings.CLOUDFLARE_STATUS_ENABLED) {
        return res.status(400).json({
          error: 'Cloudflare Status monitoring is disabled',
        });
      }
      const monitor = new CloudflareStatusMonitor(sequelize);
      const result = await monitor.monitor();
      
      return res.json({
        success: true,
        provider: provider,
        status: result.record.status,
        error_level: result.error_level || null,
        response_time_ms: result.record.response_time_ms,
        alert_created: result.alert !== null,
      });
    } else if (provider === 'twilio') {
      if (!settings.TWILIO_STATUS_ENABLED) {
        return res.status(400).json({
          error: 'Twilio Status monitoring is disabled',
        });
      }
      const monitor = new TwilioStatusMonitor(sequelize);
      const result = await monitor.monitor();
      
      return res.json({
        success: true,
        provider: provider,
        status: result.record.status,
        error_level: result.error_level || null,
        response_time_ms: result.record.response_time_ms,
        alert_created: result.alert !== null,
      });
    } else if (provider === 'channeltalk') {
      if (!settings.CHANNELTALK_STATUS_ENABLED) {
        return res.status(400).json({
          error: 'ChannelTalk Status monitoring is disabled',
        });
      }
      const monitor = new ChannelTalkStatusMonitor(sequelize);
      const result = await monitor.monitor();
      
      return res.json({
        success: true,
        provider: provider,
        status: result.record.status,
        error_level: result.error_level || null,
        response_time_ms: result.record.response_time_ms,
        alert_created: result.alert !== null,
      });
    } else if (provider === 'aws') {
      if (!settings.AWS_STATUS_ENABLED) {
        return res.status(400).json({
          error: 'AWS Status monitoring is disabled',
        });
      }
      const monitor = new AWSStatusMonitor(sequelize);
      const result = await monitor.monitor();
      
      return res.json({
        success: true,
        provider: provider,
        status: result.record.status,
        error_level: result.error_level || null,
        response_time_ms: result.record.response_time_ms,
        alert_created: result.alert !== null,
      });
    } else {
      const monitor = new LLMServerMonitor(sequelize);
      const result = await monitor.monitor();
      
      return res.json({
        success: true,
        provider: provider,
        status: result.record.status,
        error_level: result.error_level || null,
        response_time_ms: result.record.response_time_ms,
        alert_created: result.alert !== null,
      });
    }
  } catch (error) {
    logger.error('Manual check error:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/monitor/records', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 5000); // limit 증가
    const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);
    const status = req.query.status;
    const error_level = req.query.error_level;
    const provider = req.query.provider;
    const since = req.query.since; // ISO 8601 형식의 타임스탬프
    
    const where = {};
    
    if (status && Object.values(ServerStatus).includes(status)) {
      where.status = status;
    }
    if (error_level && Object.values(ErrorLevel).includes(error_level)) {
      where.error_level = error_level;
    }
    if (provider) {
      where.provider = provider;
    }
    // 시간 필터 추가 (최근 N시간의 기록만 조회)
    if (since) {
      try {
        const sinceDate = new Date(since);
        if (!isNaN(sinceDate.getTime())) {
          where.timestamp = {
            [Op.gte]: sinceDate,
          };
        }
      } catch (e) {
        // 잘못된 날짜 형식은 무시
      }
    }
    
    const total = await MonitoringRecord.count({ where });
    const records = await MonitoringRecord.findAll({
      where,
      order: [['timestamp', 'DESC']],
      limit,
      offset,
    });
    
    res.json({
      total,
      offset,
      limit,
      records: records.map(r => ({
        id: r.id,
        timestamp: r.timestamp.toISOString(),
        server_url: r.server_url,
        provider: r.provider,
        status: r.status,
        response_time_ms: r.response_time_ms,
        error_message: r.error_message,
        error_level: r.error_level,
        http_status_code: r.http_status_code,
        additional_data: r.additional_data,
      })),
    });
  } catch (error) {
    logger.error('Get monitoring records error:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/monitor/stats', async (req, res) => {
  try {
    const hours = Math.min(Math.max(parseInt(req.query.hours || '24', 10), 1), 168);
    const provider = req.query.provider;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    const where = {
      timestamp: {
        [Op.gte]: since,
      },
    };
    
    // Provider 필터 추가
    if (provider) {
      where.provider = provider;
    }
    
    const totalRecords = await MonitoringRecord.count({ where });
    
    const healthyCount = await MonitoringRecord.count({
      where: {
        ...where,
        status: ServerStatus.HEALTHY,
      },
    });
    
    const errorCount = totalRecords - healthyCount;
    
    const avgResult = await MonitoringRecord.findOne({
      where: {
        ...where,
        response_time_ms: {
          [Op.ne]: null,
        },
      },
      attributes: [
        [sequelize.fn('AVG', sequelize.col('response_time_ms')), 'avg_response_time'],
      ],
      raw: true,
    });
    
    const avgResponseTime = avgResult?.avg_response_time || null;
    
    res.json({
      period_hours: hours,
      provider: provider || 'all',
      total_records: totalRecords,
      healthy_count: healthyCount,
      error_count: errorCount,
      health_rate: totalRecords > 0 ? (healthyCount / totalRecords * 100) : 0,
      avg_response_time_ms: avgResponseTime ? Math.round(avgResponseTime * 100) / 100 : null,
    });
  } catch (error) {
    logger.error('Get monitoring stats error:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/alerts', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 1000);
    const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);
    const resolved = req.query.resolved !== undefined ? req.query.resolved === 'true' : undefined;
    const error_level = req.query.error_level;
    
    const where = {};
    
    if (resolved !== undefined) {
      where.resolved = resolved ? 1 : 0;
    }
    if (error_level && Object.values(ErrorLevel).includes(error_level)) {
      where.error_level = error_level;
    }
    
    const total = await Alert.count({ where });
    const alerts = await Alert.findAll({
      where,
      order: [['timestamp', 'DESC']],
      limit,
      offset,
    });
    
    res.json({
      total,
      offset,
      limit,
      alerts: alerts.map(a => ({
        id: a.id,
        timestamp: a.timestamp.toISOString(),
        error_level: a.error_level,
        message: a.message,
        resolved: Boolean(a.resolved),
        resolved_at: a.resolved_at ? a.resolved_at.toISOString() : null,
      })),
    });
  } catch (error) {
    logger.error('Get alerts error:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/alerts/:alertId/resolve', async (req, res) => {
  try {
    const alertId = parseInt(req.params.alertId, 10);
    const alert = await Alert.findByPk(alertId);
    
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    
    if (alert.resolved) {
      return res.json({
        message: 'Alert already resolved',
        alert_id: alertId,
      });
    }
    
    alert.resolved = 1;
    alert.resolved_at = new Date();
    await alert.save();
    
    res.json({
      message: 'Alert resolved',
      alert_id: alertId,
      resolved_at: alert.resolved_at.toISOString(),
    });
  } catch (error) {
    logger.error('Resolve alert error:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/alerts/current', async (req, res) => {
  try {
    const alerts = await Alert.findAll({
      where: {
        resolved: 0,
      },
      order: [['timestamp', 'DESC']],
    });
    
    res.json({
      count: alerts.length,
      alerts: alerts.map(a => ({
        id: a.id,
        timestamp: a.timestamp.toISOString(),
        error_level: a.error_level,
        message: a.message,
      })),
    });
  } catch (error) {
    logger.error('Get current alerts error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// 서버 시작
async function startServer() {
  try {
    console.log('\n' + '='.repeat(50));
    console.log('LLM Server Monitoring API');
    console.log('='.repeat(50));
    console.log(`Server starting on http://${settings.API_HOST}:${settings.API_PORT}`);
    console.log(`API Documentation: http://127.0.0.1:${settings.API_PORT}/docs`);
    console.log('='.repeat(50) + '\n');
    
    await startup();
    
    app.listen(settings.API_PORT, settings.API_HOST, () => {
      console.log('✓ Application ready\n');
    }).on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\n✗ 포트 ${settings.API_PORT}가 이미 사용 중입니다.`);
        console.error('다음 중 하나를 시도하세요:');
        console.error(`1. 기존 프로세스를 종료하세요: netstat -ano | findstr :${settings.API_PORT}`);
        console.error(`2. 다른 포트를 사용하세요: .env 파일에서 API_PORT를 변경`);
        process.exit(1);
      } else {
        throw err;
      }
    });
  } catch (error) {
    console.error('\n✗ Error starting server:', error);
    console.error('\nFull error details:');
    console.error(error);
    process.exit(1);
  }
}

startServer();
