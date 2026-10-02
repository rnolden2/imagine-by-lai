import {
	type BoundStep,
	type Evidence,
	type GameEvent,
	type SessionSnapshot,
	type SessionState
} from './contracts';

export const normalizeAnswer = (word: string, locale = 'en-US') =>
	word.normalize('NFKC').trim().toLocaleLowerCase(locale);
export function seededRandom(seed: number) {
	let state = seed >>> 0;
	return () => {
		state += 0x6d2b79f5;
		let n = Math.imul(state ^ (state >>> 15), 1 | state);
		n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
		return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
	};
}
export type Candidate = {
	id: string;
	word: string;
	source: 'custom' | 'grade_list' | 'cooking';
	attempts: number;
	correct: number;
	lastPracticedAt?: string;
};
export function selectWords(
	candidates: Candidate[],
	count: number,
	seed: number,
	now = Date.now()
): Candidate[] {
	const random = seededRandom(seed);
	const unique = [...new Map(candidates.map((c) => [normalizeAnswer(c.word), c])).values()];
	const rank = (c: Candidate) =>
		0.55 * (1 - (c.correct + 1) / (c.attempts + 2)) +
		0.3 *
			(c.lastPracticedAt
				? Math.max(0, Math.min((now - Date.parse(c.lastPracticedAt)) / 604800000, 1))
				: 1) +
		0.15 * (c.attempts < 2 ? 1 : 0);
	const remaining = unique.map((c) => ({ ...c, weight: rank(c) }));
	const selected: Candidate[] = [];
	// Reserve one genuinely practiced, lower-priority word when enough slots exist.
	if (count >= 3) {
		const familiar = remaining
			.filter((c) => c.attempts >= 2)
			.sort((a, b) => a.weight - b.weight)[0];
		if (familiar) {
			selected.push(familiar);
			remaining.splice(remaining.indexOf(familiar), 1);
		}
	}
	while (selected.length < count && remaining.length) {
		let target = random() * remaining.reduce((s, c) => s + c.weight, 0);
		let index = 0;
		while (index < remaining.length - 1 && (target -= remaining[index].weight) > 0) index++;
		selected.push(remaining.splice(index, 1)[0]);
	}
	return selected;
}
export function initialState(now = Date.now()): SessionState {
	return {
		index: 0,
		sequence: 0,
		status: 'active',
		scene: {},
		assistance: {},
		submissions: {},
		evidence: [],
		completed: [],
		decorations: [],
		activeMs: 0,
		lastActiveAt: now,
		points: 0,
		feedback: ''
	};
}
export function pointsFor(state: SessionState, snapshot: SessionSnapshot) {
	const primary = snapshot.steps.filter((s) => s.kind === 'challenge' && !s.review);
	return (
		50 +
		primary.filter((s) => state.completed.includes(s.id)).length * 5 +
		state.evidence.filter(
			(e) => !e.review && e.correct && e.firstTry && e.assistance === 'independent'
		).length *
			2
	);
}
export function applyEvent(
	snapshot: SessionSnapshot,
	previous: SessionState,
	event: GameEvent,
	now = Date.now()
): SessionState {
	if (event.expectedSequence !== previous.sequence) throw new Error('STATE_CONFLICT');
	if (previous.status === 'completed' || previous.status === 'abandoned')
		throw new Error('SESSION_FINISHED');
	const step = snapshot.steps[previous.index];
	if (!step || step.id !== event.stepId) throw new Error('STATE_CONFLICT');
	const state = structuredClone(previous);
	state.sequence++;
	state.feedback = '';
	if (state.status === 'active')
		state.activeMs += Math.max(0, Math.min(now - state.lastActiveAt, 60000));
	state.lastActiveAt = now;
	if (event.type === 'abandon') {
		state.status = 'abandoned';
		return state;
	}
	if (event.type === 'pause') {
		state.status = 'paused';
		return state;
	}
	if (event.type === 'resume') {
		state.status = 'active';
		return state;
	}
	if (state.status === 'paused') throw new Error('SESSION_PAUSED');
	if (event.type === 'request_hint' || event.type === 'reveal_answer') {
		if (step.kind !== 'challenge') throw new Error('INVALID_EVENT');
		const current = state.assistance[step.id] ?? 'independent';
		state.assistance[step.id] =
			event.type === 'reveal_answer' ? 'guided' : current === 'guided' ? 'guided' : 'hinted';
		state.feedback =
			event.type === 'reveal_answer'
				? 'Let’s do it together. Select Continue when you are ready.'
				: 'Listen again and use the hint.';
		return state;
	}
	if (event.type === 'set_decoration') {
		if (step.mechanic !== 'decorate') throw new Error('INVALID_EVENT');
		const allowed = new Set(
			snapshot.recipe.assetRequirements
				.filter((a) => step.assetRoles.includes(a.role))
				.map((a) => a.conceptId)
		);
		const placements = event.payload.placements ?? [];
		if (
			placements.length > (step.config.maxPlacements ?? 12) ||
			placements.some((p) => !allowed.has(p.conceptId))
		)
			throw new Error('INVALID_DECORATION');
		state.decorations = placements;
		return state;
	}
	let advance = false;
	if (event.type === 'submit_answer') {
		if (step.kind !== 'challenge') throw new Error('INVALID_EVENT');
		const submission = (state.submissions[step.id] ?? 0) + 1;
		const assistance = state.assistance[step.id] ?? 'independent';
		const answer = event.payload.answer ?? '';
		const spelling = ['word_spell', 'letter_fill', 'word_unscramble'].includes(step.mechanic);
		const target = 'answer' in step.config ? step.config.answer : (step.word ?? '');
		const correct =
			(assistance === 'guided' && answer === '__guided_continue__') ||
			(spelling
				? (step.acceptedForms ?? [target]).some(
						(a) =>
							normalizeAnswer(a, snapshot.settings.locale) ===
							normalizeAnswer(answer, snapshot.settings.locale)
					)
				: target === answer);
		if (!answer) throw new Error('INVALID_ANSWER');
		const evidence: Evidence = {
			stepId: step.id,
			word: step.word ?? target,
			wordId: step.wordId,
			wordSource: step.wordSource ?? 'cooking',
			skill: spelling ? 'spelling' : 'vocabulary',
			mechanic: step.mechanic,
			correct,
			assistance,
			submission,
			review: !!step.review,
			firstTry: submission === 1
		};
		state.evidence.push(evidence);
		state.submissions[step.id] = submission;
		if (correct) {
			advance = true;
			state.feedback =
				assistance === 'independent' ? 'You did it!' : 'Nice work practicing together!';
		} else {
			if (submission >= 3) state.assistance[step.id] = 'guided';
			else if (submission >= 2) state.assistance[step.id] = 'hinted';
			state.feedback =
				submission >= 3
					? 'Let’s finish this one together.'
					: 'Let’s listen again. You can ask for help.';
		}
	} else if (event.type === 'complete_action') {
		if (step.kind === 'challenge') throw new Error('INVALID_EVENT');
		if (event.payload.action !== step.mechanic) throw new Error('INVALID_ACTION');
		if ('requires' in step.config) {
			for (const [key, value] of Object.entries(step.config.requires))
				if ((state.scene[key] ?? 'empty') !== value) throw new Error('INVALID_SCENE');
			Object.assign(state.scene, step.config.effects);
		}
		advance = true;
	} else throw new Error('INVALID_EVENT');
	if (advance) {
		state.completed.push(step.id);
		state.index++;
		if (step.kind === 'finish') {
			state.status = 'completed';
			state.points = pointsFor(state, snapshot);
		}
	}
	return state;
}
export function summarize(state: SessionState) {
	const completed = state.evidence.filter((e) => e.correct);
	return {
		points: state.points,
		activeMs: state.activeMs,
		uniqueWords: new Set(completed.map((e) => normalizeAnswer(e.word))).size,
		occurrences: completed.length,
		firstTryIndependent: completed.filter((e) => e.firstTry && e.assistance === 'independent')
			.length,
		assisted: completed.filter((e) => e.assistance !== 'independent').length,
		evidence: state.evidence
	};
}

export function presentStep(step: BoundStep | undefined, state: SessionState, seed: number) {
	if (!step) return null;
	const assistance = state.assistance[step.id] ?? 'independent';
	const revealed = assistance === 'guided';
	const answer = 'answer' in step.config ? step.config.answer : (step.word ?? '');
	const target =
		'choices' in step.config ? step.config.choices.find((c) => c.id === answer)?.label : step.word;
	const letters = Array.from(step.word ?? '');
	const random = seededRandom(seed + state.index);
	const tiles = letters.map((letter, index) => ({ id: `tile-${index}`, letter })); // shuffle preserves duplicate-letter identity
	for (let i = tiles.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[tiles[i], tiles[j]] = [tiles[j], tiles[i]];
	}
	const choices = 'choices' in step.config ? [...step.config.choices] : [];
	for (let i = choices.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[choices[i], choices[j]] = [choices[j], choices[i]];
	}
	return {
		id: step.id,
		kind: step.kind,
		mechanic: step.mechanic,
		instruction: step.instruction,
		choices,
		action:
			'actionLabel' in step.config
				? step.config.actionLabel
				: step.kind === 'finish'
					? 'Serve my dish'
					: '',
		actionObject: 'objectConceptId' in step.config ? step.config.objectConceptId : undefined,
 quantityLabel: 'quantityLabel' in step.config ? step.config.quantityLabel : undefined,
		assetRoles: step.assetRoles,
		review: !!step.review,
		assistance,
		hint:
			assistance !== 'independent' && step.word
				? `Starts with ${letters[0]}. ${letters.length} letters.`
				: null,
		revealedAnswer: revealed ? target : null,
		tiles: step.mechanic === 'word_unscramble' ? tiles : [],
		mask:
			step.mechanic === 'letter_fill'
				? letters.map((letter, i) => (i % 2 === 0 ? letter : '_')).join('')
				: null,
		position: state.index + 1
	};
}
