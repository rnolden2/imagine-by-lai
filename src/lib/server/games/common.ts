import { createHash } from 'node:crypto';
import { error, type RequestEvent } from '@sveltejs/kit';
import { getSupabase } from '$lib/server/db';
import { z } from 'zod';

export const hash = (value: unknown) =>
	createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function requireParent(event: RequestEvent) {
	if (!event.locals.user?.isAdmin) error(403, 'Parent access required.');
}
export function requireOrigin(event: RequestEvent) {
	if (event.request.headers.get('origin') !== event.url.origin)
		error(403, 'Same-origin request required.');
}
export async function readBody<T>(event: RequestEvent, schema: z.ZodType<T>): Promise<T> {
	if (Number(event.request.headers.get('content-length') ?? 0) > 65536)
		error(413, 'Request is too large.');
	const text = await event.request.text();
	if (text.length > 65536) error(413, 'Request is too large.');
	try {
		return schema.parse(JSON.parse(text));
	} catch {
		error(400, 'Invalid request.');
	}
}
export async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
	const db = await getSupabase();
	const result = await db.rpc(name, args);
	if (result.error) {
		const code = result.error.message;
		const known = [
			'STATE_CONFLICT',
			'IDEMPOTENCY_CONFLICT',
			'PREFERENCES_CHANGED',
			'REVISION_CHANGED',
			'RECIPE_BLOCKED',
			'SESSION_EXPIRED',
			'SESSION_FINISHED',
			'DAILY_LIMIT',
			'GENERATION_BUSY',
			'BUDGET_EXCEEDED',
			'BUDGET_NOT_CONFIGURED',
			'STALE_LEASE',
			'CANCELLED'
		];
		if (known.some((k) => code.includes(k))) error(409, known.find((k) => code.includes(k))!);
		if (code.includes('NOT_FOUND')) error(404, 'Not found.');
		console.error('word-kitchen.database', { operation: name, code: result.error.code });
		error(503, 'Game progress could not be saved. Please retry.');
	}
	return result.data as T;
}
export async function limit(scope: string, count: number, seconds: number) {
	if (
		!(await rpc<boolean>('wk_rate_limit', { p_scope: scope, p_limit: count, p_seconds: seconds }))
	)
		error(429, 'Please wait a moment and try again.');
}
export function checkResult<T>(result: { data: T; error: unknown }): T {
	if (result.error) {
		console.error('word-kitchen.database', { failed: true });
		error(503, 'The game service is temporarily unavailable.');
	}
	return result.data;
}
export const childIdSchema = z.number().int().positive().safe();
