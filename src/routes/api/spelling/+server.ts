import { getSupabase, getSupabaseErrorMessage, throwSupabaseError } from '$lib/server/db';
import { json } from '@sveltejs/kit';

export async function POST({ request }) {
	const { userId, childId, sessionId, word, grade, attemptsUsed, isCorrect } = await request.json();

	try {
		const supabase = await getSupabase();
		const { error } = await supabase.from('spelling_attempts').insert({
			child_id: childId ?? userId ?? null,
			session_id: sessionId,
			word,
			grade,
			attempts_used: attemptsUsed,
			is_correct: Boolean(isCorrect)
		});

		if (error) throwSupabaseError('logging spelling attempt', error);
	} catch (error) {
		console.error('Failed to log spelling attempt:', error);
		return json({ success: false, error: getSupabaseErrorMessage(error) }, { status: 503 });
	}

	return json({ success: true });
}
