import { getSupabase, getSupabaseErrorMessage, throwSupabaseError } from '$lib/server/db';
import { json } from '@sveltejs/kit';

export async function POST({ request }) {
	const {
		userId,
		childId,
		sessionId,
		operation,
		problemState,
		num1,
		num2,
		correctAnswer,
		givenAnswer,
		isCorrect
	} = await request.json();

	const resolvedChildId = childId ?? userId ?? null;
	const state = problemState ?? { num1, num2 };

	try {
		const supabase = await getSupabase();
		const { error } = await supabase.from('math_attempts').insert({
			child_id: resolvedChildId,
			session_id: sessionId,
			operation,
			problem_state: state,
			correct_answer: String(correctAnswer),
			given_answer: String(givenAnswer),
			is_correct: Boolean(isCorrect)
		});

		if (error) throwSupabaseError('logging math attempt', error);
	} catch (error) {
		console.error('Failed to log math attempt:', error);
		return json({ success: false, error: getSupabaseErrorMessage(error) }, { status: 503 });
	}

	return json({ success: true });
}
