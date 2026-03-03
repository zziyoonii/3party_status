# LLM 서버 모니터링 시스템

LLM 서버의 상태를 모니터링하고 오류 수준에 따라 알림을 생성하는 시스템입니다.

## 주요 기능

- **자동 모니터링**: 설정된 간격으로 LLM 서버 상태 자동 체크
- **OpenAI Status API 연동**: OpenAI 공식 상태 페이지 API를 통한 서비스 상태 모니터링
- **오류 수준 분류**: INFO, WARNING, ERROR, CRITICAL 수준으로 오류 분류
- **알림 시스템**: 오류 수준에 따라 자동 알림 생성
- **REST API**: 모니터링 데이터 조회 및 관리 API 제공
- **통계 및 분석**: 모니터링 통계 및 기록 조회

## 설치 및 실행

### 1. Node.js 설치

Node.js 18 이상이 필요합니다. [Node.js 공식 사이트](https://nodejs.org/)에서 다운로드하세요.

### 2. 의존성 설치

```bash
npm install
```

### 3. 환경 변수 설정 (선택사항)

`.env` 파일을 생성하여 설정을 커스터마이징할 수 있습니다:

```env
DATABASE_URL=sqlite://./monitoring.db
LLM_SERVER_URL=http://localhost:8000
LLM_HEALTH_CHECK_ENDPOINT=/health
OPENAI_STATUS_ENABLED=true
OPENAI_STATUS_API_URL=https://status.openai.com/api/v2
MONITORING_INTERVAL=30
API_HOST=127.0.0.1
API_PORT=8080
```

### 4. 서버 실행

```bash
npm start
```

또는 개발 모드 (자동 재시작):

```bash
npm run dev
```

## API 엔드포인트

### 기본

- `GET /` - API 정보
- `GET /health` - 헬스 체크

### 모니터링

- `POST /monitor/check` - 수동 모니터링 체크 실행
  - Query 파라미터: `provider` (기본값: "custom", "openai" 선택 가능)
- `GET /monitor/records` - 모니터링 기록 조회
  - Query 파라미터: `limit`, `offset`, `status`, `error_level`, `provider`
- `GET /monitor/stats` - 모니터링 통계 조회
  - Query 파라미터: `hours` (기본값: 24)

### 알림

- `GET /alerts` - 알림 목록 조회
  - Query 파라미터: `limit`, `offset`, `resolved`, `error_level`
- `GET /alerts/current` - 현재 활성 알림 조회
- `POST /alerts/{alert_id}/resolve` - 알림 해결 처리

## 오류 수준

- **INFO**: 경미한 문제
- **WARNING**: 주의가 필요한 문제 (기본 임계값: 3건/5분)
- **ERROR**: 심각한 문제 (기본 임계값: 5건/5분)
- **CRITICAL**: 매우 심각한 문제 (기본 임계값: 10건/5분)

## 모니터링 대상

### Custom 서버 (설정된 LLM 서버)
- `.env` 파일의 `LLM_SERVER_URL`로 지정한 서버를 모니터링합니다
- 기본값: `http://localhost:8000` (예시일 뿐, 실제 모니터링할 서버 URL로 변경 필요)
- 해당 서버의 헬스 체크 엔드포인트(`/health`)를 주기적으로 확인
- 응답 시간, HTTP 상태 코드 등을 기록
- **어떤 LLM 서버든 모니터링 가능**: 자체 구축 서버, 외부 API 서버 등

### OpenAI Status API
- OpenAI 공식 상태 페이지 API (`https://status.openai.com/api/v2`)를 모니터링
- 전체 서비스 상태 및 컴포넌트별 상태 확인
- `OPENAI_STATUS_ENABLED=false`로 비활성화 가능

## 데이터베이스

기본적으로 SQLite를 사용하며, `DATABASE_URL` 환경 변수로 변경 가능합니다.

**주의**: 모델에 `provider` 필드가 추가되었으므로, 기존 데이터베이스를 사용 중이라면 마이그레이션이 필요할 수 있습니다. 새로 시작하는 경우 자동으로 생성됩니다.

## Slack 알림 기능

서버 다운 상태가 설정된 시간(기본 5분) 이상 지속될 때 자동으로 Slack 알림을 전송합니다.

### 기능

- **자동 감지**: 서버가 DOWN 또는 DEGRADED 상태로 5분 이상 지속되면 알림 발송
- **중복 방지**: 1시간 이내 동일한 알림은 재발송하지 않음
- **상세 정보**: 다운 지속 시간, 오류 메시지, 마지막 정상 시간 등 포함
- **지원 대상**: Custom LLM 서버 및 OpenAI Status API

### 설정

1. `.env` 파일에 Slack 설정 추가:
   ```env
   SLACK_ENABLED=true
   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
   SLACK_DOWN_DURATION_MINUTES=5
   ```

2. Slack Webhook URL 생성:
   - [Slack API - Incoming Webhooks](https://api.slack.com/messaging/webhooks)에서 앱 추가
   - 알림을 받을 채널 선택 후 Webhook URL 복사

3. 서버 재시작 후 자동으로 알림 기능 활성화

## 향후 계획

- 공지사항 자동 등록 기능 연동
- 띠배너 자동 표시 기능 연동
- 이메일 알림 연동

## 라이선스

MIT

