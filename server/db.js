const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/coffee_order_db',
});

// 테이블이 없으면 생성하는 안전한 초기화 함수
async function initDb() {
  try {
    const initSqlPath = path.join(__dirname, 'init.sql');
    const sql = fs.readFileSync(initSqlPath, 'utf8');
    await pool.query(sql);
    console.log('Database initialized successfully.');
  } catch (err) {
    console.error('Error initializing database. Ensure the database coffee_order_db exists and credentials are correct.', err.message);
  }
}

module.exports = {
  pool,
  initDb
};
