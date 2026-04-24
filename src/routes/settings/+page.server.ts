import { getDb } from '$lib/server/db';
import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import type { User, Lesson, Story, MathSettings, MathSessionSummary, SpellingWord, SpellingSessionSummary } from '$lib/types';
import { GCS_BUCKET_NAME, getGeminiApiKey } from '$lib/server/secrets';
import { Storage } from '@google-cloud/storage';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { backupDatabase } from '$lib/server/backup';

export const load: PageServerLoad = async () => {
	const db = getDb();
	const users = db.prepare('SELECT * FROM users').all() as User[];
	const lessons = db.prepare('SELECT * FROM lessons').all() as Lesson[];
	const stories = db.prepare('SELECT * FROM stories ORDER BY created_at DESC').all() as Story[];
	const storiesWithoutImages = db
		.prepare('SELECT * FROM stories WHERE image_url IS NULL ORDER BY created_at DESC')
		.all() as Story[];

	let backups: { name: string; timeCreated: string }[] = [];
	let availableImages: { url: string; name: string; timeCreated: string }[] = [];
	let gcsError: string | null = null;

	try {
		if (!GCS_BUCKET_NAME) {
			gcsError = 'GCS_BUCKET_NAME environment variable is not configured';
			console.warn('GCS_BUCKET_NAME not set - image assignment features will be limited');
		} else {
			// const storage = new Storage();
			const storage = new Storage();
			const bucket = storage.bucket(GCS_BUCKET_NAME);

			// Fetch backups
			try {
				const [backupFiles] = await bucket.getFiles({ prefix: 'backups/' });
				backups = backupFiles
					.filter((file) => file.name.endsWith('.db'))
					.map((file) => ({
						name: file.name,
						timeCreated: file.metadata.timeCreated as string
					}))
					.sort((a, b) => new Date(b.timeCreated).getTime() - new Date(a.timeCreated).getTime());
			} catch (backupError) {
				console.error('Failed to fetch backups:', backupError);
				if (!gcsError) {
					gcsError = 'Failed to fetch backups from Google Cloud Storage';
				}
			}

			// Fetch available images
			try {
				const [imageFiles] = await bucket.getFiles({ prefix: 'imagine-by-lai/story-' });
				const allImages = await Promise.all(
					imageFiles
						.filter((file) => file.name.endsWith('.png'))
						.sort((a, b) => {
							const timeA = new Date(a.metadata.timeCreated as string).getTime();
							const timeB = new Date(b.metadata.timeCreated as string).getTime();
							return timeB - timeA; // Most recent first
						})
						.map(async (file) => {
							const [url] = await file.getSignedUrl({
								action: 'read',
								expires: '03-09-2491'
							});
							return {
								url,
								name: file.name.replace('imagine-by-lai/', ''),
								timeCreated: file.metadata.timeCreated as string
							};
						})
				);

				const storyImageUrls = new Set(stories.map((s) => s.image_url).filter(Boolean));
				availableImages = allImages.filter((img) => !storyImageUrls.has(img.url));
			} catch (imageError) {
				console.error('Failed to fetch images:', imageError);
				if (!gcsError) {
					gcsError = 'Failed to fetch images from Google Cloud Storage';
				}
			}
		}
	} catch (error) {
		console.error('Failed to initialize GCS:', error);
		gcsError = `Google Cloud Storage error: ${error instanceof Error ? error.message : 'Unknown error'}`;
	}

	const mathSettings = db.prepare('SELECT * FROM math_settings').all() as MathSettings[];
	const mathStats = db
		.prepare(
			`SELECT u.name as user_name, ma.session_id,
              MIN(ma.created_at) as started_at,
              COUNT(*) as total,
              SUM(ma.is_correct) as correct
       FROM math_attempts ma
       LEFT JOIN users u ON ma.user_id = u.id
       GROUP BY ma.session_id
       ORDER BY started_at DESC
       LIMIT 100`
		)
		.all() as MathSessionSummary[];

	const spellingWords = db.prepare('SELECT * FROM spelling_words ORDER BY grade, word').all() as SpellingWord[];
	const spellingStats = db
		.prepare(
			`SELECT u.name as user_name, sa.session_id, sa.grade,
              MIN(sa.created_at) as started_at,
              COUNT(*) as total,
              SUM(sa.is_correct) as correct
       FROM spelling_attempts sa
       LEFT JOIN users u ON sa.user_id = u.id
       GROUP BY sa.session_id
       ORDER BY started_at DESC
       LIMIT 100`
		)
		.all() as SpellingSessionSummary[];

	return {
		users,
		lessons,
		stories,
		storiesWithoutImages,
		availableImages,
		backups,
		gcsError,
		mathSettings,
		mathStats,
		spellingWords,
		spellingStats
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

	assignImageToStory: async ({ request }) => {
		const data = await request.formData();
		const storyId = data.get('storyId');
		const imageUrl = data.get('imageUrl');

		if (!storyId || !imageUrl) {
			return fail(400, { message: 'Story ID and image URL are required.' });
		}

		if (typeof storyId !== 'string' || typeof imageUrl !== 'string') {
			return fail(400, { message: 'Invalid data format.' });
		}

		try {
			const db = getDb();

			// Verify the story exists
			const story = db.prepare('SELECT id FROM stories WHERE id = ?').get(storyId);
			if (!story) {
				return fail(404, { message: 'Story not found.' });
			}

			// Update the story with the image URL
			db.prepare('UPDATE stories SET image_url = ? WHERE id = ?').run(imageUrl, storyId);

			return {
				success: true,
				message: `Image successfully assigned to story #${storyId}`,
				storyId
			};
		} catch (error) {
			console.error('Failed to assign image to story:', error);
			return fail(500, { message: 'Failed to assign image to story.' });
		}
	},

	backupDatabase: async () => {
		try {
			// Use the shared backup utility with closeDb=true for manual backups
			const result = await backupDatabase(true);

			if (result.success) {
				return { success: true, message: result.message };
			} else {
				return fail(500, { message: result.message });
			}
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

			// const storage = new Storage();
			const storage = new Storage();
			const bucket = storage.bucket(GCS_BUCKET_NAME);
			const file = bucket.file(fileName);

			const tempPath = 'imagine.db.tmp';
			await file.download({ destination: tempPath });

			const db = getDb();
			db.close();

			await fs.rename(tempPath, 'imagine.db');

			return {
				success: true,
				message: 'Database restored successfully. Please restart the server.'
			};
		} catch (error) {
			console.error('Database restore failed:', error);
			return fail(500, { message: 'Database restore failed.' });
		}
	},

	saveMathSettings: async ({ request }) => {
		const data = await request.formData();
		const userId = data.get('userId');
		const maxNumber = data.get('maxNumber');
		const rawOps = data.getAll('operations');

		if (!userId || !maxNumber || rawOps.length === 0) {
			return fail(400, { message: 'Math settings: userId, maxNumber, and at least one operation are required.' });
		}

		const operations = rawOps.join(',');
		const db = getDb();
		db.prepare(
			`INSERT INTO math_settings (user_id, operations, max_number, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET
         operations = excluded.operations,
         max_number = excluded.max_number,
         updated_at = CURRENT_TIMESTAMP`
		).run(userId, operations, parseInt(maxNumber as string));

		return { success: true };
	},

	addSpellingWord: async ({ request }) => {
		const data = await request.formData();
		const word = (data.get('word') as string)?.trim().toLowerCase();
		const grade = data.get('grade') as string;

		if (!word || !grade) {
			return fail(400, { message: 'Word and grade are required.' });
		}

		const db = getDb();
		const exists = db.prepare('SELECT id FROM spelling_words WHERE word = ? AND grade = ?').get(word, grade);
		if (exists) {
			return fail(400, { message: `"${word}" already exists for grade ${grade}.` });
		}
		db.prepare('INSERT INTO spelling_words (word, grade) VALUES (?, ?)').run(word, grade);
		return { success: true };
	},

	deleteSpellingWord: async ({ request }) => {
		const data = await request.formData();
		const id = data.get('id');
		const db = getDb();
		db.prepare('DELETE FROM spelling_words WHERE id = ?').run(id);
		return { success: true };
	},

	clearSpellingStats: async ({ request }) => {
		const data = await request.formData();
		const grade = data.get('grade');
		const db = getDb();
		if (grade) {
			db.prepare('DELETE FROM spelling_attempts WHERE grade = ?').run(grade);
		} else {
			db.prepare('DELETE FROM spelling_attempts').run();
		}
		return { success: true };
	},

	clearMathStats: async ({ request }) => {
		const data = await request.formData();
		const userId = data.get('userId');
		const db = getDb();
		if (userId) {
			db.prepare('DELETE FROM math_attempts WHERE user_id = ?').run(userId);
		} else {
			db.prepare('DELETE FROM math_attempts').run();
		}
		return { success: true };
	},

	createStoryFromImage: async ({ request }) => {
		const data = await request.formData();
		const imageUrl = data.get('imageUrl');
		const prompt = data.get('prompt');

		if (!imageUrl || !prompt || typeof imageUrl !== 'string' || typeof prompt !== 'string') {
			return fail(400, { message: 'Image URL and prompt are required.' });
		}

		try {
			const apiKey = await getGeminiApiKey();
			const genAI = new GoogleGenerativeAI(apiKey);
			const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-image' });

			// const storage = new Storage();
			const storage = new Storage();
			const url = new URL(imageUrl);
			console.log('URL:', url);
			const parts = url.pathname.split('/');

			const bucketName = parts[1];
			const fileName = parts.slice(2).join('/');

			const bucket = storage.bucket(bucketName);
			const file = bucket.file(decodeURIComponent(fileName));
			const [imageBuffer] = await file.download();

			const imagePart = {
				inlineData: {
					data: imageBuffer.toString('base64'),
					mimeType: 'image/png'
				}
			};
			const completePrompt = `Create a short, exciting, and creative story for a young reader based on the following idea: "${prompt}". The story should be about 5 minutes to read and include a positive life lesson. At the very beginning, on a new line, write a short, simple sentence describing the main scene for an illustration.`;
			const result = await model.generateContent([completePrompt, imagePart]);
			const storyContent = result.response.text();

			const db = getDb();
			const info = db
				.prepare(
					'INSERT INTO stories (prompt, content, image_url, grade_level) VALUES (?, ?, ?, ?)'
				)
				.run(prompt, storyContent, imageUrl, '1');

			throw redirect(303, `/story/${info.lastInsertRowid}`);
		} catch (error) {
			console.error('Failed to create story from image:', error);
			return fail(500, { message: 'Failed to create story from image.' });
		}
	}
};
