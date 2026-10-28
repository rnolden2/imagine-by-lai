import { receiptSchema, recordPractice } from '#lib/server/practice-history';
import { readBody, requireOrigin } from '#lib/server/request';
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

const schema = z
	.object({
		...receiptSchema.shape,
		childId: z.number().int().positive().safe().optional(),
		userId: z.number().int().positive().safe().optional(),
		sessionId: z.string().uuid(),
		word: z
			.string()
			.trim()
			.min(1)
			.max(80)
			.regex(/^[\p{L}\p{M}' -]+$/u),
		grade: z.enum(['TK', 'K', '1', '2', '3', '4', '5', '6', '7', '8']),
		attemptsUsed: z.number().int().min(1).max(3),
		givenAnswer: z.string().trim().min(1).max(80),
		isCorrect: z.boolean().optional()
	})
	.refine((b) => !!(b.childId ?? b.userId) && (!b.childId || !b.userId || b.childId === b.userId));

export const POST: RequestHandler = async (event) => {
	requireOrigin(event);
	const body = await readBody(event, schema, 8192);
	const childId = (body.childId ?? body.userId)!;
	await recordPractice(event, 'spelling', body, {
		child_id: childId,
		session_id: body.sessionId,
		word: body.word,
		grade: body.grade,
		attempts_used: body.attemptsUsed,
		is_correct:
			body.givenAnswer.normalize('NFC').toLowerCase() === body.word.normalize('NFC').toLowerCase()
	});
	return json({ success: true });
};
