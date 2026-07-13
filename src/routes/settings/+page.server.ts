import { getSupabase, getSupabaseErrorMessage, throwSupabaseError } from '$lib/server/db';
import { fail, isRedirect, redirect, error as kitError } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type {
	Lesson,
	MathSessionSummary,
	MathSettings,
	SpellingSessionSummary,
	SpellingWord,
	Story,
	User
} from '$lib/types';
import { GCS_BUCKET_NAME } from '$lib/server/secrets';
import { getGeminiImageModel } from '$lib/server/ai';
import {
	downloadImageFromGcsUrl,
	deleteStoryImageObject,
	listUnassignedStoryImages,
	objectNameFromGcsUrl,
	uploadStoryImage
} from '$lib/server/image-storage';

function mapUser(row: any): User {
	return { ...row, user_id: row.id } as User;
}

function mapStory(row: any): Story {
	return { ...row, user_id: row.child_id } as Story;
}

function mapMathSettings(row: any): MathSettings {
	return { ...row, user_id: row.child_id, config: row.config ?? {} } as MathSettings;
}

function groupMathStats(rows: any[]): MathSessionSummary[] {
	const grouped = new Map<string, MathSessionSummary>();

	for (const row of rows) {
		const existing = grouped.get(row.session_id);
		if (!existing) {
			grouped.set(row.session_id, {
				child_name: row.child_profiles?.name ?? null,
				user_name: row.child_profiles?.name ?? null,
				session_id: row.session_id,
				started_at: row.created_at,
				total: 0,
				correct: 0
			});
		}

		const session = grouped.get(row.session_id)!;
		session.total += 1;
		if (row.is_correct) session.correct += 1;
		if (new Date(row.created_at).getTime() < new Date(session.started_at).getTime()) {
			session.started_at = row.created_at;
		}
	}

	return [...grouped.values()]
		.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
		.slice(0, 100);
}

function groupSpellingStats(rows: any[]): SpellingSessionSummary[] {
	const grouped = new Map<string, SpellingSessionSummary>();

	for (const row of rows) {
		const key = `${row.session_id}:${row.grade}`;
		const existing = grouped.get(key);
		if (!existing) {
			grouped.set(key, {
				child_name: row.child_profiles?.name ?? null,
				user_name: row.child_profiles?.name ?? null,
				session_id: row.session_id,
				started_at: row.created_at,
				total: 0,
				correct: 0,
				grade: row.grade
			});
		}

		const session = grouped.get(key)!;
		session.total += 1;
		if (row.is_correct) session.correct += 1;
		if (new Date(row.created_at).getTime() < new Date(session.started_at).getTime()) {
			session.started_at = row.created_at;
		}
	}

	return [...grouped.values()]
		.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
		.slice(0, 100);
}

async function generateAndUploadStoryImage(story: Story): Promise<{
	imageUrl: string;
	imageObjectName: string;
}> {
	const model = await getGeminiImageModel();
	const storyExcerpt = story.content.replace(/\s+/g, ' ').trim().slice(0, 1200);
	const prompt = [
		'Create a warm, colorful children storybook illustration.',
		`Story idea: ${story.prompt}`,
		`Grade level: ${story.grade_level}`,
		storyExcerpt ? `Story excerpt: ${storyExcerpt}` : '',
		'Show one clear main scene. Avoid text, captions, logos, or watermarks.'
	]
		.filter(Boolean)
		.join('\n');

	const imageResponse = await model.generateContent(prompt);
	let imageBuffer: Buffer | null = null;

	for (const part of imageResponse.response.candidates?.[0]?.content.parts ?? []) {
		if (part.inlineData?.data) {
			imageBuffer = Buffer.from(part.inlineData.data, 'base64');
			break;
		}
	}

	if (!imageBuffer) {
		throw new Error('Image generation returned no image data.');
	}

	const storedImage = await uploadStoryImage(imageBuffer);
	return {
		imageUrl: storedImage.url,
		imageObjectName: storedImage.objectName
	};
}

export const load: PageServerLoad = async () => {
	let usersResult;
	let lessonsResult;
	let storiesResult;
	let storiesWithoutImagesResult;
	let mathSettingsResult;
	let mathAttemptsResult;
	let spellingWordsResult;
	let spellingAttemptsResult;

	try {
		const supabase = await getSupabase();
		[
			usersResult,
			lessonsResult,
			storiesResult,
			storiesWithoutImagesResult,
			mathSettingsResult,
			mathAttemptsResult,
			spellingWordsResult,
			spellingAttemptsResult
		] = await Promise.all([
			supabase.from('child_profiles').select('*').order('name', { ascending: true }),
			supabase.from('lessons').select('*').order('lesson', { ascending: true }),
			supabase
				.from('stories')
				.select('*')
				.not('image_url', 'is', null)
				.neq('image_url', '')
				.order('created_at', { ascending: false }),
			supabase
				.from('stories')
				.select('*')
				.or('image_url.is.null,image_url.eq.')
				.order('created_at', { ascending: false }),
			supabase.from('math_settings').select('*').order('child_id', { ascending: true }),
			supabase
				.from('math_attempts')
				.select('session_id, created_at, is_correct, child_profiles(name)')
				.order('created_at', { ascending: false })
				.limit(1000),
			supabase
				.from('spelling_words')
				.select('*')
				.order('grade', { ascending: true })
				.order('word', { ascending: true }),
			supabase
				.from('spelling_attempts')
				.select('session_id, created_at, is_correct, grade, child_profiles(name)')
				.order('created_at', { ascending: false })
				.limit(1000)
		]);

		const namedResults = [
			['child profiles', usersResult],
			['lessons', lessonsResult],
			['stories', storiesResult],
			['stories without images', storiesWithoutImagesResult],
			['math settings', mathSettingsResult],
			['math attempts', mathAttemptsResult],
			['spelling words', spellingWordsResult],
			['spelling attempts', spellingAttemptsResult]
		] as const;

		for (const [name, result] of namedResults) {
			if (result.error) throwSupabaseError(`loading admin ${name}`, result.error);
		}
	} catch (error) {
		throw kitError(503, getSupabaseErrorMessage(error));
	}

	const stories = (storiesResult.data ?? []).map(mapStory);
	let availableImages: { url: string; objectName: string; name: string; timeCreated: string }[] = [];
	let gcsError: string | null = null;

	if (GCS_BUCKET_NAME) {
		try {
			const assignedObjectNames = new Set(
				stories
					.map((story) => story.image_object_name ?? objectNameFromGcsUrl(story.image_url ?? ''))
					.filter(Boolean) as string[]
			);
			const assignedUrls = new Set(stories.map((story) => story.image_url).filter(Boolean) as string[]);
			availableImages = await listUnassignedStoryImages(assignedObjectNames, assignedUrls);
		} catch (error) {
			console.error('Failed to fetch story images:', error);
			gcsError = 'Failed to fetch images from Google Cloud Storage';
		}
	} else {
		gcsError = 'GCS_BUCKET_NAME environment variable is not configured';
	}

	return {
		users: (usersResult.data ?? []).map(mapUser),
		lessons: (lessonsResult.data ?? []) as unknown as Lesson[],
		stories,
		storiesWithoutImages: (storiesWithoutImagesResult.data ?? []).map(mapStory),
		availableImages,
		backups: [],
		gcsError,
		mathSettings: (mathSettingsResult.data ?? []).map(mapMathSettings),
		mathStats: groupMathStats(mathAttemptsResult.data ?? []),
		spellingWords: (spellingWordsResult.data ?? []) as unknown as SpellingWord[],
		spellingStats: groupSpellingStats(spellingAttemptsResult.data ?? [])
	};
};

export const actions: Actions = {
	addUser: async ({ request }) => {
		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		const grade = String(data.get('grade') ?? '').trim();
		const gender = String(data.get('gender') ?? '').trim();
		const characterDescription = String(data.get('characterDescription') ?? '').trim() || null;
		const storyThemes = data.getAll('storyThemes').map(String);
		const storyLengthMinutes = Number(data.get('storyLengthMinutes') ?? 5);

		if (!name || !grade || (gender !== 'boy' && gender !== 'girl')) {
			return fail(400, { message: 'Name, grade, and gender are required.' });
		}

		const supabase = await getSupabase();
		const { error } = await supabase.from('child_profiles').insert({
			name,
			grade,
			gender,
			character_description: characterDescription,
			story_themes: storyThemes.length > 0 ? storyThemes : ['space'],
			story_length_minutes: Number.isFinite(storyLengthMinutes) ? storyLengthMinutes : 5
		});
		if (error) throw error;

		return { success: true };
	},

	saveChildSettings: async ({ request }) => {
		const data = await request.formData();
		const id = Number(data.get('id'));
		const name = String(data.get('name') ?? '').trim();
		const grade = String(data.get('grade') ?? '').trim();
		const gender = String(data.get('gender') ?? '').trim();
		const characterDescription = String(data.get('characterDescription') ?? '').trim() || null;
		const storyThemes = data.getAll('storyThemes').map(String);
		const storyLengthMinutes = Number(data.get('storyLengthMinutes') ?? 5);

		if (!id || !name || !grade || (gender !== 'boy' && gender !== 'girl')) {
			return fail(400, { message: 'Valid child profile fields are required.' });
		}

		const supabase = await getSupabase();
		const { error } = await supabase
			.from('child_profiles')
			.update({
				name,
				grade,
				gender,
				character_description: characterDescription,
				story_themes: storyThemes.length > 0 ? storyThemes : ['space'],
				story_length_minutes: Number.isFinite(storyLengthMinutes) ? storyLengthMinutes : 5
			})
			.eq('id', id);
		if (error) throw error;

		return { success: true };
	},

	deleteUser: async ({ request }) => {
		const data = await request.formData();
		const supabase = await getSupabase();
		const { error } = await supabase.from('child_profiles').delete().eq('id', Number(data.get('id')));
		if (error) throw error;
		return { success: true };
	},

	addLesson: async ({ request }) => {
		const data = await request.formData();
		const lesson = String(data.get('lesson') ?? '').trim();

		if (!lesson) {
			return fail(400, { message: 'Lesson text is required.' });
		}

		const supabase = await getSupabase();
		const { error } = await supabase.from('lessons').upsert({ lesson }, { onConflict: 'lesson' });
		if (error) throw error;
		return { success: true };
	},

	deleteLesson: async ({ request }) => {
		const data = await request.formData();
		const supabase = await getSupabase();
		const { error } = await supabase.from('lessons').delete().eq('id', Number(data.get('id')));
		if (error) throw error;
		return { success: true };
	},

	deleteStory: async ({ request }) => {
		const data = await request.formData();
		const storyId = Number(data.get('id'));

		if (!storyId) {
			return fail(400, { message: 'Story ID is required.' });
		}

		const supabase = await getSupabase();
		const { data: storyRow, error: lookupError } = await supabase
			.from('stories')
			.select('id, image_url, image_object_name')
			.eq('id', storyId)
			.single();
		if (lookupError) throw lookupError;
		if (!storyRow) return fail(404, { message: `Story #${storyId} was not found.` });

		const { error } = await supabase.from('stories').delete().eq('id', storyId);
		if (error) throw error;

		const imageObjectName =
			storyRow.image_object_name ?? objectNameFromGcsUrl(storyRow.image_url ?? '');
		if (imageObjectName) {
			try {
				await deleteStoryImageObject(imageObjectName);
			} catch (storageError) {
				console.error(`Deleted story #${storyId} but failed to delete image ${imageObjectName}:`, storageError);
			}
		}

		return { success: true };
	},

	assignImageToStory: async ({ request }) => {
		const data = await request.formData();
		const storyId = Number(data.get('storyId'));
		const imageUrl = String(data.get('imageUrl') ?? '');
		const imageObjectName =
			String(data.get('imageObjectName') ?? '').trim() || objectNameFromGcsUrl(imageUrl);

		if (!storyId || !imageUrl) {
			return fail(400, { message: 'Story ID and image URL are required.' });
		}

		const supabase = await getSupabase();
		const { error } = await supabase
			.from('stories')
			.update({ image_url: imageUrl, image_object_name: imageObjectName })
			.eq('id', storyId);
		if (error) throw error;

		return { success: true, message: `Image successfully assigned to story #${storyId}`, storyId };
	},

	regenerateStoryImage: async ({ request }) => {
		const data = await request.formData();
		const storyId = Number(data.get('storyId'));

		if (!storyId) {
			return fail(400, { message: 'Story ID is required.' });
		}

		try {
			const supabase = await getSupabase();
			const { data: storyRow, error: storyError } = await supabase
				.from('stories')
				.select('*')
				.eq('id', storyId)
				.single();
			if (storyError) throwSupabaseError('loading story for image regeneration', storyError);
			if (!storyRow) return fail(404, { message: `Story #${storyId} was not found.` });

			const storedImage = await generateAndUploadStoryImage(mapStory(storyRow));
			const { error: updateError } = await supabase
				.from('stories')
				.update({
					image_url: storedImage.imageUrl,
					image_object_name: storedImage.imageObjectName
				})
				.eq('id', storyId);
			if (updateError) throwSupabaseError('saving regenerated story image', updateError);

			return {
				success: true,
				message: `Regenerated image for story #${storyId}.`,
				storyId,
				imageUrl: storedImage.imageUrl
			};
		} catch (error) {
			console.error('Failed to regenerate story image:', error);
			return fail(error instanceof Error && error.name === 'SupabaseConnectionError' ? 503 : 500, {
				message:
					error instanceof Error && error.name === 'SupabaseConnectionError'
						? getSupabaseErrorMessage(error)
						: 'Failed to regenerate story image.'
			});
		}
	},

	backupDatabase: async () => {
		return fail(400, {
			message: 'Manual SQLite backups are disabled because the app now uses Supabase.'
		});
	},

	restoreDatabase: async () => {
		return fail(400, {
			message: 'SQLite restore is disabled because the app now uses Supabase.'
		});
	},

	saveMathSettings: async ({ request }) => {
		const data = await request.formData();
		const childId = Number(data.get('userId') ?? data.get('childId'));
		const maxNumber = Number(data.get('maxNumber') ?? 10);
		const operations = data.getAll('operations').map(String);

		if (!childId || operations.length === 0) {
			return fail(400, { message: 'Choose a child and at least one math operation.' });
		}

		const config = {
			maxNumber: Number.isFinite(maxNumber) ? maxNumber : 10,
			fractions: { denominators: [2, 3, 4, 6, 8] },
			time: { minuteStep: 5 },
			recognition: { maxNumber: Math.min(Number.isFinite(maxNumber) ? maxNumber : 10, 20) }
		};

		const supabase = await getSupabase();
		const { error } = await supabase.from('math_settings').upsert(
			{
				child_id: childId,
				operations,
				config,
				updated_at: new Date().toISOString()
			},
			{ onConflict: 'child_id' }
		);
		if (error) throw error;

		return { success: true };
	},

	addSpellingWord: async ({ request }) => {
		const data = await request.formData();
		const word = String(data.get('word') ?? '')
			.trim()
			.toLowerCase();
		const grade = String(data.get('grade') ?? '').trim();

		if (!word || !grade) {
			return fail(400, { message: 'Word and grade are required.' });
		}

		const supabase = await getSupabase();
		const { data: existing, error: lookupError } = await supabase
			.from('spelling_words')
			.select('id')
			.eq('grade', grade)
			.ilike('word', word)
			.maybeSingle();
		if (lookupError) throw lookupError;

		if (!existing) {
			const { error } = await supabase.from('spelling_words').insert({ word, grade });
			if (error) throw error;
		}

		return { success: true };
	},

	deleteSpellingWord: async ({ request }) => {
		const data = await request.formData();
		const supabase = await getSupabase();
		const { error } = await supabase.from('spelling_words').delete().eq('id', Number(data.get('id')));
		if (error) throw error;
		return { success: true };
	},

	clearSpellingStats: async ({ request }) => {
		const data = await request.formData();
		const grade = data.get('grade');
		const supabase = await getSupabase();
		const query = supabase.from('spelling_attempts').delete();
		const { error } = grade ? await query.eq('grade', String(grade)) : await query.neq('id', 0);
		if (error) throw error;
		return { success: true };
	},

	clearMathStats: async ({ request }) => {
		const data = await request.formData();
		const childId = data.get('userId') ?? data.get('childId');
		const supabase = await getSupabase();
		const query = supabase.from('math_attempts').delete();
		const { error } = childId ? await query.eq('child_id', Number(childId)) : await query.neq('id', 0);
		if (error) throw error;
		return { success: true };
	},

	createStoryFromImage: async ({ request }) => {
		const data = await request.formData();
		const imageUrl = String(data.get('imageUrl') ?? '');
		const imageObjectName =
			String(data.get('imageObjectName') ?? '').trim() || objectNameFromGcsUrl(imageUrl);
		const prompt = String(data.get('prompt') ?? '').trim();

		if (!imageUrl || !prompt) {
			return fail(400, { message: 'Image URL and prompt are required.' });
		}

		try {
			const model = await getGeminiImageModel();
			const { buffer: imageBuffer } = await downloadImageFromGcsUrl(imageUrl);

			const imagePart = {
				inlineData: {
					data: imageBuffer.toString('base64'),
					mimeType: 'image/png'
				}
			};
			const completePrompt = `Create a short, exciting, and creative story for a young reader based on the following idea: "${prompt}". The story should be about 5 minutes to read and include a positive life lesson. At the very beginning, on a new line, write a short, simple sentence describing the main scene for an illustration.`;
			const result = await model.generateContent([completePrompt, imagePart]);
			const storyContent = result.response.text();
			const supabase = await getSupabase();
			const { data: story, error } = await supabase
				.from('stories')
				.insert({
					prompt,
					content: storyContent,
					image_url: imageUrl,
					image_object_name: imageObjectName,
					grade_level: '1'
				})
				.select('id')
				.single();
			if (error) throw error;

			throw redirect(303, `/story/${story.id}`);
		} catch (error) {
			if (isRedirect(error)) throw error;
			console.error('Failed to create story from image:', error);
			return fail(500, { message: 'Failed to create story from image.' });
		}
	}
};
