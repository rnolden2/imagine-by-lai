export type Practice = {
	session_id: string;
	word: string;
	word_source: string;
	skill: string;
	mechanic: string;
	assistance: string;
	first_try: boolean;
	correct: boolean;
	review: boolean;
	created_at: string;
};
export type CompletedSession = {
	id: string;
	recipe_revision_id: string;
	created_at: string;
	state: { activeMs?: number };
	snapshot: { recipe?: { recipeId?: string; title?: string } };
};
/** Game familiarity is reported per recipe and skill, never as school spelling mastery. */
export function recipeProgress(sessions: CompletedSession[], attempts: Practice[]) {
	const families = [
		...new Set(sessions.map((s) => s.snapshot.recipe?.recipeId ?? s.recipe_revision_id))
	];
	return families.map((id) => {
		const recent = sessions
			.filter((s) => (s.snapshot.recipe?.recipeId ?? s.recipe_revision_id) === id)
			.slice(0, 3);
		const selected = new Set(recent.map((s) => s.id));
		const evidence = attempts.filter(
			(a) => selected.has(a.session_id) && a.word_source === 'cooking' && !a.review
		);
		const skills = ['spelling', 'vocabulary'].map((skill) => {
			const occurrences = evidence.filter((a) => a.skill === skill && a.first_try);
			const correct = occurrences.filter((a) => a.correct && a.assistance === 'independent').length;
			const rate = occurrences.length ? correct / occurrences.length : 0;
			const days = new Set(occurrences.map((a) => a.created_at.slice(0, 10))).size;
			const level =
				rate >= 0.8 && occurrences.length >= 10 && days >= 2
					? 3
					: rate >= 0.6 && occurrences.length >= 6
						? 2
						: 1;
			return { skill, level, occurrences: occurrences.length, firstTryIndependent: correct };
		});
		return {
			id,
			title: recent[0].snapshot.recipe?.title ?? 'Recipe',
			policy: 'recipe-familiarity.v1',
			skills
		};
	});
}
