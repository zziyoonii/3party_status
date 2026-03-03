/**
 * 데이터베이스 모델 정의
 */
import { DataTypes } from 'sequelize';
import { sequelize } from '../database.js';

// Enum 정의
export const ErrorLevel = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
  CRITICAL: 'CRITICAL',
};

export const ServerStatus = {
  HEALTHY: 'HEALTHY',
  DEGRADED: 'DEGRADED',
  DOWN: 'DOWN',
  UNKNOWN: 'UNKNOWN',
};

// 모니터링 기록 모델
export const MonitoringRecord = sequelize.define('MonitoringRecord', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false,
    index: true, // 인덱스 추가 (시간 기반 쿼리 성능 향상)
  },
  server_url: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  provider: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'custom', // "openai" or "custom"
    index: true, // 인덱스 추가 (provider 필터링 성능 향상)
  },
  status: {
    type: DataTypes.ENUM(...Object.values(ServerStatus)),
    allowNull: false,
  },
  response_time_ms: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  error_message: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  error_level: {
    type: DataTypes.ENUM(...Object.values(ErrorLevel)),
    allowNull: true,
  },
  http_status_code: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  additional_data: {
    type: DataTypes.TEXT,
    allowNull: true, // JSON 형태로 추가 데이터 저장
  },
}, {
  tableName: 'monitoring_records',
  timestamps: false,
});

// 알림 기록 모델
export const Alert = sequelize.define('Alert', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false,
  },
  error_level: {
    type: DataTypes.ENUM(...Object.values(ErrorLevel)),
    allowNull: false,
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  resolved: {
    type: DataTypes.INTEGER,
    defaultValue: 0, // 0: 미해결, 1: 해결됨
  },
  resolved_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'alerts',
  timestamps: false,
});
