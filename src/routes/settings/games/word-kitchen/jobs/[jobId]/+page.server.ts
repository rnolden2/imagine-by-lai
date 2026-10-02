import { error } from '@sveltejs/kit';
import { getSupabase } from '$lib/server/db';
import { requireGames, requireParent, checkResult } from '$lib/server/games/common';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async (e) => {
	requireGames();
	requireParent(e);
	const db = await getSupabase();
	const job = checkResult(
		await db
			.from('game_generation_jobs')
			.select(
				'id,child_id,recipe_id,status,stage,checkpoint,error_code,estimated_cost,actual_cost,input,created_at'
			)
			.eq('id', e.params.jobId)
			.maybeSingle()
	);
	if (!job) error(404, 'Job not found.');
	const revision = job.recipe_id
		? checkResult(
				await db
					.from('game_recipe_revisions')
					.select('id')
					.eq('recipe_id', job.recipe_id)
					.order('revision', { ascending: false })
					.limit(1)
			)
		: [];
	return { job, revisionId: revision?.[0]?.id ?? null };
};
