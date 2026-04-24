import { getDb } from '$lib/server/db';
import { json } from '@sveltejs/kit';

export async function POST({ request }) {
	const { userId, sessionId, operation, num1, num2, correctAnswer, givenAnswer, isCorrect } =
		await request.json();

	const db = getDb();
	db.prepare(
		`INSERT INTO math_attempts (user_id, session_id, operation, num1, num2, correct_answer, given_answer, is_correct)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
	).run(
		userId ?? null,
		sessionId,
		operation,
		num1,
		num2,
		correctAnswer,
		givenAnswer,
		isCorrect ? 1 : 0
	);

	return json({ success: true });
}
