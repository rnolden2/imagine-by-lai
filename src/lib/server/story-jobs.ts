import { z } from 'zod';
import { error, type RequestEvent } from '@sveltejs/kit';
import { getSupabase } from '#lib/server/db';
import { generateStoryImage, generateStoryText, type AIProvider } from '#lib/server/ai';
import {
	downloadStoryImageObject,
	getStoryImageGeneration,
	uploadStoryJobImage
} from '#lib/server/image-storage';
import { access } from '#lib/server/games/authorization';
import { createWorkerTask, requireWorkerConfig } from '#lib/server/worker';
import {
	imageToStoryPrompt,
	newStoryImagePrompt,
	newStoryPrompt,
	parseImageStoryOutput,
	parseNewStoryOutput,
	regenerationImagePrompt
} from '#lib/server/story-generation';

const profile = z
	.object({
		id: z.number().int().positive(),
		name: z.string(),
		grade: z.string(),
		gender: z.enum(['boy', 'girl']),
		character_description: z.string().nullable(),
		story_themes: z.array(z.string()),
		story_length_minutes: z.number().int()
	})
	.passthrough();
const story = z
	.object({
		id: z.number().int().positive(),
		prompt: z.string(),
		content: z.string(),
		grade_level: z.string(),
		child_id: z.number().int().positive().nullable(),
		image_url: z.string().nullable(),
		image_object_name: z.string().nullable().optional()
	})
	.passthrough();
const jobSchema = z.object({
	id: z.string().uuid(),
	kind: z.enum(['create', 'regenerate_image', 'from_image']),
	child_id: z.number().int().positive().nullable(),
	device_id: z.string().uuid().nullable(),
	target_story_id: z.number().int().positive().nullable(),
	result_story_id: z.number().int().positive().nullable(),
	stage: z.enum(['text', 'image']),
	status: z.enum(['queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled']),
	image_prompt: z.string().nullable(),
	lease_token: z.number().int().nonnegative(),
	input: z.object({
		request: z.record(z.string(), z.unknown()),
		profile: profile.nullable(),
		story: story.nullable()
	})
});
export type StoryJob = z.infer<typeof jobSchema>;

const knownDatabaseCodes = [
	'IDEMPOTENCY_CONFLICT',
	'STORY_JOB_DELETED',
	'STORY_RATE_LIMIT',
	'STORY_ACCESS_DENIED',
	'STORY_NOT_FOUND',
	'STORY_GENERATION_BUSY',
	'CHILD_NOT_FOUND',
	'IMAGE_MIGRATION_REQUIRED',
	'IMAGE_UNAVAILABLE',
	'UNCERTAIN_PROVIDER_RESULT',
	'BUDGET_EXCEEDED',
	'INVALID_STORY_REQUEST',
	'INVALID_OUTPUT'
] as const;
type StoryDatabaseCode = (typeof knownDatabaseCodes)[number];

export class StoryJobError extends Error {
	constructor(public readonly code: StoryDatabaseCode) {
		super(code);
		this.name = 'StoryJobError';
	}
}
class StoryDatabaseUnavailable extends Error {}
class StoryStorageFailure extends Error {}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
	const db = await getSupabase();
	const result = await db.rpc(name, args);
	if (result.error) {
		const detail = String(result.error.message ?? '');
		const known = knownDatabaseCodes.find((code) => detail.includes(code));
		if (known) throw new StoryJobError(known);
		console.error('story.job.database.failed', {
			operation: name,
			code: /^[0-9A-Z]{5}$/.test(result.error.code ?? '') ? result.error.code : 'UNKNOWN'
		});
		throw new StoryDatabaseUnavailable();
	}
	return result.data as T;
}

export function storyJobFailure(cause: unknown, field: 'error' | 'message' = 'error') {
	if (!(cause instanceof StoryJobError)) return null;
	const messages: Record<StoryDatabaseCode, [number, string]> = {
		INVALID_STORY_REQUEST: [400, 'Check the story request and try again.'],
		INVALID_OUTPUT: [422, 'The generated story was not usable. Start a new request.'],
		STORY_ACCESS_DENIED: [404, 'Story job not found.'],
		STORY_NOT_FOUND: [404, 'Story not found.'],
		CHILD_NOT_FOUND: [404, 'Child profile not found.'],
		STORY_JOB_DELETED: [410, 'That accepted request is no longer available.'],
		STORY_RATE_LIMIT: [429, 'The story generation limit has been reached. Try again later.'],
		IDEMPOTENCY_CONFLICT: [409, 'This request was already used with different story details.'],
		STORY_GENERATION_BUSY: [409, 'That story already has an illustration in progress.'],
		IMAGE_MIGRATION_REQUIRED: [409, 'Image maintenance must finish before this change.'],
		IMAGE_UNAVAILABLE: [409, 'That illustration is no longer available.'],
		UNCERTAIN_PROVIDER_RESULT: [
			409,
			'A provider result could not be confirmed. Review the job before retrying.'
		],
		BUDGET_EXCEEDED: [429, 'The generation allowance has been reached. Try again later.']
	};
	const [status, message] = messages[cause.code];
	return { status, body: { [field]: message } };
}

export async function enqueueStoryJob(
	event: RequestEvent,
	request: {
		key: string;
		kind: StoryJob['kind'];
		childId?: number | null;
		storyId?: number | null;
		input: Record<string, unknown>;
	}
) {
	if (!z.string().uuid().safeParse(request.key).success)
		throw new StoryJobError('INVALID_STORY_REQUEST');
	requireWorkerConfig();
	const scope = await access(event);
	const raw = await rpc<unknown>('app_enqueue_story_job', {
		p_key: request.key,
		p_kind: request.kind,
		p_child: request.childId ?? null,
		p_story: request.storyId ?? null,
		p_device: scope.deviceId,
		p_input: request.input
	});
	const job = jobSchema.parse(raw);
	try {
		await dispatchStoryOutbox(job.id);
	} catch {
		console.error('story.job.dispatch.failed', { jobId: job.id });
	}
	return job;
}

export async function recoverStoryJob(event: RequestEvent, key: string) {
	if (!z.string().uuid().safeParse(key).success) throw new StoryJobError('INVALID_STORY_REQUEST');
	const scope = await access(event);
	const actor = scope.deviceId ?? 'parent';
	const db = await getSupabase();
	const receipt = await db
		.from('app_story_requests')
		.select('id')
		.eq('actor', actor)
		.eq('request_key', key)
		.maybeSingle();
	if (receipt.error) throw new StoryDatabaseUnavailable();
	if (!receipt.data) return null;
	const job = await db.from('app_story_jobs').select('id').eq('id', receipt.data.id).maybeSingle();
	if (job.error) throw new StoryDatabaseUnavailable();
	if (!job.data) throw new StoryJobError('STORY_JOB_DELETED');
	return String(job.data.id);
}

export async function dispatchStoryOutbox(jobId?: string) {
	requireWorkerConfig();
	const db = await getSupabase();
	let query = db
		.from('app_story_outbox')
		.select('id,job_id,payload,next_attempt_at')
		.is('delivered_at', null);
	if (jobId) query = query.eq('job_id', jobId);
	const result = await query.order('next_attempt_at', { ascending: true }).limit(50);
	if (result.error) throw new StoryDatabaseUnavailable();
	const stopAt = Date.now() + 30000;
	for (const row of result.data ?? []) {
		if (Date.now() >= stopAt) break;
		try {
			await createWorkerTask({
				id: `story-${row.id}`,
				path: '/api/internal/story/worker',
				payload: row.payload,
				notBefore: row.next_attempt_at
			});
		} catch {
			console.error('story.job.dispatch.failed', { jobId: row.job_id, outboxId: row.id });
			continue;
		}
		const acknowledged = await db
			.from('app_story_outbox')
			.update({ delivered_at: new Date().toISOString() })
			.eq('id', row.id);
		if (acknowledged.error) throw new StoryDatabaseUnavailable();
	}
}

async function reserve(job: StoryJob, provider: AIProvider) {
	const accepted = await rpc<boolean>('app_reserve_story_provider', {
		p_id: job.id,
		p_token: job.lease_token,
		p_stage: job.stage,
		p_provider: provider
	});
	if (!accepted) throw new Error('STALE_LEASE');
}

const fallback = (job: StoryJob) => ({
	beforePrimary: (provider: AIProvider) => reserve(job, provider),
	beforeFallback: () => reserve(job, 'gemini')
});

async function existingOutput(job: StoryJob, objectName: string) {
	try {
		await getStoryImageGeneration(objectName);
		return await rpc<boolean>('app_finish_story_image', { p_id: job.id, p_token: job.lease_token });
	} catch (cause) {
		if (typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 404)
			return false;
		throw new StoryStorageFailure();
	}
}

async function runText(job: StoryJob) {
	const request = job.input.request;
	const prompt = String(request.prompt ?? '');
	if (job.kind === 'from_image') {
		const source = String(request.source_object ?? '');
		let image: Buffer;
		try {
			image = await downloadStoryImageObject(source);
		} catch {
			throw new StoryStorageFailure();
		}
		const output = parseImageStoryOutput(
			await generateStoryText(imageToStoryPrompt(prompt), image, fallback(job))
		);
		return rpc<boolean>('app_save_story_text', {
			p_id: job.id,
			p_token: job.lease_token,
			p_content: output,
			p_image_prompt: null
		});
	}
	const output = parseNewStoryOutput(
		await generateStoryText(
			newStoryPrompt(prompt, job.input.profile, (request.themes as string[] | null) ?? null),
			undefined,
			fallback(job)
		)
	);
	return rpc<boolean>('app_save_story_text', {
		p_id: job.id,
		p_token: job.lease_token,
		p_content: output.story,
		p_image_prompt: output.imagePrompt
	});
}

async function runImage(job: StoryJob) {
	const objectName = await rpc<string | null>('app_story_output_for_upload', {
		p_id: job.id,
		p_token: job.lease_token
	});
	if (!objectName) return false;
	if (await existingOutput(job, objectName)) return true;
	const prompt =
		job.kind === 'regenerate_image'
			? regenerationImagePrompt(story.parse(job.input.story))
			: newStoryImagePrompt(String(job.image_prompt ?? ''), job.input.profile);
	const image = await generateStoryImage(prompt, fallback(job));
	try {
		await uploadStoryJobImage(objectName, image);
	} catch (cause) {
		if (typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 412) {
			if (await existingOutput(job, objectName)) return true;
		}
		throw new StoryStorageFailure();
	}
	return rpc<boolean>('app_finish_story_image', { p_id: job.id, p_token: job.lease_token });
}

function terminalCode(cause: unknown) {
	if (cause instanceof StoryStorageFailure) return 'STORAGE_FAILED';
	if (cause instanceof StoryJobError && cause.code === 'UNCERTAIN_PROVIDER_RESULT')
		return 'UNCERTAIN_PROVIDER_RESULT';
	if (cause instanceof StoryJobError && cause.code === 'BUDGET_EXCEEDED') return 'BUDGET_EXCEEDED';
	const message = cause instanceof Error ? cause.message : '';
	if (message === 'INVALID_OUTPUT') return 'INVALID_OUTPUT';
	if (['AI_PROVIDERS_FAILED', 'AI_REQUEST_REFUSED', 'AI_GENERATION_TIMEOUT'].includes(message))
		return 'PROVIDER_FAILED';
	if (message === 'STALE_LEASE') return null;
	return undefined;
}

export async function runStoryJob(jobId: string) {
	const started = Date.now();
	const raw = await rpc<unknown | null>('app_claim_story_job', { p_id: jobId });
	if (!raw) return;
	const job = jobSchema.parse(raw);
	try {
		if (job.stage === 'text') await runText(job);
		else await runImage(job);
		console.log('story.job.stage.completed', {
			jobId: job.id,
			stage: job.stage,
			durationMs: Date.now() - started
		});
	} catch (cause) {
		const code = terminalCode(cause);
		if (code === null) return;
		if (code === undefined || cause instanceof StoryDatabaseUnavailable) throw cause;
		console.error('story.job.stage.failed', {
			jobId: job.id,
			stage: job.stage,
			code,
			durationMs: Date.now() - started
		});
		await rpc('app_fail_story_job', { p_id: job.id, p_token: job.lease_token, p_code: code });
	}
}

export async function authorizeStoryJob(event: RequestEvent, jobId: string) {
	if (!z.string().uuid().safeParse(jobId).success) error(404, 'Job not found.');
	const scope = await access(event);
	const db = await getSupabase();
	let query = db
		.from('app_story_jobs')
		.select(
			'id,kind,child_id,device_id,target_story_id,result_story_id,stage,status,error_code,created_at,updated_at'
		)
		.eq('id', jobId);
	if (!scope.parent) query = query.eq('device_id', scope.deviceId).in('child_id', scope.childIds);
	const result = await query.maybeSingle();
	if (result.error) throw new StoryDatabaseUnavailable();
	if (!result.data) error(404, 'Job not found.');
	return result.data;
}

export async function cancelStoryJob(event: RequestEvent, jobId: string) {
	await authorizeStoryJob(event, jobId);
	const scope = await access(event);
	return rpc('app_cancel_story_job', { p_id: jobId, p_device: scope.deviceId });
}

export async function reconcileStoryJobs() {
	await rpc<number>('app_reconcile_story_jobs', {});
	await dispatchStoryOutbox();
}
