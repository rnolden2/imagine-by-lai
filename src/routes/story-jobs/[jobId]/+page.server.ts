import { fail } from '@sveltejs/kit';
import { authorizeStoryJob, cancelStoryJob } from '#lib/server/story-jobs';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({
	job: await authorizeStoryJob(event, event.params.jobId)
});

export const actions: Actions = {
	cancel: async (event) => {
		try {
			await cancelStoryJob(event, event.params.jobId);
			return { success: true };
		} catch {
			return fail(503, { message: 'The job could not be cancelled yet. Please retry.' });
		}
	}
};
