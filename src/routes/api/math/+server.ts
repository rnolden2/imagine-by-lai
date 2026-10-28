import { parseMathAttempt } from '#lib/server/math-attempt';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { receiptSchema, recordPractice } from '#lib/server/practice-history';
import { readBody, requireOrigin } from '#lib/server/request';

export const POST: RequestHandler = async (event) => {
	requireOrigin(event);
	const body = await readBody(event, receiptSchema.passthrough(), 8192);
	const attempt = parseMathAttempt(body);
	if (!attempt) return json({ success: false, error: 'Invalid math attempt.' }, { status: 400 });
	await recordPractice(event, 'math', body, attempt);
	return json({ success: true });
};
