import { error } from '@sveltejs/kit';
import { getSupabase } from '$lib/server/db';
import { requireGames, requireParent, checkResult } from '$lib/server/games/common';
import { deliveryManifest } from '$lib/server/games/assets';
import { validateRecipe } from '$lib/games/word-kitchen/contracts';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async (e) => {
	requireGames();
	requireParent(e);
	const db = await getSupabase();
	const revision = checkResult(
		await db.from('game_recipe_revisions').select('*').eq('id', e.params.revisionId).maybeSingle()
	);
	if (!revision) error(404, 'Revision not found.');
	const recipe = validateRecipe(revision.definition);
	const owner = checkResult(
		await db
			.from('game_recipes')
			.select('child_id,origin,archived_at')
			.eq('id', revision.recipe_id)
			.single()
	);
	const children = checkResult(await db.from('child_profiles').select('id,name'));
	return {
		revision,
		recipe,
		owner,
		children: children ?? [],
		manifest: await deliveryManifest(recipe)
	};
};
