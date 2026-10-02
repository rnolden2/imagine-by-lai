import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { curatedRecipes } from '$lib/server/games/curated';
import { bindSession } from '$lib/server/games/learning-context';
import {
	validateRecipe,
	settingsSchema,
	type SessionSnapshot,
	type SessionState,
	type GameEvent
} from './contracts';
import { applyEvent, initialState, normalizeAnswer, presentStep, selectWords } from './engine';
const context = {
	child: { id: 1, name: 'Test', grade: '2' },
	settings: settingsSchema.parse({}),
	candidates: ['cat', 'sun', 'book', 'tree', 'boat', 'ship'].map((word, i) => ({
		id: `grade:2:${i}`,
		word,
		source: 'grade_list' as const,
		attempts: 0,
		correct: 0
	})),
	notice: ''
};
export const snapshot = (duration: 5 | 8 | 10 = 8, index = 0) =>
	bindSession(curatedRecipes[index], context, duration, 721);
export const event = (
	s: SessionState,
	snap: SessionSnapshot,
	type: GameEvent['type'],
	payload: GameEvent['payload'] = {}
) => ({
	eventId: randomUUID(),
	expectedSequence: s.sequence,
	stepId: snap.steps[s.index].id,
	type,
	payload
});
describe('complete curated paths', () => {
	for (let i = 0; i < 3; i++)
		for (const duration of [5, 8, 10] as const)
			it(`${curatedRecipes[i].title}: ${duration} minutes grades every step`, () => {
				const snap = snapshot(duration, i);
				let state = initialState();
				let count = 0;
				while (state.status === 'active') {
					const step = snap.steps[state.index];
					const payload =
						step.kind === 'challenge'
							? { answer: 'answer' in step.config ? step.config.answer : step.word! }
							: { action: step.mechanic };
					state = applyEvent(
						snap,
						state,
						event(
							state,
							snap,
							step.kind === 'challenge' ? 'submit_answer' : 'complete_action',
							payload
						)
					);
					if (++count > 60) throw new Error('cycle');
				}
				expect(state.status).toBe('completed');
				expect(state.points).toBe(50 + { 5: 6, 8: 10, 10: 12 }[duration] * 7);
				expect(state.evidence.filter((e) => !e.review)).toHaveLength(
					{ 5: 6, 8: 10, 10: 12 }[duration]
				);
			});
});
it('keeps Unicode normalization conservative', () => {
	expect(normalizeAnswer('  ＣＡＴ ')).toBe('cat');
	expect(normalizeAnswer('café')).not.toBe(normalizeAnswer('cafe'));
	expect(normalizeAnswer('ice-cream')).not.toBe(normalizeAnswer('ice cream'));
});
it('rejects invalid graphs, duplicate choices, and unresolved assets', () => {
	for (const mutate of [
		(r: (typeof curatedRecipes)[0]) => {
			r.steps[0].after = ['missing'];
		},
		(r: (typeof curatedRecipes)[0]) => {
			r.steps[0].assetRoles = ['absent'];
		},
		(r: (typeof curatedRecipes)[0]) => {
			r.steps[0].id = r.steps[1].id;
		}
	]) {
		const recipe = structuredClone(curatedRecipes[0]);
		mutate(recipe);
		expect(() => validateRecipe(recipe)).toThrow();
	}
});
it('prevents forged progression and stale sequences', () => {
	const snap = snapshot();
	const state = initialState();
	expect(() =>
		applyEvent(snap, state, {
			...event(state, snap, 'complete_action', { action: 'finish' }),
			stepId: 'forged'
		})
	).toThrow('STATE_CONFLICT');
	expect(() =>
		applyEvent(snap, state, event(state, snap, 'complete_action', { action: 'finish' }))
	).toThrow('INVALID_EVENT');
	expect(() =>
		applyEvent(snap, state, { ...event(state, snap, 'request_hint'), expectedSequence: 4 })
	).toThrow('STATE_CONFLICT');
});
it('tracks retries and guidance without giving first-try bonuses', () => {
	const snap = snapshot();
	let state = initialState();
	for (let i = 0; i < 3; i++)
		state = applyEvent(snap, state, event(state, snap, 'submit_answer', { answer: 'wrong' }));
	expect(state.index).toBe(0);
	expect(state.assistance[snap.steps[0].id]).toBe('guided');
	state = applyEvent(
		snap,
		state,
		event(state, snap, 'submit_answer', { answer: '__guided_continue__' })
	);
	expect(state.index).toBe(1);
	expect(state.evidence.at(-1)).toMatchObject({
		assistance: 'guided',
		firstTry: false,
		submission: 4
	});
});
it('does not include secret correct-choice keys in the public step', () => {
	const snap = snapshot();
	const step = presentStep(snap.steps[0], initialState(), snap.seed)!;
	expect(step).not.toHaveProperty('answer');
	expect(step).not.toHaveProperty('word');
	expect(step.revealedAnswer).toBeNull();
});
it('retains unique tile IDs for repeated letters', () => {
	const snap = snapshot();
	const source = snap.steps.find((s) => s.mechanic === 'word_unscramble')!;
	const step = presentStep({ ...source, word: 'banana' }, initialState(), 9)!;
	expect(new Set(step.tiles.map((t) => t.id)).size).toBe(6);
	expect(
		step.tiles
			.map((t) => t.letter)
			.sort()
			.join('')
	).toBe('aaabnn');
});
it('selects reproducibly without duplicate words and reserves a familiar word', () => {
	const candidates = [
		...context.candidates,
		{ id: 'familiar', word: 'familiar', source: 'custom' as const, attempts: 20, correct: 20 },
		{ ...context.candidates[0], word: 'CAT' }
	];
	const a = selectWords(candidates, 4, 123, 0);
	expect(a).toEqual(selectWords(candidates, 4, 123, 0));
	expect(a.some((w) => w.id === 'familiar')).toBe(true);
	expect(new Set(a.map((w) => normalizeAnswer(w.word))).size).toBe(4);
});
it('pauses without accumulating idle time and prevents answers while paused', () => {
	const snap = snapshot();
	let state = initialState(100);
	state = applyEvent(snap, state, event(state, snap, 'pause'), 1100);
	expect(state.activeMs).toBe(1000);
	expect(() =>
		applyEvent(snap, state, event(state, snap, 'submit_answer', { answer: 'choice-0' }), 100000)
	).toThrow('SESSION_PAUSED');
	state = applyEvent(snap, state, event(state, snap, 'resume'), 100000);
	expect(state.activeMs).toBe(1000);
});
