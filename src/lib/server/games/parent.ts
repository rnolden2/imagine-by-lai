import type { RequestEvent } from '@sveltejs/kit';
import { getSupabase } from '$lib/server/db';
import { checkResult, requireParent } from './common';
import { learningContext } from './learning-context';
import { recipeProgress } from '$lib/games/word-kitchen/progress';
import { concepts } from './curated';
export async function parentData(event: RequestEvent) {
	requireParent(event);
	const db = await getSupabase();
	const [children, favorites, jobs, recipes, attempts, rewards, devices, sessions] =
		await Promise.all([
			db.from('child_profiles').select('id,name,grade').order('id'),
			db.from('game_favorite_foods').select('*').order('created_at'),
			db
				.from('game_generation_jobs')
				.select(
					'id,child_id,status,stage,error_code,recipe_id,created_at,input,estimated_cost,actual_cost'
				)
				.order('created_at', { ascending: false })
				.limit(50),
			db
				.from('game_recipe_revisions')
				.select('id,recipe_id,definition,checksum,status,preference_revision')
				.order('created_at', { ascending: false })
				.limit(100),
			db.from('game_attempts').select('*').order('created_at', { ascending: false }).limit(2000),
			db.from('game_reward_ledger').select('child_id,points'),
			db.from('game_devices').select('id,child_ids,expires_at,revoked_at').is('revoked_at', null),
			db
				.from('game_sessions')
				.select('id,child_id,recipe_revision_id,created_at,state,snapshot')
				.eq('status', 'completed')
				.eq('preview', false)
				.order('created_at', { ascending: false })
				.limit(100)
		]);
	const profiles = await Promise.all(
		(checkResult(children) ?? []).map(async (c) => {
			const context = await learningContext(Number(c.id));
			const evidence = (checkResult(attempts) ?? []).filter(
				(a) => Number(a.child_id) === Number(c.id)
			);
			const completed = (checkResult(sessions) ?? []).filter(
				(s) => Number(s.child_id) === Number(c.id)
			);
			const words = [...new Set(evidence.map((a) => a.word))].flatMap((word) =>
				['spelling', 'vocabulary']
					.map((skill) => {
						const recent = evidence.filter(
							(a) => a.word === word && a.skill === skill && !a.review
						);
						const independent = recent.filter((a) => a.assistance === 'independent' && a.first_try);
						return {
							word,
							skill,
							source: recent[0]?.word_source ?? '',
							independent: independent.length,
							correct: independent.filter((a) => a.correct).length,
							assisted: recent.filter((a) => a.assistance !== 'independent').length
						};
					})
					.filter((w) => w.independent + w.assisted > 0)
			);
			return {
				...c,
				settings: context.settings,
				notice: context.notice,
				progress: recipeProgress(completed, evidence),
				sessions: completed.map((s) => ({
					id: s.id,
					title: s.snapshot.recipe?.title ?? 'Recipe',
					revisionId: s.recipe_revision_id,
					date: s.created_at,
					activeMs: s.state.activeMs ?? 0,
					evidence: evidence.filter((a) => a.session_id === s.id)
				})),
				points: (checkResult(rewards) ?? [])
					.filter((r) => Number(r.child_id) === Number(c.id))
					.reduce((sum, r) => sum + r.points, 0),
				words
			};
		})
	);
	return {
		profiles,
		favorites: checkResult(favorites) ?? [],
		jobs: checkResult(jobs) ?? [],
		recipes: (checkResult(recipes) ?? []).map((r) => ({ ...r, title: r.definition.title })),
		devices: checkResult(devices) ?? [],
		exclusions: concepts
			.filter((c) => c.kind === 'ingredient')
			.map((c) => ({ id: c.id, label: c.label }))
	};
}
