import { error } from '@sveltejs/kit';
import { getSupabase } from '$lib/server/db';
import { GRADE_WORD_LISTS } from '$lib/server/spelling-words';
import {
	settingsSchema,
	type Recipe,
	type SessionSnapshot,
	type BoundStep
} from '$lib/games/word-kitchen/contracts';
import { selectWords, normalizeAnswer, type Candidate } from '$lib/games/word-kitchen/engine';
import { checkResult } from './common';

export async function learningContext(childId: number) {
	const db = await getSupabase();
	const [childResult, settingsResult, wordResult, attemptResult] = await Promise.all([
		db.from('child_profiles').select('id,grade,name').eq('id', childId).maybeSingle(),
		db
			.from('game_child_settings')
			.select('settings,revision')
			.eq('child_id', childId)
			.maybeSingle(),
		db.from('spelling_words').select('id,word,grade'),
		db
			.from('spelling_attempts')
			.select('word,is_correct,attempts_used,created_at,game_attempt_id,mechanic,assistance')
			.eq('child_id', childId)
			.gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
			.order('created_at', { ascending: false })
			.limit(2000)
	]);
	const child = checkResult(childResult);
	if (!child) error(404, 'Child not found.');
	const row = checkResult(settingsResult);
	const settings = settingsSchema.parse({ ...row?.settings, revision: row?.revision ?? 0 });
	const custom = (checkResult(wordResult) ?? []).filter((w) => w.grade === child.grade);
	const attempts = checkResult(attemptResult) ?? [];
	const candidates: Candidate[] = [
		...custom.map((w) => ({ id: `custom:${w.id}`, word: w.word, source: 'custom' as const })),
		...(GRADE_WORD_LISTS[child.grade] ?? []).map((word, i) => ({
			id: `grade:${child.grade}:${i}`,
			word,
			source: 'grade_list' as const
		}))
	].map((word) => {
		const evidence = attempts
			.filter(
				(a) =>
					normalizeAnswer(a.word) === normalizeAnswer(word.word) &&
					(!a.game_attempt_id || (a.mechanic === 'word_spell' && a.assistance === 'independent'))
			)
			.slice(0, 20);
		// Legacy rows aggregate retries: first-try correctness is the conservative usable signal.
		return {
			...word,
			attempts: evidence.length,
			correct: evidence.filter((a) => a.is_correct && a.attempts_used === 1).length,
			lastPracticedAt: evidence[0]?.created_at
		};
	});
	return {
		child,
		settings,
		candidates,
		notice: custom.length
			? 'Using current custom and grade practice words.'
			: 'No custom words for this grade; using the built-in grade list.'
	};
}
export function bindSession(
	recipe: Recipe,
	context: Awaited<ReturnType<typeof learningContext>>,
	duration: 5 | 8 | 10,
	seed: number
): SessionSnapshot {
	const { settings, child } = context;
	const selected = recipe.steps.filter((s) => s.durationPresets.includes(duration));
	const slots = selected.filter((s) => s.wordBinding?.source === 'learning');
	const candidates = context.candidates.length
		? context.candidates
		: recipe.vocabulary.map((v) => ({
				id: `cooking:${v.id}`,
				word: v.word,
				source: 'cooking' as const,
				attempts: 0,
				correct: 0
			}));
	const words = selectWords(candidates, slots.length, seed);
	const bindings = new Map<string, Candidate>();
	let wordIndex = 0;
	const steps: BoundStep[] = selected.map((original) => {
		const step: BoundStep = structuredClone(original);
		const binding = step.wordBinding;
		if (binding?.source === 'cooking') {
			const word = recipe.vocabulary.find((v) => v.id === binding.vocabularyId)!;
			step.word = word.word;
			step.wordSource = 'cooking';
			step.wordId = `cooking:${word.id}`;
		} else if (binding) {
			let word: Candidate | undefined;
			if (binding.source === 'learning') {
				word = words[wordIndex % words.length];
				step.review = wordIndex >= words.length;
				wordIndex++;
				if (word) bindings.set(binding.slotId, word);
			} else {
				word = bindings.get(binding.slotId);
				step.review = true;
			}
			if (!word) throw new Error('NO_CONTENT');
			step.word = word.word;
			step.wordId = word.id;
			step.wordSource = word.source;
		}
		if (
			step.mechanic === 'word_spell' &&
			(settings.difficulty === 'supported' || ['TK', 'K'].includes(child.grade))
		)
			step.mechanic = 'letter_fill';
		return step;
	});
	return {
		steps,
		recipe,
		settings: { ...settings, targetMinutes: duration },
		seed,
		grade: child.grade,
		selectedWords: words.map((w) => ({ id: w.id, word: w.word, source: w.source }))
	};
}
