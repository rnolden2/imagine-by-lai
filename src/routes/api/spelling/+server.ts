import { getDb } from '$lib/server/db';
import { json } from '@sveltejs/kit';

export async function POST({ request }) {
	const { userId, sessionId, word, grade, attemptsUsed, isCorrect } = await request.json();

	const db = getDb();
	db.prepare(
		`INSERT INTO spelling_attempts (user_id, session_id, word, grade, attempts_used, is_correct)
     VALUES (?, ?, ?, ?, ?, ?)`
	).run(userId ?? null, sessionId, word, grade, attemptsUsed, isCorrect ? 1 : 0);

	return json({ success: true });
}
