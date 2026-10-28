import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	rpc: vi.fn(),
	text: vi.fn(),
	image: vi.fn(),
	download: vi.fn(),
	metadata: vi.fn(),
	upload: vi.fn(),
	access: vi.fn(),
	requireWorker: vi.fn(),
	createTask: vi.fn()
}));

vi.mock('#lib/server/db', () => ({
	getSupabase: async () => ({ rpc: mocks.rpc })
}));
vi.mock('#lib/server/ai', () => ({
	generateStoryText: mocks.text,
	generateStoryImage: mocks.image
}));
vi.mock('#lib/server/image-storage', () => ({
	downloadStoryImageObject: mocks.download,
	getStoryImageGeneration: mocks.metadata,
	uploadStoryJobImage: mocks.upload
}));
vi.mock('#lib/server/games/authorization', () => ({ access: mocks.access }));
vi.mock('#lib/server/worker', () => ({
	requireWorkerConfig: mocks.requireWorker,
	createWorkerTask: mocks.createTask
}));

import { runStoryJob, StoryJobError, storyJobFailure } from './story-jobs';

const jobId = '00000000-0000-4000-8000-000000000001';
const imageObject = `imagine-by-lai/story-images/jobs/${jobId}.png`;
const profile = {
	id: 1,
	name: 'Alex',
	grade: '2',
	gender: 'boy',
	character_description: 'short black hair and glasses',
	story_themes: ['space'],
	story_length_minutes: 5
};
const sourceStory = {
	id: 10,
	prompt: 'A moon garden',
	content: 'The garden glowed beneath the moon. '.repeat(10),
	grade_level: '2',
	child_id: 1,
	image_url: null,
	image_object_name: null
};

function job(overrides: Record<string, unknown> = {}) {
	return {
		id: jobId,
		kind: 'create',
		child_id: 1,
		device_id: null,
		target_story_id: null,
		result_story_id: null,
		stage: 'text',
		status: 'running',
		image_prompt: null,
		lease_token: 1,
		input: {
			request: { prompt: 'Explore a friendly moon garden', themes: ['space'] },
			profile,
			story: null
		},
		...overrides
	};
}

beforeEach(() => {
	vi.resetAllMocks();
	vi.spyOn(console, 'log').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});
	mocks.access.mockResolvedValue({ parent: true, deviceId: null, childIds: [] });
});
afterEach(() => vi.restoreAllMocks());

it('reserves the selected provider before generating and saves validated text before image work', async () => {
	const calls: string[] = [];
	mocks.rpc.mockImplementation(async (name: string) => {
		calls.push(name);
		if (name === 'app_claim_story_job') return { data: job(), error: null };
		return { data: true, error: null };
	});
	mocks.text.mockImplementation(async (_prompt, _image, options) => {
		await options.beforePrimary('openai');
		calls.push('provider:text');
		return `${'Alex explored the gentle moon garden and helped a lost creature. '.repeat(3)}\nA moon garden glowing beside two friends.`;
	});

	await runStoryJob(jobId);

	expect(calls).toEqual([
		'app_claim_story_job',
		'app_reserve_story_provider',
		'provider:text',
		'app_save_story_text'
	]);
	expect(mocks.rpc).toHaveBeenCalledWith('app_reserve_story_provider', {
		p_id: jobId,
		p_token: 1,
		p_stage: 'text',
		p_provider: 'openai'
	});
	expect(mocks.rpc).toHaveBeenCalledWith(
		'app_save_story_text',
		expect.objectContaining({
			p_id: jobId,
			p_content: expect.stringContaining('moon garden'),
			p_image_prompt: 'A moon garden glowing beside two friends.'
		})
	);
	expect(mocks.image).not.toHaveBeenCalled();
});

it('recovers an already-uploaded deterministic image without buying another provider result', async () => {
	mocks.rpc.mockImplementation(async (name: string) => {
		if (name === 'app_claim_story_job')
			return {
				data: job({ stage: 'image', image_prompt: 'Two friends under the moon.' }),
				error: null
			};
		if (name === 'app_story_output_for_upload') return { data: imageObject, error: null };
		return { data: true, error: null };
	});
	mocks.metadata.mockResolvedValue('123');

	await runStoryJob(jobId);

	expect(mocks.image).not.toHaveBeenCalled();
	expect(mocks.upload).not.toHaveBeenCalled();
	expect(mocks.rpc).toHaveBeenCalledWith('app_finish_story_image', {
		p_id: jobId,
		p_token: 1
	});
});

it('recovers an upload acknowledgement race instead of regenerating the image', async () => {
	mocks.rpc.mockImplementation(async (name: string) => {
		if (name === 'app_claim_story_job')
			return {
				data: job({ stage: 'image', image_prompt: 'Two friends under the moon.' }),
				error: null
			};
		if (name === 'app_story_output_for_upload') return { data: imageObject, error: null };
		return { data: true, error: null };
	});
	mocks.metadata.mockRejectedValueOnce({ code: 404 }).mockResolvedValueOnce('124');
	mocks.image.mockImplementation(async (_prompt, options) => {
		await options.beforePrimary('openai');
		return Buffer.from('png');
	});
	mocks.upload.mockRejectedValue({ code: 412 });

	await runStoryJob(jobId);

	expect(mocks.image).toHaveBeenCalledTimes(1);
	expect(mocks.upload).toHaveBeenCalledWith(imageObject, Buffer.from('png'));
	expect(mocks.metadata).toHaveBeenCalledTimes(2);
	expect(mocks.rpc).toHaveBeenCalledWith('app_finish_story_image', {
		p_id: jobId,
		p_token: 1
	});
});

it('converts storage failures to a terminal code without logging story contents', async () => {
	mocks.rpc.mockImplementation(async (name: string) => {
		if (name === 'app_claim_story_job')
			return {
				data: job({
					kind: 'regenerate_image',
					stage: 'image',
					target_story_id: 10,
					input: { request: {}, profile, story: sourceStory }
				}),
				error: null
			};
		if (name === 'app_story_output_for_upload') return { data: imageObject, error: null };
		return { data: true, error: null };
	});
	mocks.metadata.mockRejectedValue({ code: 500 });

	await runStoryJob(jobId);

	expect(mocks.image).not.toHaveBeenCalled();
	expect(mocks.rpc).toHaveBeenCalledWith('app_fail_story_job', {
		p_id: jobId,
		p_token: 1,
		p_code: 'STORAGE_FAILED'
	});
	expect(console.error).toHaveBeenCalledWith('story.job.stage.failed', {
		jobId,
		stage: 'image',
		code: 'STORAGE_FAILED',
		durationMs: expect.any(Number)
	});
	expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('moon garden');
});

it('maps only recognized public failures and does not disclose unknown provider details', () => {
	expect(
		storyJobFailure(Object.assign(new Error('private key payload'), { code: 'other' }))
	).toBeNull();
	expect(storyJobFailure(new StoryJobError('STORY_RATE_LIMIT'))).toEqual({
		status: 429,
		body: { error: 'The story generation limit has been reached. Try again later.' }
	});
});
