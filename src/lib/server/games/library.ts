import { getSupabase } from '#lib/server/db';
import { validateRecipe } from '#lib/games/word-kitchen/contracts';
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
	let afterRecipeId: string | undefined;
	for (;;) {
		let query = db
			.from('game_recipes')
			.select('id,origin,published_revision_id')
			.is('archived_at', null)
			.order('id');
		if (afterRecipeId) query = query.gt('id', afterRecipeId);
		const page = checkResult(await query.limit(pageSize)) ?? [];
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
		afterRecipeId = String(page[page.length - 1].id);
	}
	const owners = new Map(recipes.map((recipe) => [recipe.id, recipe]));
	const childContexts: {
		child: (typeof children)[number];
		context: Awaited<ReturnType<typeof learningContext>>;
	}[] = [];
	// A household normally has few children, but profile count is not database-capped.
	// Bound the four-query context fan-out instead of opening all requests at once.
	for (let offset = 0; offset < children.length; offset += 4)
		childContexts.push(
			...(await Promise.all(
				children.slice(offset, offset + 4).map(async (child) => ({
					child,
					context: await learningContext(Number(child.id))
				}))
			))
		);
	const cards = [];
	for (const row of revisions) {
		const recipe = validateRecipe(row.definition);
		const owner = owners.get(row.recipe_id);
		if (!owner) continue;
		const eligible = childContexts.filter(({ context }) =>
			compatible(recipe, context.settings.excludedFoodConceptIds)
		);
		if (!eligible.length) continue;
		// Delivery URLs and asset revisions are recipe-scoped, not child-scoped. Resolve
		// them once so multiple children do not multiply database and signing work.
		const manifest = await deliveryManifest(recipe);
		const hero = Object.values(manifest).find((asset) => asset.revisionId === recipe.heroAssetId);
		for (const { child, context } of eligible) {
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
