import { CloudTasksClient } from '@google-cloud/tasks';
import { OAuth2Client } from 'google-auth-library';
import { env } from '#lib/server/runtime-config';
import { error, type RequestEvent } from '@sveltejs/kit';

let tasks: CloudTasksClient | undefined;
const auth = new OAuth2Client({ transporterOptions: { timeout: 5000 } });

export function hasWorkerConfig() {
	return Boolean(
		env.WORD_KITCHEN_TASK_QUEUE &&
			env.WORD_KITCHEN_WORKER_URL &&
			env.WORD_KITCHEN_WORKER_SERVICE_ACCOUNT
	);
}

// Keep the deployed configuration names while sharing transport across job types.
export function requireWorkerConfig() {
	const queue = env.WORD_KITCHEN_TASK_QUEUE;
	const audience = env.WORD_KITCHEN_WORKER_URL;
	const serviceAccount = env.WORD_KITCHEN_WORKER_SERVICE_ACCOUNT;
	if (!hasWorkerConfig() || !queue || !audience || !serviceAccount)
		error(503, 'Background generation is not configured yet.');
	return { queue, audience, serviceAccount };
}

class WorkerTimeout extends Error {
	constructor() {
		super('Background task service timed out.');
	}
}

async function bounded<T>(work: Promise<T>, milliseconds: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			work,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new WorkerTimeout()), milliseconds);
			})
		]);
	} finally {
		clearTimeout(timer);
	}
}

export async function verifyWorker(event: RequestEvent) {
	const { audience, serviceAccount } = requireWorkerConfig();
	const header = event.request.headers.get('authorization');
	// Reject other schemes and malformed/oversized tokens before certificate lookup.
	const token =
		header && header.length <= 16384
			? /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(header)?.[1]
			: undefined;
	if (!token) error(401, 'Worker authentication required.');
	try {
		// The SDK verifies the signature, issuer, expiry, and exact audience.
		const ticket = await bounded(auth.verifyIdToken({ idToken: token, audience }), 10000);
		const claims = ticket.getPayload();
		if (claims?.email_verified !== true || claims.email !== serviceAccount)
			throw new Error('INVALID_WORKER');
	} catch (cause) {
		// Never log tokens, decoded claims, or SDK errors containing either.
		if (cause instanceof WorkerTimeout) error(503, 'Worker authentication timed out.');
		error(403, 'Worker authentication failed.');
	}
}

/** A persisted outbox identity must be reused after every delivery failure. */
export async function createWorkerTask(input: {
	id: string;
	path: `/api/internal/${string}`;
	payload: unknown;
	notBefore: string;
}) {
	const { queue, audience, serviceAccount } = requireWorkerConfig();
	const scheduled = Date.parse(input.notBefore);
	if (!Number.isFinite(scheduled) || !/^[A-Za-z0-9_-]{1,500}$/.test(input.id))
		throw new Error('Invalid persisted task metadata.');
	tasks ??= new CloudTasksClient();
	try {
		await bounded(
			tasks.createTask(
				{
					parent: queue,
					task: {
						name: `${queue}/tasks/${input.id}`,
						scheduleTime: { seconds: Math.ceil(scheduled / 1000) },
						dispatchDeadline: { seconds: 300 },
						httpRequest: {
							httpMethod: 'POST',
							url: `${audience.replace(/\/$/, '')}${input.path}`,
							headers: { 'Content-Type': 'application/json' },
							body: Buffer.from(JSON.stringify(input.payload)).toString('base64'),
							oidcToken: { serviceAccountEmail: serviceAccount, audience }
						}
					}
				},
				{ timeout: 10000, retry: null }
			),
			15000
		);
	} catch (cause) {
		// ALREADY_EXISTS also covers a successful create whose response was lost.
		if (typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 6) return;
		// A timeout can leave creation in flight. Reuse the name on retry; workers must
		// also fence duplicate deliveries beyond the service's deduplication window.
		throw new Error('Background task delivery failed.');
	}
}
