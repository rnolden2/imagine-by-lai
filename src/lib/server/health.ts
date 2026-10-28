import { env } from '#lib/server/runtime-config';
import { getSupabase } from '#lib/server/db';
import { ADMIN_PASSWORD } from '#lib/server/secrets';
import { hasWorkerConfig } from '#lib/server/worker';

export type ReadinessResult =
	| { ok: true }
	| {
			ok: false;
			code: 'ADMIN_CONFIG' | 'AI_CONFIG' | 'WORKER_CONFIG' | 'DATABASE';
	  };

let cached: { result: ReadinessResult; expiresAt: number } | undefined;
let pending: Promise<ReadinessResult> | undefined;

/** Checks only dependencies required to safely accept traffic. It never calls paid providers. */
export async function checkReadiness(): Promise<ReadinessResult> {
	const now = Date.now();
	if (cached && cached.expiresAt > now) return cached.result;
	if (pending) return pending;
	pending = runReadiness().then((result) => {
		// Success may be reused across a probe burst; failures recover quickly.
		cached = { result, expiresAt: Date.now() + (result.ok ? 5000 : 1000) };
		return result;
	});
	try {
		return await pending;
	} finally {
		pending = undefined;
	}
}

async function runReadiness(): Promise<ReadinessResult> {
	if (ADMIN_PASSWORD.length < 12) return { ok: false, code: 'ADMIN_CONFIG' };
	const provider = env.AI_PROVIDER?.trim().toLowerCase() || 'openai';
	if (provider !== 'openai' && provider !== 'gemini') return { ok: false, code: 'AI_CONFIG' };
	if (!hasWorkerConfig()) return { ok: false, code: 'WORKER_CONFIG' };

	try {
		const db = await getSupabase();
		const { error } = await db.from('child_profiles').select('id').limit(1);
		if (error) return { ok: false, code: 'DATABASE' };
		return { ok: true };
	} catch {
		return { ok: false, code: 'DATABASE' };
	}
}
