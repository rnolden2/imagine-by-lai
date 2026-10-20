import { getSupabase } from '$lib/server/db';
import { validateRecipe } from '$lib/games/word-kitchen/contracts';
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
	const recipes = [];
	const revisions = [];
	// Published recipes form one shared library. Page through it rather than
	// silently dropping recipes at the Data API's default row limit.
	const pageSize = 100;
	for (let offset = 0; ; offset += pageSize) {
		const page =
			checkResult(
				await db
					.from('game_recipes')
					.select('id,origin,published_revision_id')
					.is('archived_at', null)
					.order('id')
					.range(offset, offset + pageSize - 1)
			) ?? [];
		recipes.push(...page);
		const ids = page.flatMap((r) => (r.published_revision_id ? [r.published_revision_id] : []));
		if (ids.length) {
			revisions.push(
				...(checkResult(
					await db
						.from('game_recipe_revisions')
						.select('id,recipe_id,definition')
						.in('id', ids)
						.eq('status', 'published')
				) ?? [])
			);
		}
		if (page.length < pageSize) break;
	}
	const cards = [];
	for (const child of children) {
		const context = await learningContext(Number(child.id));
		for (const row of revisions) {
			const recipe = validateRecipe(row.definition);
			const owner = recipes.find((r) => r.id === row.recipe_id)!;
			if (!compatible(recipe, context.settings.excludedFoodConceptIds)) continue;
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
				gradeBand: recipe.gradeBand,
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
