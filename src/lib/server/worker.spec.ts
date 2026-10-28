import { generateKeyPairSync, sign } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import type { RequestEvent } from '@sveltejs/kit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
	createTask: vi.fn(),
	config: {
		WORD_KITCHEN_TASK_QUEUE: 'projects/test/locations/test/queues/test',
		WORD_KITCHEN_WORKER_URL: 'https://worker.test',
		WORD_KITCHEN_WORKER_SERVICE_ACCOUNT: 'worker@test.iam.gserviceaccount.com'
	} as Record<string, string>
}));
vi.mock('#lib/server/runtime-config', () => ({ env: fixtures.config }));
vi.mock('@google-cloud/tasks', () => ({
	CloudTasksClient: class {
		createTask = fixtures.createTask;
	}
}));
import { createWorkerTask, requireWorkerConfig, verifyWorker } from './worker';

// Ephemeral fixture keys exercise the real SDK verifier without credentials or network.
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const config = { ...fixtures.config };
const task = {
	id: 'wk-fixture-outbox',
	path: '/api/internal/word-kitchen/worker' as const,
	payload: { jobId: 'fixture-job' },
	notBefore: '2026-10-23T12:00:00.100Z'
};
function token(overrides: Record<string, unknown> = {}, forged = false) {
	const now = Math.floor(Date.now() / 1000);
	const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'fixture' })).toString(
		'base64url'
	);
	const payload = Buffer.from(
		JSON.stringify({
			iss: 'https://accounts.google.com',
			aud: config.WORD_KITCHEN_WORKER_URL,
			sub: 'fixture-worker-subject',
			email: config.WORD_KITCHEN_WORKER_SERVICE_ACCOUNT,
			email_verified: true,
			iat: now - 60,
			exp: now + 3600,
			...overrides
		})
	).toString('base64url');
	const signed = `${header}.${payload}`;
	return `${signed}.${sign('RSA-SHA256', Buffer.from(forged ? `${signed}tampered` : signed), privateKey).toString('base64url')}`;
}
function event(authorization?: string) {
	return {
		request: new Request('https://worker.test/api/internal/word-kitchen/worker', {
			method: 'POST',
			headers: authorization ? { authorization } : {}
		})
	} as RequestEvent;
}
beforeEach(() => {
	vi.clearAllMocks();
	Object.assign(fixtures.config, config);
	vi.spyOn(OAuth2Client.prototype, 'getFederatedSignonCertsAsync').mockResolvedValue({
		certs: { fixture: publicKey.export({ type: 'spki', format: 'pem' }).toString() },
		format: 'PEM' as Awaited<ReturnType<OAuth2Client['getFederatedSignonCertsAsync']>>['format']
	});
	fixtures.createTask.mockResolvedValue([{}]);
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

it('accepts a correctly signed token for the configured audience and verified worker account', async () => {
	await expect(verifyWorker(event(`Bearer ${token()}`))).resolves.toBeUndefined();
});

it.each([
	['wrong audience', { aud: 'https://another-app.test' }],
	['wrong issuer', { iss: 'https://attacker.test' }],
	['wrong account', { email: 'another@test.iam.gserviceaccount.com' }],
	['unverified email', { email_verified: false }],
	['truthy nonboolean verification', { email_verified: 'false' }],
	['missing email', { email: undefined }],
	['expired token', { iat: 1, exp: 2 }],
	['future token', { iat: 9999999999, exp: 10000000000 }]
])('rejects %s without exposing claims', async (_, claims) => {
	await expect(verifyWorker(event(`Bearer ${token(claims)}`))).rejects.toMatchObject({
		status: 403,
		body: { message: 'Worker authentication failed.' }
	});
});

it('rejects a forged signature even when all claims name the authorized worker', async () => {
	await expect(verifyWorker(event(`Bearer ${token({}, true)}`))).rejects.toMatchObject({
		status: 403
	});
});

it.each([
	undefined,
	'Basic fixture',
	'Bearer invalid',
	'Bearer a.b.c extra',
	`Bearer ${'a'.repeat(16384)}.b.c`
])(
	'rejects missing or malformed authorization before requesting certificates (%#)',
	async (header) => {
		await expect(verifyWorker(event(header))).rejects.toMatchObject({ status: 401 });
		expect(OAuth2Client.prototype.getFederatedSignonCertsAsync).not.toHaveBeenCalled();
	}
);

it('fails closed on certificate retrieval errors without returning provider details', async () => {
	vi.mocked(OAuth2Client.prototype.getFederatedSignonCertsAsync).mockRejectedValue(
		new Error('private SDK error')
	);
	await expect(verifyWorker(event(`Bearer ${token()}`))).rejects.toMatchObject({
		status: 403,
		body: { message: 'Worker authentication failed.' }
	});
});

it('bounds a stalled certificate lookup and fails closed', async () => {
	vi.useFakeTimers();
	vi.mocked(OAuth2Client.prototype.getFederatedSignonCertsAsync).mockReturnValue(
		new Promise(() => {})
	);
	const result = expect(verifyWorker(event(`Bearer ${token()}`))).rejects.toMatchObject({
		status: 503,
		body: { message: 'Worker authentication timed out.' }
	});
	await vi.advanceTimersByTimeAsync(10000);
	await result;
});

it.each(Object.keys(config))('fails closed when %s is not configured', async (key) => {
	delete fixtures.config[key];
	expect(requireWorkerConfig).toThrow();
	await expect(verifyWorker(event(`Bearer ${token()}`))).rejects.toMatchObject({ status: 503 });
	await expect(createWorkerTask(task)).rejects.toMatchObject({ status: 503 });
	expect(fixtures.createTask).not.toHaveBeenCalled();
});

it('delivers a bounded authenticated task with its persisted identity and scheduled time', async () => {
	await createWorkerTask(task);
	expect(fixtures.createTask).toHaveBeenCalledExactlyOnceWith(
		{
			parent: config.WORD_KITCHEN_TASK_QUEUE,
			task: {
				name: `${config.WORD_KITCHEN_TASK_QUEUE}/tasks/${task.id}`,
				scheduleTime: { seconds: Math.ceil(Date.parse(task.notBefore) / 1000) },
				dispatchDeadline: { seconds: 300 },
				httpRequest: {
					httpMethod: 'POST',
					url: `${config.WORD_KITCHEN_WORKER_URL}${task.path}`,
					headers: { 'Content-Type': 'application/json' },
					body: Buffer.from(JSON.stringify(task.payload)).toString('base64'),
					oidcToken: {
						serviceAccountEmail: config.WORD_KITCHEN_WORKER_SERVICE_ACCOUNT,
						audience: config.WORD_KITCHEN_WORKER_URL
					}
				}
			}
		},
		{ timeout: 10000, retry: null }
	);
});

it('handles an ambiguous delivery by retrying the same task identity', async () => {
	vi.useFakeTimers();
	fixtures.createTask.mockReturnValueOnce(new Promise(() => {}));
	const result = expect(createWorkerTask(task)).rejects.toThrow('Background task delivery failed.');
	await vi.advanceTimersByTimeAsync(15000);
	await result;
	fixtures.createTask.mockRejectedValueOnce({ code: 6 });
	await expect(createWorkerTask(task)).resolves.toBeUndefined();
	expect(fixtures.createTask.mock.calls[0]).toEqual(fixtures.createTask.mock.calls[1]);
});

it.each([new Error('private details'), { code: 14, message: 'private details' }, null])(
	'reports delivery failure without provider details (%#)',
	async (cause) => {
		fixtures.createTask.mockRejectedValueOnce(cause);
		await expect(createWorkerTask(task)).rejects.toThrow('Background task delivery failed.');
	}
);

it.each([{ id: '../bad' }, { notBefore: 'invalid-date' }])(
	'rejects invalid persisted task metadata before external calls (%#)',
	async (invalid) => {
		await expect(createWorkerTask({ ...task, ...invalid })).rejects.toThrow(
			'Invalid persisted task metadata.'
		);
		expect(fixtures.createTask).not.toHaveBeenCalled();
	}
);
