import type { RequestEvent } from '@sveltejs/kit';
import { getSupabase } from '#lib/server/db';
import { checkResult, requireParent, rpc } from './common';
import { generationPolicy } from './generation';
import type { GenerationQuota } from '#lib/games/word-kitchen/generation-quota';
import { learningContext } from './learning-context';
import { recipeProgress, type Practice } from '#lib/games/word-kitchen/progress';
import { concepts } from './curated';
export async function parentData(event: RequestEvent) {
	requireParent(event);
	const db = await getSupabase();
	const [children, favorites, jobs, recipes, devices, sessions, generationQuota, pointTotals] =
		await Promise.all([
			db.from('child_profiles').select('id,name,grade').order('id'),
			db.from('game_favorite_foods').select('id,child_id,display_name').order('created_at'),
			db
				.from('game_generation_jobs')
				.select('id,child_id,status,stage,error_code,recipe_id,created_at,input')
				.order('created_at', { ascending: false })
				.limit(50),
			db
				.from('game_recipe_revisions')
				.select('id,recipe_id,definition,checksum,status,preference_revision')
				.order('created_at', { ascending: false })
				.limit(100),
			db.from('game_devices').select('id,child_ids,expires_at,revoked_at').is('revoked_at', null),
			db
				.from('game_sessions')
				.select('id,child_id,recipe_revision_id,created_at,state,snapshot')
				.eq('status', 'completed')
				.eq('preview', false)
				.order('created_at', { ascending: false })
				.limit(100),
			rpc<GenerationQuota>('wk_generation_quota', { p_daily: generationPolicy.dailyJobs }),
			db.rpc('wk_parent_point_totals')
		]);
	const completedSessions = checkResult(sessions) ?? [];
	const sessionIds = completedSessions.map((session) => String(session.id));
	const evidence: (Practice & { id: string; child_id: number })[] = [];
	let evidenceTruncated = false;
	for (let offset = 0; sessionIds.length && offset < 5000; offset += 1000) {
		const finalPage = offset === 4000;
		const page = checkResult(
			await db
				.from('game_attempts')
				.select(
					'id,child_id,session_id,word,word_source,skill,mechanic,assistance,first_try,correct,review,created_at'
				)
				.in('session_id', sessionIds)
				.order('created_at', { ascending: false })
				.order('id', { ascending: false })
				.range(offset, offset + (finalPage ? 1000 : 999))
		) as (Practice & { id: string; child_id: number })[] | null;
		const rows = page ?? [];
		if (finalPage && rows.length > 1000) {
			evidence.push(...rows.slice(0, 1000));
			evidenceTruncated = true;
			break;
		}
		evidence.push(...rows);
		if (rows.length < 1000) break;
	}
	const points = (checkResult(pointTotals) ?? []) as { child_id: number; points: number }[];
	const evidenceByChild = new Map<number, typeof evidence>();
	for (const attempt of evidence) {
		const childId = Number(attempt.child_id);
		const rows = evidenceByChild.get(childId) ?? [];
		rows.push(attempt);
		evidenceByChild.set(childId, rows);
	}
	const sessionsByChild = new Map<number, typeof completedSessions>();
	for (const session of completedSessions) {
		const childId = Number(session.child_id);
		const rows = sessionsByChild.get(childId) ?? [];
		rows.push(session);
		sessionsByChild.set(childId, rows);
	}
	const pointsByChild = new Map<number, number>();
	for (const row of points)
		pointsByChild.set(
			Number(row.child_id),
			(pointsByChild.get(Number(row.child_id)) ?? 0) + row.points
		);
	const profiles = [];
	const childRows = checkResult(children) ?? [];
	for (let offset = 0; offset < childRows.length; offset += 4)
		profiles.push(
			...(await Promise.all(
				childRows.slice(offset, offset + 4).map(async (c) => {
					const context = await learningContext(Number(c.id));
					const childEvidence = evidenceByChild.get(Number(c.id)) ?? [];
					const completed = sessionsByChild.get(Number(c.id)) ?? [];
					const words = [...new Set(childEvidence.map((a) => a.word))].flatMap((word) =>
						['spelling', 'vocabulary']
							.map((skill) => {
								const recent = childEvidence.filter(
									(a) => a.word === word && a.skill === skill && !a.review
								);
								const independent = recent.filter(
									(a) => a.assistance === 'independent' && a.first_try
								);
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
						progress: recipeProgress(completed, childEvidence),
						sessions: completed.map((s) => ({
							id: s.id,
							title: s.snapshot.recipe?.title ?? 'Recipe',
							revisionId: s.recipe_revision_id,
							date: s.created_at,
							activeMs: s.state.activeMs ?? 0,
							evidence: childEvidence.filter((a) => a.session_id === s.id)
						})),
						points: pointsByChild.get(Number(c.id)) ?? 0,
						words
					};
				})
			))
		);
	return {
		generationQuota,
		evidenceTruncated,
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
