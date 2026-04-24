import type { Handle } from '@sveltejs/kit';
import { Storage } from '@google-cloud/storage';
import { GCS_BUCKET_NAME } from '$lib/server/secrets';

// Created once at module load — every request awaits this before touching the DB.
// On a cold Cloud Run start, imagine.db won't exist, so we pull the latest backup
// from GCS before any handler runs. On warm containers and local dev the file is
// already present and the restore is skipped immediately.
const dbReady: Promise<void> = restoreLatestBackupIfNeeded();

async function restoreLatestBackupIfNeeded(): Promise<void> {
	const fs = await import('fs/promises');

	try {
		await fs.access('imagine.db');
		console.log('[startup] DB file already exists — skipping restore');
		return;
	} catch {
		console.log('[startup] No DB file found — attempting GCS backup restore');
	}

	if (!GCS_BUCKET_NAME) {
		console.warn('[startup] GCS_BUCKET_NAME not set — starting with fresh DB');
		return;
	}

	try {
		const storage = new Storage();
		const bucket = storage.bucket(GCS_BUCKET_NAME);

		const [files] = await bucket.getFiles({ prefix: 'backups/' });
		const backups = files
			.filter((f) => f.name.endsWith('.db'))
			.sort((a, b) => {
				const tA = new Date(a.metadata.timeCreated as string).getTime();
				const tB = new Date(b.metadata.timeCreated as string).getTime();
				return tB - tA;
			});

		if (backups.length === 0) {
			console.log('[startup] No backups found in GCS — starting with fresh DB');
			return;
		}

		const latest = backups[0];
		console.log(`[startup] Restoring from ${latest.name}`);
		await latest.download({ destination: 'imagine.db' });
		console.log('[startup] DB restored successfully');
	} catch (error) {
		console.error('[startup] GCS restore failed:', error);
		console.log('[startup] Proceeding with fresh DB');
	}
}

export const handle: Handle = async ({ event, resolve }) => {
	// Every request — page loads, form actions, API routes — waits here until
	// the DB file is guaranteed to be on disk. After the first request this
	// resolves instantly because the promise is already fulfilled.
	await dbReady;

	const session = event.cookies.get('session');
	if (session === 'admin') {
		event.locals.user = { isAdmin: true };
	}

	return resolve(event);
};
