import { getSupabase } from '$lib/server/db';
import { validateRecipe, grades } from '$lib/games/word-kitchen/contracts';
import { access } from './authorization';
import { checkResult } from './common';
import { learningContext } from './learning-context';
import { compatible } from './sessions';
import { deliveryManifest } from './assets';
import type { RequestEvent } from '@sveltejs/kit';

export async function library(event: RequestEvent) {
	const scope = await access(event);
	const db = await getSupabase();
	const children =
		checkResult(await db.from('child_profiles').select('id,name,grade').in('id', scope.childIds)) ??
		[];
	const recipes =
		checkResult(await db.from('game_recipes').select('*').is('archived_at', null)) ?? [];
	const revisions =
		checkResult(
			await db
				.from('game_recipe_revisions')
				.select('*')
				.in(
					'id',
					recipes.flatMap((r) => (r.published_revision_id ? [r.published_revision_id] : []))
				)
		) ?? [];
	const assignments =
		checkResult(
			await db
				.from('game_recipe_assignments')
				.select('*')
				.in('child_id', scope.childIds)
				.eq('enabled', true)
		) ?? [];
	const cards = [];
	for (const child of children) {
		const context = await learningContext(Number(child.id));
		for (const row of revisions) {
			const recipe = validateRecipe(row.definition);
			const owner = recipes.find((r) => r.id === row.recipe_id)!;
			if (
				owner.origin === 'generated' &&
				!assignments.some(
					(a) => a.recipe_id === owner.id && Number(a.child_id) === Number(child.id)
				)
			)
				continue;
			if (
				!compatible(recipe, context.settings.excludedFoodConceptIds) ||
				grades.indexOf(child.grade) < grades.indexOf(recipe.gradeBand.min) ||
				grades.indexOf(child.grade) > grades.indexOf(recipe.gradeBand.max)
			)
				continue;
			const manifest = await deliveryManifest(recipe);
			const hero = Object.values(manifest).find((a) => a.revisionId === recipe.heroAssetId);
			cards.push({
				childId: Number(child.id),
				revisionId: row.id,
				title: recipe.title,
				description: recipe.description,
				hero: hero?.url,
				durations: recipe.supportedDurations,
				origin: owner.origin,
				notice: context.notice
			});
		}
	}
	const active =
		checkResult(
			await db
				.from('game_sessions')
				.select('id,child_id,snapshot,status,updated_at')
				.in('child_id', scope.childIds)
				.eq('preview', false)
				.in('status', ['active', 'paused'])
				.gt('expires_at', new Date().toISOString())
				.order('updated_at', { ascending: false })
				.limit(10)
		) ?? [];
	return {
		children,
		cards,
		parent: scope.parent,
		active: active.map((s) => ({
			id: s.id,
			childId: Number(s.child_id),
			title: s.snapshot.recipe.title
		}))
	};
}
