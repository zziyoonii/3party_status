/**
 * LLM 서버 모니터링 설정
 */
import dotenv from 'dotenv';

dotenv.config();

export const settings = {
  // 데이터베이스 설정
  DATABASE_URL: process.env.DATABASE_URL || 'sqlite://./monitoring.db',
  
  // LLM 서버 설정 (우리 서비스 모니터링 - 기본값: false, 외부 서비스 모니터링에 집중)
  CUSTOM_SERVER_ENABLED: process.env.CUSTOM_SERVER_ENABLED === 'true', // 기본값: false
  LLM_SERVER_URL: process.env.LLM_SERVER_URL || 'http://localhost:8000',
  LLM_HEALTH_CHECK_ENDPOINT: process.env.LLM_HEALTH_CHECK_ENDPOINT || '/health',
  LLM_API_TIMEOUT: parseInt(process.env.LLM_API_TIMEOUT || '10', 10), // 초
  
  // OpenAI Status API 설정
  OPENAI_STATUS_ENABLED: process.env.OPENAI_STATUS_ENABLED !== 'false', // 기본값: true (공개 API, 인증 불필요)
  OPENAI_STATUS_API_URL: process.env.OPENAI_STATUS_API_URL || 'https://status.openai.com/api/v2',
  OPENAI_STATUS_TIMEOUT: parseInt(process.env.OPENAI_STATUS_TIMEOUT || '10', 10), // 초
  
  // Claude Status API 설정
  CLAUDE_STATUS_ENABLED: process.env.CLAUDE_STATUS_ENABLED !== 'false', // 기본값: true (공개 API, 인증 불필요)
  CLAUDE_STATUS_API_URL: process.env.CLAUDE_STATUS_API_URL || 'https://status.anthropic.com/api/v2',
  CLAUDE_STATUS_TIMEOUT: parseInt(process.env.CLAUDE_STATUS_TIMEOUT || '10', 10), // 초
  
  // Gemini Status 설정 (Google Cloud Status API 사용, API 키 있으면 Gemini API 직접 호출)
  GEMINI_STATUS_ENABLED: process.env.GEMINI_STATUS_ENABLED !== 'false', // 기본값: true
  GEMINI_API_URL: process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '', // Gemini API 키 (선택사항, 없으면 Google Cloud Status API 사용)
  GEMINI_STATUS_TIMEOUT: parseInt(process.env.GEMINI_STATUS_TIMEOUT || '10', 10), // 초
  
  // 외부 서비스 모니터링 설정
  // Cloudflare Status API 설정
  CLOUDFLARE_STATUS_ENABLED: process.env.CLOUDFLARE_STATUS_ENABLED !== 'false', // 기본값: true (공개 API, 인증 불필요)
  CLOUDFLARE_STATUS_API_URL: process.env.CLOUDFLARE_STATUS_API_URL || 'https://www.cloudflarestatus.com/api/v2',
  CLOUDFLARE_STATUS_TIMEOUT: parseInt(process.env.CLOUDFLARE_STATUS_TIMEOUT || '10', 10), // 초
  
  // Twilio Status API 설정
  TWILIO_STATUS_ENABLED: process.env.TWILIO_STATUS_ENABLED !== 'false', // 기본값: true (공개 API, 인증 불필요)
  TWILIO_STATUS_API_URL: process.env.TWILIO_STATUS_API_URL || 'https://status.twilio.com/api/v2',
  TWILIO_STATUS_TIMEOUT: parseInt(process.env.TWILIO_STATUS_TIMEOUT || '10', 10), // 초
  
  // 채널톡 Status API 설정 (Statuspage.io 사용)
  CHANNELTALK_STATUS_ENABLED: process.env.CHANNELTALK_STATUS_ENABLED !== 'false', // 기본값: true (공개 API, 인증 불필요)
  CHANNELTALK_STATUS_API_URL: process.env.CHANNELTALK_STATUS_API_URL || 'https://status.channel.io/api/v2',
  CHANNELTALK_STATUS_TIMEOUT: parseInt(process.env.CHANNELTALK_STATUS_TIMEOUT || '10', 10), // 초
  
  // AWS Status 설정 (공식 Statuspage.io API 없음 → 상태 페이지 도달 가능성으로 모니터링)
  AWS_STATUS_ENABLED: process.env.AWS_STATUS_ENABLED !== 'false', // 기본값: true
  AWS_STATUS_URL: process.env.AWS_STATUS_URL || 'https://status.aws.amazon.com',
  AWS_STATUS_TIMEOUT: parseInt(process.env.AWS_STATUS_TIMEOUT || '10', 10), // 초
  
  // OpenAI API 직접 모니터링 설정 (실제 API 호출, API 키 필요)
  OPENAI_API_ENABLED: process.env.OPENAI_API_ENABLED === 'true', // 기본값: false (API 키 필요)
  OPENAI_API_URL: process.env.OPENAI_API_URL || 'https://api.openai.com/v1',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '', // OpenAI API 키 (선택사항, 없으면 인증 없이 호출)
  OPENAI_API_TIMEOUT: parseInt(process.env.OPENAI_API_TIMEOUT || '10', 10), // 초
  
  // 모니터링 설정
  MONITORING_INTERVAL: parseInt(process.env.MONITORING_INTERVAL || '60', 10), // 초 (기본값: 1분, 대시보드 자동 갱신 주기와 일치)
  HEALTH_CHECK_TIMEOUT: parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5', 10), // 초
  
  // 오류 수준 임계값 설정
  ERROR_THRESHOLD_WARNING: parseInt(process.env.ERROR_THRESHOLD_WARNING || '3', 10), // WARNING 수준 오류 개수
  ERROR_THRESHOLD_ERROR: parseInt(process.env.ERROR_THRESHOLD_ERROR || '5', 10), // ERROR 수준 오류 개수
  ERROR_THRESHOLD_CRITICAL: parseInt(process.env.ERROR_THRESHOLD_CRITICAL || '10', 10), // CRITICAL 수준 오류 개수
  
  // 시간 윈도우 (분)
  ERROR_WINDOW_MINUTES: parseInt(process.env.ERROR_WINDOW_MINUTES || '5', 10),
  
  // API 서버 설정
  API_HOST: process.env.API_HOST || '0.0.0.0',
  API_PORT: parseInt(process.env.PORT || process.env.API_PORT || '8080', 10),
  
  // Slack 알림 설정
  SLACK_ENABLED: process.env.SLACK_ENABLED === 'true',
  SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL || '',
  SLACK_DOWN_DURATION_MINUTES: parseInt(process.env.SLACK_DOWN_DURATION_MINUTES || '5', 10), // 다운 지속 시간 (분)
  
  // 알림 관리 설정
  ALERT_AUTO_RESOLVE_ENABLED: process.env.ALERT_AUTO_RESOLVE_ENABLED !== 'false', // 서버 정상 복구 시 자동 해결
  ALERT_MAX_ACTIVE: parseInt(process.env.ALERT_MAX_ACTIVE || '30', 10), // 최대 활성 알림 개수
  ALERT_CLEANUP_DAYS: parseInt(process.env.ALERT_CLEANUP_DAYS || '1', 10), // 해결된 알림 보관 기간 (일)
};
