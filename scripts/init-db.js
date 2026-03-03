/**
 * 데이터베이스 초기화 스크립트
 */
import { initDb } from '../database.js';

async function main() {
  try {
    console.log('Initializing database...');
    await initDb();
    console.log('✓ Database initialized successfully');
    process.exit(0);
  } catch (error) {
    console.error('✗ Database initialization failed:', error);
    process.exit(1);
  }
}

main();
