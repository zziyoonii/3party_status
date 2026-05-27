/**
 * 데이터베이스 연결 및 세션 관리
 */
import { Sequelize } from 'sequelize';
import { settings } from './config.js';

// SQLite 연결 설정
const databaseUrl = settings.DATABASE_URL.replace(/^postgresql:\/\//, 'postgres://');
let sequelize;

if (databaseUrl.startsWith('sqlite://')) {
  // SQLite URL 형식: sqlite://./path/to/db.sqlite 또는 sqlite:///path/to/db.sqlite
  let dbPath = databaseUrl.replace('sqlite://', '');
  // ./로 시작하는 경우 현재 디렉토리 기준으로 처리
  if (dbPath.startsWith('./')) {
    dbPath = dbPath.substring(2);
  }
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: dbPath || './monitoring.db',
    logging: false,
  });
} else {
  // PostgreSQL / MySQL 등 외부 DB
  const isPostgres = databaseUrl.startsWith('postgres');
  sequelize = new Sequelize(databaseUrl, {
    logging: false,
    pool: { max: 3, min: 0, idle: 5000, acquire: 30000 },
    dialectOptions: isPostgres ? {
      ssl: {
        require: true,
        rejectUnauthorized: false, // Railway 자체 서명 인증서 허용
      },
    } : {},
  });
}

export { sequelize };

/**
 * 데이터베이스 초기화
 */
export async function initDb() {
  try {
    await sequelize.authenticate();
    console.log('✓ Database connection established');
    
    // 모델 동기화 (테이블 생성)
    const { MonitoringRecord, Alert } = await import('./models/index.js');
    
    // 기존 테이블이 있으면 alter 대신 안전한 방식 사용
    try {
      await sequelize.sync({ alter: false }); // 테이블이 없으면 생성만
      console.log('✓ Database models synchronized');
    } catch (error) {
      // alter 실패 시 force 옵션으로 재시도 (주의: 데이터 손실 가능)
      if (error.name === 'SequelizeUniqueConstraintError' || error.code === 'SQLITE_CONSTRAINT') {
        console.warn('⚠ Schema 변경 중 오류 발생. 기존 테이블 구조를 확인합니다...');
        // 테이블이 이미 존재하는 경우, alter 없이 진행
        await sequelize.sync({ alter: false });
        console.log('✓ Database models synchronized (existing tables preserved)');
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('✗ Database initialization error:', error);
    throw error;
  }
}
