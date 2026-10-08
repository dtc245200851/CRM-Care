
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'crm_db',
  user: process.env.DB_USER || 'crm_user',
  password: process.env.DB_PASSWORD,
});

module.exports = pool;
