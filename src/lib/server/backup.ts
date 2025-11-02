import { GCS_BUCKET_NAME } from './secrets';
import { Storage } from '@google-cloud/storage';
import { getDb } from './db';

/**
 * Backs up the database to Google Cloud Storage
 * @param closeDb - Whether to close the database connection (default: false)
 * @returns Promise with success status and message
 */
export async function backupDatabase(closeDb = false): Promise<{
	success: boolean;
	message: string;
	fileName?: string;
}> {
	try {
		if (!GCS_BUCKET_NAME) {
			throw new Error('GCS_BUCKET_NAME is not configured');
		}

		const storage = new Storage();
		const bucket = storage.bucket(GCS_BUCKET_NAME);
		const fs = await import('fs/promises');

		// Close the connection if requested (ensures WAL is flushed to the main DB file)
		if (closeDb) {
			const db = getDb();
			db.close();
		}

		const dbBuffer = await fs.readFile('imagine.db');
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const fileName = `backups/backup-${timestamp}.db`;
		const file = bucket.file(fileName);

		await file.save(dbBuffer);

		console.log(`✓ Database backed up successfully to ${fileName}`);
		return {
			success: true,
			message: `Database backed up to ${fileName}`,
			fileName
		};
	} catch (error) {
		console.error('✗ Database backup failed:', error);
		return {
			success: false,
			message: `Database backup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Backs up the database asynchronously (fire-and-forget)
 * Useful for background backups that shouldn't block the main flow
 */
export function backupDatabaseAsync(): void {
	backupDatabase(false)
		.then((result) => {
			if (result.success) {
				console.log('Background backup completed:', result.message);
			} else {
				console.error('Background backup failed:', result.message);
			}
		})
		.catch((error) => {
			console.error('Background backup error:', error);
		});
}
