import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = process.env.DATABASE_PATH || join(dirname(__dirname), 'dreams.db');
const databaseUrl = process.env.DATABASE_URL;

let db = null;

export async function getDatabase() {
  if (!db) {
    if (databaseUrl) {
      const pool = new Pool({
        connectionString: databaseUrl,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
      });

      db = {
        async exec(sql) {
          await pool.query(sql.replace(/AUTOINCREMENT/g, ''));
        },
        async all(sql, params = []) {
          return (await pool.query(toPostgresSql(sql), params)).rows;
        },
        async get(sql, params = []) {
          return (await pool.query(toPostgresSql(sql), params)).rows[0];
        },
        async run(sql, params = []) {
          const postgresSql = /^\s*INSERT\s/i.test(sql) && !/\bRETURNING\b/i.test(sql)
            ? `${sql} RETURNING id`
            : sql;
          const result = await pool.query(toPostgresSql(postgresSql), params);
          return { changes: result.rowCount, lastID: result.rows[0]?.id };
        },
        async close() {
          await pool.end();
        }
      };
    } else {
      db = await open({
        filename: dbPath,
        driver: sqlite3.Database
      });

      await db.exec('PRAGMA foreign_keys = ON');
    }
  }
  return db;
}

function toPostgresSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

export async function closeDatabase() {
  if (db) {
    await db.close();
    db = null;
  }
}

export default { getDatabase, closeDatabase };
