import { getDb } from '$lib/server/db';
import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import type { User, Lesson, Story } from '$lib/types';
import { GCS_BUCKET_NAME } from '$lib/server/secrets';
import { Storage } from '@google-cloud/storage';

export const load: PageServerLoad = async () => {
	const db = getDb();
	const users = db.prepare('SELECT * FROM users').all() as User[];
	const lessons = db.prepare('SELECT * FROM lessons').all() as Lesson[];
	const stories = db.prepare('SELECT * FROM stories ORDER BY created_at DESC').all() as Story[];

	let backups: { name: string; timeCreated: string }[] = [];
	try {
		if (GCS_BUCKET_NAME) {
			const storage = new Storage();
			const bucket = storage.bucket(GCS_BUCKET_NAME);
			const [files] = await bucket.getFiles({ prefix: 'backups/' });
			backups = files
				.filter((file) => file.name.endsWith('.db'))
				.map((file) => ({
					name: file.name,
					timeCreated: file.metadata.timeCreated as string
				}))
				.sort((a, b) => new Date(b.timeCreated).getTime() - new Date(a.timeCreated).getTime());
		}
	} catch (error) {
		console.error('Failed to fetch backups:', error);
	}

	return {
		users,
		lessons,
		stories,
		backups
	};
};

export const actions: Actions = {
	addUser: async ({ request }) => {
		const data = await request.formData();
		const name = data.get('name');
		const grade = data.get('grade');
		const gender = data.get('gender');

		if (!name || !grade || !gender) {
			return fail(400, { message: 'All user fields are required' });
		}
		const db = getDb();
		db.prepare('INSERT INTO users (name, grade, gender) VALUES (?, ?, ?)').run(name, grade, gender);
		return { success: true };
	},

	deleteUser: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id');
		const db = getDb();
		db.prepare('DELETE FROM users WHERE id = ?').run(id);
		return { success: true };
	},

	addLesson: async ({ request }) => {
		const data = await request.formData();
		const lesson = data.get('lesson');

		if (!lesson) {
			return fail(400, { message: 'Lesson text is required' });
		}
		const db = getDb();
		db.prepare('INSERT INTO lessons (lesson) VALUES (?)').run(lesson);
		return { success: true };
	},

	deleteLesson: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id');
		const db = getDb();
		db.prepare('DELETE FROM lessons WHERE id = ?').run(id);
		return { success: true };
	},

	deleteStory: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id');
		const db = getDb();
		db.prepare('DELETE FROM stories WHERE id = ?').run(id);
		return { success: true };
	},

	backupDatabase: async () => {
		try {
			const { GCS_BUCKET_NAME } = await import('$lib/server/secrets');
			const { Storage } = await import('@google-cloud/storage');
			const fs = await import('fs/promises');

			if (!GCS_BUCKET_NAME) {
				return fail(500, { message: 'GCS_BUCKET_NAME is not configured.' });
			}

			const storage = new Storage();
			const bucket = storage.bucket(GCS_BUCKET_NAME);

			const db = getDb();
			// Close the connection to ensure WAL is flushed to the main DB file
			db.close();

			const dbBuffer = await fs.readFile('imagine.db');
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
			const fileName = `backups/backup-${timestamp}.db`;
			const file = bucket.file(fileName);

			await file.save(dbBuffer);

			return { success: true, message: `Database backed up to ${fileName}` };
		} catch (error) {
			console.error('Database backup failed:', error);
			return fail(500, { message: 'Database backup failed.' });
		}
	},

	restoreDatabase: async ({ request }) => {
		const data = await request.formData();
		const fileName = data.get('fileName');

		if (!fileName || typeof fileName !== 'string') {
			return fail(400, { message: 'File name is required.' });
		}

		try {
			const { GCS_BUCKET_NAME } = await import('$lib/server/secrets');
			const { Storage } = await import('@google-cloud/storage');
			const fs = await import('fs/promises');

			if (!GCS_BUCKET_NAME) {
				return fail(500, { message: 'GCS_BUCKET_NAME is not configured.' });
			}

			const storage = new Storage();
			const bucket = storage.bucket(GCS_BUCKET_NAME);
			const file = bucket.file(fileName);

			const tempPath = 'imagine.db.tmp';
			await file.download({ destination: tempPath });

			const db = getDb();
			db.close();

			await fs.rename(tempPath, 'imagine.db');

			return { success: true, message: 'Database restored successfully. Please restart the server.' };
		} catch (error) {
			console.error('Database restore failed:', error);
			return fail(500, { message: 'Database restore failed.' });
		}
	}
};
