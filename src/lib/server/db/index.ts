import Database from 'better-sqlite3';
import { schema } from './schema';

let db: Database.Database;

function initializeDb() {
	const newDb = new Database('imagine.db');
	// Enable WAL mode for better concurrency
	newDb.pragma('journal_mode = WAL');
	// Initialize the database with the schema
	newDb.exec(schema);
	return newDb;
}

export function getDb() {
	if (!db || !db.open) {
		db = initializeDb();
	}
	return db;
}

// Close the connection gracefully on exit
process.on('exit', () => {
	if (db && db.open) {
		db.close();
	}
});
