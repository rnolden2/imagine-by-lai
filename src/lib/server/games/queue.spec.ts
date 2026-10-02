import { beforeEach, afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createTask: vi.fn(),
	enqueue: vi.fn(),
	from: vi.fn()
}));
vi.mock('@google-cloud/tasks', () => ({
	CloudTasksClient: class {
		createTask = mocks.createTask;
	}
}));
vi.mock('$env/dynamic/private', () => ({
	env: {
		WORD_KITCHEN_TASK_QUEUE: 'projects/test/locations/test/queues/test',
		WORD_KITCHEN_WORKER_URL: 'https://worker.test',
		WORD_KITCHEN_WORKER_SERVICE_ACCOUNT: 'worker@test.iam.gserviceaccount.com'
	}
}));
vi.mock('$lib/server/db', () => ({ getSupabase: async () => ({ from: mocks.from }) }));
vi.mock('./generation', () => ({ enqueueGeneration: mocks.enqueue, requireWorkerConfig: vi.fn() }));
vi.mock('./maintenance', () => ({ collectAssets: vi.fn() }));
import { dispatchOutbox, enqueueAndDispatchGeneration } from './queue';

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
	mocks.enqueue.mockResolvedValue({ id: 'job-1', status: 'queued' });
	mocks.createTask.mockResolvedValue([{}]);
});
afterEach(() => vi.restoreAllMocks());

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
		})
	);
});

it('acknowledges an already-created task without creating a new task identity', async () => {
	mocks.createTask.mockRejectedValue({ code: 6 });
	await dispatchOutbox();
	expect(query.update).toHaveBeenCalledTimes(1);
	expect(mocks.createTask).toHaveBeenCalledWith(
		expect.objectContaining({
			task: expect.objectContaining({ name: expect.stringContaining('/tasks/wk-outbox-1') })
		})
	);
});

it('does not dispatch when saving the job fails', async () => {
	mocks.enqueue.mockRejectedValue(new Error('GENERATION_BUSY'));
	await expect(enqueueAndDispatchGeneration(1, 'favorite', 'key')).rejects.toThrow(
		'GENERATION_BUSY'
	);
	expect(mocks.createTask).not.toHaveBeenCalled();
});
