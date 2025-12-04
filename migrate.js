import 'dotenv/config';
import { readFileSync } from 'fs';
import pool from './src/Database/db.js';

async function runMigrations() {
  try {
    console.log('Running migrations...');
    const sql = readFileSync('./migrations/001_create_documents_chunks.sql', 'utf8');
    await pool.query(sql);
    console.log('✅ Migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigrations();
