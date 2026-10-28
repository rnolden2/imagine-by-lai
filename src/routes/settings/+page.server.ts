import { randomUUID } from 'node:crypto';
import { rpc } from '#lib/server/games/common';
import { saveMathSettings, clearMathStats } from '#lib/server/math-settings';
import { getSupabase, getSupabaseErrorMessage, throwSupabaseError } from '#lib/server/db';
import { fail, isRedirect, redirect, error as kitError } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type {
	Lesson,
	MathSessionSummary,
	MathSettings,
	SpellingSessionSummary,
	SpellingWord,
	User
} from '#lib/types';
import { GCS_BUCKET_NAME } from '#lib/server/secrets';
import { parseId, parseProfile, gradeSchema } from '#lib/server/profile-validation';
import { listUnassignedStoryImages, objectNameFromGcsUrl } from '#lib/server/image-storage';
import {
	deliverStoryImage,
	assertStoryImageObject,
	getSignedImageUrl
} from '#lib/server/image-storage';
import {
	enqueueStoryJob,
	recoverStoryJob as recoverAcceptedStoryJob,
	storyJobFailure
} from '#lib/server/story-jobs';

function mapUser(row: User): User {
	return { ...row, user_id: row.id } as User;
}

function mapStory<T extends { child_id: number | null }>(row: T): T & { user_id: number | null } {
	return { ...row, user_id: row.child_id };
}

function mapMathSettings(row: MathSettings): MathSettings {
	return { ...row, user_id: row.child_id, config: row.config ?? {} } as MathSettings;
}

function pageNumber(url: URL, name: string) {
	const value = Number(url.searchParams.get(name) ?? '1');
	if (!Number.isSafeInteger(value) || value < 1 || value > 10000)
		throw kitError(400, `Invalid ${name}.`);
	return value;
}

function imageMaintenanceFailure(cause: unknown) {
	const detail = cause instanceof Error && cause.cause ? cause.cause : cause;
	const message =
		detail && typeof detail === 'object' && 'message' in detail ? detail.message : null;
	if (typeof message !== 'string') return null;
	if (message.includes('IMAGE_MIGRATION_REQUIRED'))
		return fail(409, {
			message:
				'Image maintenance must finish before this change. An administrator can resolve unsupported legacy images.'
		});
	if (message.includes('IMAGE_UNAVAILABLE'))
		return fail(409, {
			message:
				'This illustration is being removed. Refresh the image library and choose another illustration.'
		});
	return null;
}

export const load: PageServerLoad = async (event) => {
	const imagePageToken = event.url.searchParams.get('imagePageToken') ?? '';
	if (imagePageToken.length > 2048) throw kitError(400, 'Invalid image page.');
	const requestedTab = event.url.searchParams.get('adminTab');
	if (requestedTab && !['kids', 'math', 'spelling', 'status'].includes(requestedTab))
		throw kitError(400, 'Invalid admin tab.');
	const storyAdminPage = pageNumber(event.url, 'storyAdminPage');
	const missingStoryPage = pageNumber(event.url, 'missingStoryPage');
	const lessonPage = pageNumber(event.url, 'lessonPage');
	const wordPage = pageNumber(event.url, 'wordPage');
	const storyPageSize = 24;
	const listPageSize = 100;
	let usersResult;
	let lessonsResult;
	let storiesResult;
	let storiesWithoutImagesResult;
	let mathSettingsResult;
	let practiceSummaryResult;
	let spellingWordsResult;
	let catalogCountsResult;

	try {
		const supabase = await getSupabase();
		[
			usersResult,
			lessonsResult,
			storiesResult,
			storiesWithoutImagesResult,
			mathSettingsResult,
			practiceSummaryResult,
			spellingWordsResult,
			catalogCountsResult
		] = await Promise.all([
			supabase
				.from('child_profiles')
				.select('id,name,grade,gender,character_description,story_themes,story_length_minutes')
				.order('name', { ascending: true }),
			supabase
				.from('lessons')
				.select('id,lesson')
				.order('lesson', { ascending: true })
				.range((lessonPage - 1) * listPageSize, lessonPage * listPageSize),
			supabase
				.from('stories')
				.select('id,prompt,image_url,image_object_name,child_id,created_at')
				.or('image_object_name.not.is.null,and(image_url.not.is.null,image_url.neq.)')
				.order('created_at', { ascending: false })
				.order('id', { ascending: false })
				.range((storyAdminPage - 1) * storyPageSize, storyAdminPage * storyPageSize),
			supabase
				.from('stories')
				.select('id,prompt,image_url,image_object_name,child_id,created_at')
				.is('image_object_name', null)
				.or('image_url.is.null,image_url.eq.')
				.order('created_at', { ascending: false })
				.order('id', { ascending: false })
				.range((missingStoryPage - 1) * storyPageSize, missingStoryPage * storyPageSize),
			supabase
				.from('math_settings')
				.select('id,child_id,operations,config,updated_at')
				.order('child_id', { ascending: true }),
			supabase.rpc('app_practice_summaries'),
			supabase
				.from('spelling_words')
				.select('id,word,grade')
				.order('grade', { ascending: true })
				.order('word', { ascending: true })
				.range((wordPage - 1) * listPageSize, wordPage * listPageSize),
			supabase.rpc('app_admin_catalog_counts')
		]);

		const namedResults = [
			['child profiles', usersResult],
			['lessons', lessonsResult],
			['stories', storiesResult],
			['stories without images', storiesWithoutImagesResult],
			['math settings', mathSettingsResult],
			['practice summaries', practiceSummaryResult],
			['spelling words', spellingWordsResult],
			['catalog counts', catalogCountsResult]
		] as const;

		for (const [name, result] of namedResults) {
			if (result.error) throwSupabaseError(`loading admin ${name}`, result.error);
		}
	} catch (error) {
		throw kitError(503, getSupabaseErrorMessage(error));
	}

	const storyRows = (storiesResult.data ?? []).slice(0, storyPageSize).map(mapStory);
	const stories = await Promise.all(storyRows.map(deliverStoryImage));
	const missingStories = (storiesWithoutImagesResult.data ?? [])
		.slice(0, storyPageSize)
		.map(mapStory);
	let availableImages: { url: string; objectName: string; name: string; timeCreated: string }[] =
		[];
	let hasMoreAvailableImages = false;
	let nextImagePageToken: string | null = null;
	let gcsError: string | null = null;

	if (GCS_BUCKET_NAME) {
		try {
			const assignedObjectNames = new Set(
				storyRows
					.map((story) => story.image_object_name ?? objectNameFromGcsUrl(story.image_url ?? ''))
					.filter(Boolean) as string[]
			);
			const assignedUrls = new Set(
				storyRows.map((story) => story.image_url).filter(Boolean) as string[]
			);
			const available = await listUnassignedStoryImages(
				assignedObjectNames,
				assignedUrls,
				imagePageToken || undefined,
				async (objects) => {
					if (!objects.length) return new Set();
					const db = await getSupabase();
					const references = await db
						.from('stories')
						.select('image_object_name')
						.in('image_object_name', objects);
					if (references.error)
						throwSupabaseError('checking assigned story images', references.error);
					return new Set(
						(references.data ?? [])
							.map((row) => row.image_object_name)
							.filter((object): object is string => Boolean(object))
					);
				}
			);
			availableImages = available.images;
			hasMoreAvailableImages = available.hasMore;
			nextImagePageToken = available.nextPageToken;
		} catch {
			console.error('story.images.list.failed');
			gcsError = 'Failed to fetch images from Google Cloud Storage';
		}
	} else {
		gcsError = 'GCS_BUCKET_NAME environment variable is not configured';
	}

	const catalogCounts = catalogCountsResult.data as Record<string, unknown> | null;
	for (const key of ['storyCount', 'lessonCount', 'spellingWordCount']) {
		if (!Number.isSafeInteger(Number(catalogCounts?.[key])) || Number(catalogCounts?.[key]) < 0)
			throw kitError(503, 'Admin catalog counts are unavailable.');
	}

	return {
		users: (usersResult.data ?? []).map(mapUser),
		lessons: (lessonsResult.data ?? []).slice(0, listPageSize) as unknown as Lesson[],
		stories,
		storiesWithoutImages: missingStories,
		availableImages,
		hasMoreAvailableImages,
		nextImagePageToken,
		imagePageToken,
		gcsError,
		mathSettings: (mathSettingsResult.data ?? []).map(mapMathSettings),
		mathStats: practiceSummaryResult.data.mathStats as MathSessionSummary[],
		mathAttemptCount: Number(practiceSummaryResult.data.mathAttemptCount),
		spellingAttemptCount: Number(practiceSummaryResult.data.spellingAttemptCount),
		spellingWords: (spellingWordsResult.data ?? []).slice(
			0,
			listPageSize
		) as unknown as SpellingWord[],
		spellingStats: practiceSummaryResult.data.spellingStats as SpellingSessionSummary[],
		catalogCounts: {
			storyCount: Number(catalogCounts?.storyCount),
			lessonCount: Number(catalogCounts?.lessonCount),
			spellingWordCount: Number(catalogCounts?.spellingWordCount)
		},
		adminPages: {
			story: storyAdminPage,
			storyHasMore: (storiesResult.data?.length ?? 0) > storyPageSize,
			missingStory: missingStoryPage,
			missingStoryHasMore: (storiesWithoutImagesResult.data?.length ?? 0) > storyPageSize,
			lesson: lessonPage,
			lessonHasMore: (lessonsResult.data?.length ?? 0) > listPageSize,
			word: wordPage,
			wordHasMore: (spellingWordsResult.data?.length ?? 0) > listPageSize
		},
		adminFocus:
			requestedTab ??
			(storyAdminPage > 1 || missingStoryPage > 1 || imagePageToken
				? 'status'
				: wordPage > 1
					? 'spelling'
					: 'kids'),
		storyJobRequestKeys: {
			fromImage: randomUUID(),
			regenerate: Object.fromEntries(stories.map((story) => [String(story.id), randomUUID()]))
		}
	};
};

function jobFailure(cause: unknown) {
	const known = storyJobFailure(cause, 'message');
	if (known) return fail(known.status, known.body);
	console.error('story.job.admin.accept.failed');
	return fail(503, { message: 'Story generation is temporarily unavailable. Please try again.' });
}

export const actions: Actions = {
	addUser: async ({ request }) => {
		const data = await request.formData();
		const parsed = parseProfile(data);
		if (!parsed.success)
			return fail(400, {
				message:
					'Use a name of 1–120 characters, a supported grade, and a 3, 5, 8, or 10-minute story length. Descriptions may contain up to 2,000 characters.'
			});

		const supabase = await getSupabase();
		const { error } = await supabase.from('child_profiles').insert(parsed.data);
		if (error) throw error;

		return { success: true };
	},

	saveChildSettings: async ({ request }) => {
		const data = await request.formData();
		const id = parseId(data.get('id'));
		const parsed = parseProfile(data);

		if (!id || !parsed.success) {
			return fail(400, { message: 'Valid child profile fields are required.' });
		}

		const supabase = await getSupabase();
		const { error } = await supabase.from('child_profiles').update(parsed.data).eq('id', id);
		if (error) throw error;

		return { success: true };
	},

	deleteUser: async ({ request }) => {
		const data = await request.formData();
		const id = parseId(data.get('id'));
		if (!id) return fail(400, { message: 'Choose a valid child profile.' });
		const supabase = await getSupabase();
		const { error } = await supabase.from('child_profiles').delete().eq('id', id);
		const maintenanceFailure = imageMaintenanceFailure(error);
		if (maintenanceFailure) return maintenanceFailure;
		if (error) throw error;
		return { success: true };
	},

	addLesson: async ({ request }) => {
		const data = await request.formData();
		const lesson = String(data.get('lesson') ?? '').trim();

		if (!lesson || lesson.length > 1000) {
			return fail(400, { message: 'Use lesson text of 1–1,000 characters.' });
		}

		const supabase = await getSupabase();
		const { error } = await supabase.from('lessons').upsert({ lesson }, { onConflict: 'lesson' });
		if (error) throw error;
		return { success: true };
	},

	deleteLesson: async ({ request }) => {
		const data = await request.formData();
		const id = parseId(data.get('id'));
		if (!id) return fail(400, { message: 'Choose a valid lesson.' });
		const supabase = await getSupabase();
		const { error } = await supabase.from('lessons').delete().eq('id', id);
		if (error) throw error;
		return { success: true };
	},

	deleteStory: async ({ request }) => {
		const data = await request.formData();
		const storyId = parseId(data.get('id'));

		if (!storyId) {
			return fail(400, { message: 'Story ID is required.' });
		}

		const supabase = await getSupabase();
		const { error } = await supabase.from('stories').delete().eq('id', storyId);
		const maintenanceFailure = imageMaintenanceFailure(error);
		if (maintenanceFailure) return maintenanceFailure;
		if (error) throw error;
		return {
			success: true,
			message: 'Story deleted. Unused illustrations will be removed by scheduled maintenance.'
		};
	},

	assignImageToStory: async ({ request }) => {
		const data = await request.formData();
		const storyId = parseId(data.get('storyId'));
		const imageUrl = String(data.get('imageUrl') ?? '');
		const imageObjectName =
			String(data.get('imageObjectName') ?? '').trim() || objectNameFromGcsUrl(imageUrl);

		if (!storyId || !imageObjectName) {
			return fail(400, { message: 'Story ID and image URL are required.' });
		}
		try {
			assertStoryImageObject(imageObjectName);
		} catch {
			return fail(400, { message: 'Choose a valid story image from the library.' });
		}
		const deliveryUrl = await getSignedImageUrl(imageObjectName);

		const supabase = await getSupabase();
		const { error } = await supabase
			.from('stories')
			.update({ image_url: deliveryUrl, image_object_name: imageObjectName })
			.eq('id', storyId);
		const maintenanceFailure = imageMaintenanceFailure(error);
		if (maintenanceFailure) return maintenanceFailure;
		if (error) throw error;

		return { success: true, message: `Image successfully assigned to story #${storyId}`, storyId };
	},

	regenerateStoryImage: async (event) => {
		const data = await event.request.formData();
		const storyId = parseId(data.get('storyId'));

		if (!storyId) {
			return fail(400, { message: 'Story ID is required.' });
		}

		try {
			const job = await enqueueStoryJob(event, {
				key: String(data.get('requestKey') ?? ''),
				kind: 'regenerate_image',
				storyId,
				input: {}
			});
			throw redirect(303, `/story-jobs/${job.id}`);
		} catch (cause) {
			if (isRedirect(cause)) throw cause;
			return jobFailure(cause);
		}
	},

	saveMathSettings,

	addSpellingWord: async ({ request }) => {
		const data = await request.formData();
		const word = String(data.get('word') ?? '')
			.trim()
			.toLowerCase();
		const grade = String(data.get('grade') ?? '').trim();

		if (
			!word ||
			word.length > 80 ||
			!/^[\p{L}\p{M}' -]+$/u.test(word) ||
			!gradeSchema.safeParse(grade).success
		) {
			return fail(400, { message: 'Use a word of 1–80 characters and a supported grade.' });
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
			if (error && error.code !== '23505') throw error;
		}

		return { success: true };
	},

	deleteSpellingWord: async ({ request }) => {
		const data = await request.formData();
		const id = parseId(data.get('id'));
		if (!id) return fail(400, { message: 'Choose a valid spelling word.' });
		const supabase = await getSupabase();
		const { error } = await supabase.from('spelling_words').delete().eq('id', id);
		if (error) throw error;
		return { success: true };
	},

	clearSpellingStats: async ({ request }) => {
		const data = await request.formData();
		const grade = data.get('grade');
		await rpc('wk_clear_spelling_history', { p_grade: grade ? String(grade) : null });
		return { success: true };
	},

	clearMathStats,

	createStoryFromImage: async (event) => {
		const data = await event.request.formData();
		const imageUrl = String(data.get('imageUrl') ?? '');
		const imageObjectName =
			String(data.get('imageObjectName') ?? '').trim() || objectNameFromGcsUrl(imageUrl);
		const prompt = String(data.get('prompt') ?? '').trim();

		if (!imageObjectName || !prompt || prompt.length > 4000) {
			return fail(400, { message: 'Choose an image and use a story idea of 1–4,000 characters.' });
		}
		try {
			assertStoryImageObject(imageObjectName);
		} catch {
			return fail(400, { message: 'Choose a valid story image from the library.' });
		}

		try {
			const job = await enqueueStoryJob(event, {
				key: String(data.get('requestKey') ?? ''),
				kind: 'from_image',
				input: { prompt, source_object: imageObjectName }
			});
			throw redirect(303, `/story-jobs/${job.id}`);
		} catch (cause) {
			if (isRedirect(cause)) throw cause;
			return jobFailure(cause);
		}
	},

	recoverStoryJob: async (event) => {
		const data = await event.request.formData();
		try {
			const jobId = await recoverAcceptedStoryJob(event, String(data.get('requestKey') ?? ''));
			if (!jobId) return fail(404, { message: 'No accepted story request was found.' });
			throw redirect(303, `/story-jobs/${jobId}`);
		} catch (cause) {
			if (isRedirect(cause)) throw cause;
			return jobFailure(cause);
		}
	}
};
