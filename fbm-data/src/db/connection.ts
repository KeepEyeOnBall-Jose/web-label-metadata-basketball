import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, '..', '..', 'data');
const DB_PATH = join(DATA_DIR, 'fbm.db');
const SCHEMA_PATH = join(__dirname, 'schema.sql');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
    if (db) return db;

    // Ensure data directory exists
    if (!existsSync(DATA_DIR)) {
        mkdirSync(DATA_DIR, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Apply schema
    const schema = readFileSync(SCHEMA_PATH, 'utf-8');
    db.exec(schema);

    return db;
}

export function closeDb(): void {
    if (db) {
        db.close();
        db = null;
    }
}

export { DATA_DIR, DB_PATH };
