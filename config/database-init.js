import { getDatabase } from './database.js';

// Create dreams table if it doesn't exist
export async function initDatabase() {
  try {
    const db = await getDatabase();
    const tableDefinition = process.env.DATABASE_URL
      ? `
        CREATE TABLE IF NOT EXISTS dreams (
          id SERIAL PRIMARY KEY,
          dream_text TEXT NOT NULL,
          interpretation TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `
      : `
        CREATE TABLE IF NOT EXISTS dreams (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          dream_text TEXT NOT NULL,
          interpretation TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;

    await db.exec(tableDefinition);
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}
