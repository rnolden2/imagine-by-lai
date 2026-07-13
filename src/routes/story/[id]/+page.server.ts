import { getSupabase, getSupabaseErrorMessage, throwSupabaseError } from '$lib/server/db';
import { error as kitError } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { Story } from '$lib/types';

export const load: PageServerLoad = async ({ params }) => {
	const storyId = parseInt(params.id);
	if (isNaN(storyId)) {
		throw kitError(400, 'Invalid Story ID');
	}

	let story: any = null;

	try {
		const supabase = await getSupabase();
		const { data, error: storyError } = await supabase
			.from('stories')
			.select('*')
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

	if (!story) {
		throw kitError(404, 'Story not found');
	}

	return {
		story: {
			...story,
			user_id: story.child_id, // Map child_id to user_id for frontend templates compatibility
			child_id: story.child_id
		} as Story
	};
};
