import { beforeEach, afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createTask: vi.fn(),
	enqueue: vi.fn(),
	from: vi.fn(),
	rpc: vi.fn(),
	collectAssets: vi.fn(),
	collectStoryImages: vi.fn(),
	reconcileStoryJobs: vi.fn()
}));
vi.mock('@google-cloud/tasks', () => ({
	CloudTasksClient: class {
		createTask = mocks.createTask;
	}
}));
vi.mock('#lib/server/runtime-config', () => ({
	env: {
		WORD_KITCHEN_TASK_QUEUE: 'projects/test/locations/test/queues/test',
		WORD_KITCHEN_WORKER_URL: 'https://worker.test',
		WORD_KITCHEN_WORKER_SERVICE_ACCOUNT: 'worker@test.iam.gserviceaccount.com'
	}
}));
vi.mock('#lib/server/db', () => ({
	getSupabase: async () => ({ from: mocks.from, rpc: mocks.rpc })
}));
vi.mock('./generation', () => ({ enqueueGeneration: mocks.enqueue }));
vi.mock('./maintenance', () => ({ collectAssets: mocks.collectAssets }));
vi.mock('#lib/server/story-image-cleanup', () => ({
	collectStoryImages: mocks.collectStoryImages
}));
vi.mock('#lib/server/story-jobs', () => ({ reconcileStoryJobs: mocks.reconcileStoryJobs }));
import { dispatchOutbox, enqueueAndDispatchGeneration, reconcile } from './queue';

const row = {
	id: 'outbox-1',
	job_id: 'job-1',
	payload: { jobId: 'job-1' },
	next_attempt_at: '2026-10-02T12:00:30.000Z'
};
let query: Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(console, 'error').mockImplementation(() => {});
	query = {};
	for (const name of ['select', 'is', 'eq', 'order', 'update']) query[name] = vi.fn(() => query);
	query.limit = vi.fn().mockResolvedValue({ data: [row], error: null });
	mocks.from.mockReturnValue(query);
	mocks.enqueue.mockResolvedValue({
		id: 'job-1',
		status: 'queued',
		request_hash: 'private-hash',
		idempotency_key: 'private-key',
		estimated_cost: 0.3,
		checkpoint: { private: true },
		lease_token: 4
	});
	mocks.createTask.mockResolvedValue([{}]);
	mocks.rpc.mockResolvedValue({ data: true, error: null });
	mocks.collectAssets.mockResolvedValue(undefined);
	mocks.collectStoryImages.mockResolvedValue(undefined);
	mocks.reconcileStoryJobs.mockResolvedValue(undefined);
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

it('runs independent maintenance even when another task fails and reports a retryable failure', async () => {
	mocks.collectAssets.mockRejectedValue(new Error('private provider details'));
	await expect(reconcile()).rejects.toThrow('needs a retry');
	expect(mocks.collectStoryImages).toHaveBeenCalledTimes(1);
	expect(mocks.reconcileStoryJobs).toHaveBeenCalledTimes(1);
	expect(mocks.rpc).toHaveBeenCalledWith('wk_reconcile_jobs', {});
	expect(console.error).toHaveBeenCalledWith('maintenance.failed', { tasks: ['kitchen-assets'] });
});

it('dispatches the saved job immediately and waits for task creation before returning', async () => {
	let complete!: () => void;
	mocks.createTask.mockImplementation(
		() =>
			new Promise<void>((resolve) => {
				complete = resolve;
			})
	);
	let returned = false;
	const pending = enqueueAndDispatchGeneration(1, 'favorite', 'key').then((job) => {
		returned = true;
		return job;
	});
	await vi.waitFor(() => expect(mocks.createTask).toHaveBeenCalledTimes(1));
	expect(returned).toBe(false);
	expect(query.eq).toHaveBeenCalledWith('job_id', 'job-1');
	complete();
	expect(await pending).toEqual({ id: 'job-1', status: 'queued' });
	expect(query.update).toHaveBeenCalledWith({ delivered_at: expect.any(String) });
});

it('preserves the accepted job and undelivered outbox when task delivery fails', async () => {
	mocks.createTask.mockRejectedValue({ code: 14 });
	expect(await enqueueAndDispatchGeneration(1, 'favorite', 'key')).toMatchObject({ id: 'job-1' });
	expect(query.update).not.toHaveBeenCalled();
});

it('preserves the accepted job if reading the outbox fails', async () => {
	query.limit.mockResolvedValue({ data: null, error: { code: 'unavailable' } });
	expect(await enqueueAndDispatchGeneration(1, 'favorite', 'key')).toMatchObject({ id: 'job-1' });
	expect(mocks.createTask).not.toHaveBeenCalled();
});

it('schedules delayed retries in Cloud Tasks without waiting for the reconciler', async () => {
	await dispatchOutbox();
	expect(mocks.createTask).toHaveBeenCalledWith(
		expect.objectContaining({
			task: expect.objectContaining({
				scheduleTime: { seconds: Date.parse(row.next_attempt_at) / 1000 },
				httpRequest: expect.objectContaining({
					body: Buffer.from(JSON.stringify(row.payload)).toString('base64')
				})
			})
		}),
		{ timeout: 10000, retry: null }
	);
});

it('acknowledges an already-created task without creating a new task identity', async () => {
	mocks.createTask.mockRejectedValue({ code: 6 });
	await dispatchOutbox();
	expect(query.update).toHaveBeenCalledTimes(1);
	expect(mocks.createTask).toHaveBeenCalledWith(
		expect.objectContaining({
			task: expect.objectContaining({ name: expect.stringContaining('/tasks/wk-outbox-1') })
		}),
		{ timeout: 10000, retry: null }
	);
});

it('recovers a task whose creation succeeded but database acknowledgement failed', async () => {
	query.eq.mockImplementation((key: string) =>
		key === 'id' ? { data: null, error: { code: 'unavailable' } } : query
	);
	await expect(dispatchOutbox()).rejects.toThrow();
	const originalTask = mocks.createTask.mock.calls[0];
	query.eq.mockImplementation(() => query);
	mocks.createTask.mockRejectedValueOnce({ code: 6 });
	await dispatchOutbox();
	expect(mocks.createTask.mock.calls[1]).toEqual(originalTask);
	expect(query.update).toHaveBeenCalledTimes(2);
});

it('stops a stalled delivery batch and leaves every unacknowledged row for recovery', async () => {
	vi.useFakeTimers();
	query.limit.mockResolvedValue({
		data: Array.from({ length: 50 }, (_, i) => ({ ...row, id: `outbox-${i}` })),
		error: null
	});
	mocks.createTask.mockImplementation(() => new Promise(() => {}));
	const dispatch = dispatchOutbox();
	await vi.advanceTimersByTimeAsync(30000);
	await dispatch;
	expect(mocks.createTask).toHaveBeenCalledTimes(2);
	expect(query.update).not.toHaveBeenCalled();
});

it('does not dispatch when saving the job fails', async () => {
	mocks.enqueue.mockRejectedValue(new Error('GENERATION_BUSY'));
	await expect(enqueueAndDispatchGeneration(1, 'favorite', 'key')).rejects.toThrow(
		'GENERATION_BUSY'
	);
	expect(mocks.createTask).not.toHaveBeenCalled();
});
