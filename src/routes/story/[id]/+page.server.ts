import { getSupabase, getSupabaseErrorMessage, throwSupabaseError } from '#lib/server/db';
import { error as kitError } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { Story } from '#lib/types';
import { access } from '#lib/server/games/authorization';
import { renderStoryMarkdown } from '#lib/server/story-markdown';
import { deliverStoryImage } from '#lib/server/image-storage';

type StoryPageRow = Pick<Story, 'id' | 'content' | 'image_url' | 'image_object_name' | 'child_id'>;

export const load: PageServerLoad = async (event) => {
	const scope = await access(event);
	const storyId = Number(event.params.id);
	if (!Number.isSafeInteger(storyId) || storyId <= 0) {
		throw kitError(400, 'Invalid Story ID');
	}

	let story: StoryPageRow | null = null;

	try {
		const supabase = await getSupabase();
		const { data, error: storyError } = await supabase
			.from('stories')
			.select('id,content,image_url,image_object_name,child_id')
			.eq('id', storyId)
			.single();

		if (storyError) {
			if (storyError.code === 'PGRST116') {
				throw kitError(404, 'Story not found');
			}
			throwSupabaseError('loading story', storyError);
		}

		story = data;
	} catch (error) {
		if (error && typeof error === 'object' && 'status' in error) throw error;
		throw kitError(503, getSupabaseErrorMessage(error));
	}

	if (
		!story ||
		(!scope.parent && story.child_id !== null && !scope.childIds.includes(Number(story.child_id)))
	) {
		throw kitError(404, 'Story not found');
	}

	return {
		storyHtml: renderStoryMarkdown(story.content),
		story: await deliverStoryImage({
			id: story.id,
			image_url: story.image_url,
			image_object_name: story.image_object_name,
			child_id: story.child_id,
			user_id: story.child_id // Map child_id to user_id for frontend templates compatibility
		})
	};
};
