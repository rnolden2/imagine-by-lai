import { randomInt, randomUUID } from 'node:crypto';
import { error, type RequestEvent } from '@sveltejs/kit';
import { getSupabase } from '$lib/server/db';
import {
	validateRecipe,
	type GameEvent,
	type SessionSnapshot,
	type SessionState,
	type Recipe,
	grades
} from '$lib/games/word-kitchen/contracts';
import { applyEvent, initialState, presentStep, summarize } from '$lib/games/word-kitchen/engine';
import { requireChild } from './authorization';
import { checkResult, hash, limit, rpc } from './common';
import { bindSession, learningContext } from './learning-context';
import { deliveryManifest } from './assets';

export type SessionRow = {
	id: string;
	child_id: number;
	recipe_revision_id: string;
	device_id: string | null;
	preview: boolean;
	snapshot: SessionSnapshot;
	state: SessionState;
	sequence: number;
	status: string;
	expires_at: string;
	preference_revision: number;
	created_at: string;
};
export function compatible(recipe: Recipe, exclusions: string[]) {
	return ![...recipe.ingredientConceptIds, ...recipe.exclusionTags].some((id) =>
		exclusions.includes(id)
	);
}
export async function sessionRow(event: RequestEvent, id: string) {
	const db = await getSupabase();
	const row = checkResult(
		await db.from('game_sessions').select('*').eq('id', id).maybeSingle()
	) as SessionRow | null;
	if (!row) error(404, 'Not found.');
	const scope = await requireChild(event, Number(row.child_id));
	if ((row.preview && !scope.parent) || (!scope.parent && row.device_id !== scope.deviceId))
		error(404, 'Not found.');
	return row;
}
export async function envelope(row: SessionRow) {
	const snapshot = row.snapshot;
	const state = row.state;
	return {
		id: row.id,
		childId: Number(row.child_id),
		preview: row.preview,
		title: snapshot.recipe.title,
		status: state.status,
		sequence: state.sequence,
		expiresAt: row.expires_at,
		step: presentStep(snapshot.steps[state.index], state, snapshot.seed),
		totalSteps: snapshot.steps.length,
		completedSteps: state.completed.length,
		scene: state.scene,
		decorations: state.decorations,
		feedback: state.feedback,
		manifest: await deliveryManifest(snapshot.recipe),
		results: state.status === 'completed' || state.status === 'abandoned' ? summarize(state) : null
	};
}
export async function startSession(
	event: RequestEvent,
	childId: number,
	revisionId: string,
	duration: 5 | 8 | 10,
	key: string,
	preview = false
) {
	const scope = await requireChild(event, childId);
	if (preview && !scope.parent) error(403, 'Parent access required.');
	await limit(`start:${scope.deviceId ?? 'parent'}`, 20, 3600);
	const db = await getSupabase();
	const revision = checkResult(
		await db.from('game_recipe_revisions').select('*').eq('id', revisionId).maybeSingle()
	);
	if (!revision) error(404, 'Not found.');
	const context = await learningContext(childId);
	const recipe = validateRecipe(revision.definition);
	if (
		grades.indexOf(context.child.grade) < grades.indexOf(recipe.gradeBand.min) ||
		grades.indexOf(context.child.grade) > grades.indexOf(recipe.gradeBand.max)
	)
		error(409, 'RECIPE_BLOCKED');
	if (!compatible(recipe, context.settings.excludedFoodConceptIds)) error(409, 'RECIPE_BLOCKED');
	if (!recipe.supportedDurations.includes(duration)) error(400, 'Unsupported duration.');
	await deliveryManifest(recipe); // Fail before creating a session with missing critical assets.
	const snapshot = bindSession(recipe, context, duration, randomInt(1, 2147483647));
	const row = await rpc<SessionRow>('wk_start_session', {
		p_id: randomUUID(),
		p_child: childId,
		p_revision: revisionId,
		p_device: scope.deviceId,
		p_preview: preview,
		p_key: key,
		p_hash: hash({ childId, revisionId, duration, preview }),
		p_snapshot: snapshot,
		p_state: initialState(),
		p_preferences: context.settings.revision
	});
	return envelope(row);
}
export async function submitEvent(event: RequestEvent, id: string, input: GameEvent) {
	const row = await sessionRow(event, id);
	await limit(`event:${id}`, 180, 60);
	const db = await getSupabase();
	const previous = checkResult(
		await db
			.from('game_session_events')
			.select('request_hash,response')
			.eq('session_id', id)
			.eq('event_id', input.eventId)
			.maybeSingle()
	);
	const requestHash = hash(input);
	if (previous) {
		if (previous.request_hash !== requestHash) error(409, 'IDEMPOTENCY_CONFLICT');
		return envelope(previous.response as SessionRow);
	}
	if (Date.parse(row.expires_at) < Date.now()) error(410, 'SESSION_EXPIRED');
	const context = await learningContext(Number(row.child_id));
	if (context.settings.revision !== row.preference_revision) error(409, 'PREFERENCES_CHANGED');
	if (!compatible(row.snapshot.recipe, context.settings.excludedFoodConceptIds))
		error(409, 'RECIPE_BLOCKED');
	let next: SessionState;
	try {
		next = applyEvent(row.snapshot, row.state, input);
	} catch (e) {
		error(409, e instanceof Error ? e.message : 'INVALID_EVENT');
	}
	const saved = await rpc<SessionRow>('wk_apply_event', {
		p_session: id,
		p_child: Number(row.child_id),
		p_event: input.eventId,
		p_hash: requestHash,
		p_sequence: input.expectedSequence,
		p_type: input.type,
		p_state: next,
		p_evidence: next.evidence.slice(row.state.evidence.length)
	});
	console.info('word-kitchen.event', {
		sessionId: id,
		eventId: input.eventId,
		type: input.type,
		status: saved.status
	});
	return envelope(saved);
}
