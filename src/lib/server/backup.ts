/**
 * Legacy SQLite backup hook.
 *
 * Supabase/Postgres is now the durable source of truth, so local DB snapshots are disabled.
 */
export async function backupDatabase(): Promise<{
	success: boolean;
	message: string;
	fileName?: string;
}> {
	return {
		success: false,
		message: 'SQLite backups are disabled because the app now uses Supabase PostgreSQL.'
	};
}

/**
 * Backs up the database asynchronously (fire-and-forget)
 * Useful for background backups that shouldn't block the main flow
 */
export function backupDatabaseAsync(): void {
	backupDatabase()
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
