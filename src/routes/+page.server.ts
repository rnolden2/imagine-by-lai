import { randomUUID } from 'node:crypto';
import { error as kitError, fail, isRedirect, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getSupabase, getSupabaseErrorMessage, throwSupabaseError } from '#lib/server/db';
import type { Story, User } from '#lib/types';
import { deliverStoryImage } from '#lib/server/image-storage';
import { access, requireChild } from '#lib/server/games/authorization';
import {
	enqueueStoryJob,
	recoverStoryJob as recoverAcceptedStoryJob,
	storyJobFailure
} from '#lib/server/story-jobs';

type StoryCard = Pick<
	Story,
	'id' | 'prompt' | 'image_url' | 'image_object_name' | 'child_id' | 'created_at'
>;
type ProfileCard = Pick<
	User,
	'id' | 'name' | 'grade' | 'gender' | 'character_description' | 'story_themes'
>;

export const load: PageServerLoad = async (event) => {
	const scope = await access(event);
	const storyPage = Number(event.url.searchParams.get('page') ?? '1');
	if (!Number.isSafeInteger(storyPage) || storyPage < 1 || storyPage > 10000)
		throw kitError(400, 'Invalid story page.');
	const pageSize = 24;
	let usersResult: ProfileCard[] | null = null;
	let storiesResult: StoryCard[] | null = null;

	try {
		const supabase = await getSupabase();
		let profiles = supabase
			.from('child_profiles')
			.select('id,name,grade,gender,character_description,story_themes')
			.order('name', { ascending: true });
		let library = supabase
			.from('stories')
			.select('id,prompt,image_url,image_object_name,child_id,created_at')
			.order('created_at', { ascending: false })
			.order('id', { ascending: false })
			.range((storyPage - 1) * pageSize, storyPage * pageSize);
		if (!scope.parent) {
			profiles = profiles.in('id', scope.childIds);
			library = library.or(`child_id.is.null,child_id.in.(${scope.childIds.join(',')})`);
		}
		const [usersResponse, storiesResponse] = await Promise.all([profiles, library]);
		if (usersResponse.error) throwSupabaseError('loading child profiles', usersResponse.error);
		if (storiesResponse.error) throwSupabaseError('loading stories', storiesResponse.error);
		usersResult = usersResponse.data;
		storiesResult = storiesResponse.data;
	} catch (cause) {
		throw kitError(503, getSupabaseErrorMessage(cause));
	}

	const users = (usersResult ?? []).map((user) => ({ ...user, user_id: user.id }));
	const stories = (storiesResult ?? []).map((story) => ({ ...story, user_id: story.child_id }));
	return {
		users,
		stories: await Promise.all(stories.slice(0, pageSize).map(deliverStoryImage)),
		storyPage,
		hasMoreStories: stories.length > pageSize,
		storyRequestKey: randomUUID()
	};
};

function normalizeStoryThemes(data: FormData): string[] | null {
	if (data.get('noTheme') === 'true') return [];
	const themes = data
		.getAll('storyThemes')
		.map((theme) => String(theme).trim())
		.filter(Boolean);
	const customTheme = String(data.get('customStoryTheme') ?? '').trim();
	if (customTheme) themes.push(customTheme);
	const uniqueThemes = [...new Set(themes)];
	return uniqueThemes.length > 0 ? uniqueThemes : null;
}

function jobFailure(cause: unknown) {
	const known = storyJobFailure(cause);
	if (known) return fail(known.status, known.body);
	console.error('story.job.accept.failed');
	return fail(503, { error: 'Story generation is temporarily unavailable. Please try again.' });
}

export const actions: Actions = {
	generateStory: async (event) => {
		const scope = await access(event);
		const data = await event.request.formData();
		const prompt = String(data.get('prompt') ?? '').trim();
		const requestKey = String(data.get('requestKey') ?? '');
		const userIdValue = String(data.get('userId') ?? '');
		const themes = normalizeStoryThemes(data);
		if (prompt.length < 10)
			return fail(400, {
				error: 'Please provide a more detailed story prompt (at least 10 characters).'
			});
		if (
			prompt.length > 4000 ||
			(themes?.length ?? 0) > 10 ||
			themes?.some((theme) => theme.length > 200)
		)
			return fail(400, {
				error: 'Keep the story idea under 4,000 characters and themes under 200 characters each.'
			});
		if (!scope.parent && !userIdValue)
			return fail(400, { error: 'Choose a child for this story.' });

		let childId: number | null = null;
		if (userIdValue) {
			childId = Number(userIdValue);
			if (!Number.isSafeInteger(childId) || childId <= 0)
				return fail(400, { error: 'Invalid user ID.' });
			await requireChild(event, childId);
		}

		try {
			const job = await enqueueStoryJob(event, {
				key: requestKey,
				kind: 'create',
				childId,
				input: { prompt, themes }
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
			if (!jobId) return fail(404, { error: 'No accepted story request was found.' });
			throw redirect(303, `/story-jobs/${jobId}`);
		} catch (cause) {
			if (isRedirect(cause)) throw cause;
			return jobFailure(cause);
		}
	}
};
