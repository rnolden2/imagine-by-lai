import { afterEach, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { SupabaseConnectionError } from '#lib/server/db/errors';

vi.mock('#lib/server/secrets', () => ({ ADMIN_PASSWORD: 'fixture-password' }));
vi.mock('#lib/server/application-security', () => ({ authorizeRequest: vi.fn() }));
vi.mock('#lib/server/db', async () => import('#lib/server/db/errors'));
import { handleError } from './hooks.server';

const event = {
	locals: { requestId: 'fixture-request' },
	route: { id: '/api/math' }
} as RequestEvent;

afterEach(() => vi.restoreAllMocks());

it('preserves intentional HTTP errors without logging client rejections as server failures', async () => {
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	expect(
		await handleError({
			kind: 'app',
			error: { status: 403, message: 'Parent access required.' },
			event
		})
	).toBeUndefined();
	expect(log).not.toHaveBeenCalled();
});

it('records only safe metadata for intentional server failures', async () => {
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	expect(
		await handleError({ kind: 'app', error: { status: 503, message: 'Temporary failure.' }, event })
	).toBeUndefined();
	expect(log).toHaveBeenCalledWith('request.failed', {
		requestId: 'fixture-request',
		route: '/api/math',
		status: 503,
		kind: 'app',
		code: 'HTTP_ERROR'
	});
});

it('redacts unexpected exception details from responses and diagnostics', async () => {
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	const result = await handleError({
		kind: 'unknown',
		error: new Error('private provider payload'),
		event
	});
	expect(result).toMatchObject({
		code: 'SERVER_ERROR',
		message: 'An unexpected server error occurred.'
	});
	expect(JSON.stringify([result, log.mock.calls])).not.toContain('private provider payload');
});

it('reports database unavailability as retryable HTTP 503 without exposing its cause', async () => {
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	const result = await handleError({
		kind: 'unknown',
		error: new SupabaseConnectionError('private database detail'),
		event
	});
	expect(result).toMatchObject({ status: 503, code: 'SUPABASE_CONNECTION', retryable: true });
	expect(log).toHaveBeenCalledWith(
		'request.failed',
		expect.objectContaining({ status: 503, code: 'DATABASE_UNAVAILABLE' })
	);
	expect(JSON.stringify([result, log.mock.calls])).not.toContain('private database detail');
});
