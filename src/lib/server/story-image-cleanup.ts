import { getSupabase, throwSupabaseError } from './db';
import {
	objectNameFromGcsUrl,
	getStoryImageGeneration,
	deleteStoryImageObject
} from './image-storage';

type Cleanup = { object_name: string; lease_token: number; generation: string | null };
async function call<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
	const db = await getSupabase();
	const result = await db.rpc(name, args);
	if (result.error) throwSupabaseError(name, result.error);
	return result.data as T;
}

/** Normalize a bounded batch without replacing concurrent edits or trusting arbitrary hosts. */
export async function normalizeLegacyStoryImages() {
	const db = await getSupabase();
	const result = await db
		.from('stories')
		.select('id,image_url')
		.is('image_object_name', null)
		.not('image_url', 'is', null)
		.neq('image_url', '')
		.order('id')
		.limit(100);
	if (result.error) throwSupabaseError('finding legacy story images', result.error);
	let unresolved = 0;
	for (const story of result.data ?? []) {
		const object = objectNameFromGcsUrl(story.image_url);
		if (!object) {
			unresolved++;
			continue;
		}
		const updated = await db
			.from('stories')
			.update({ image_object_name: object })
			.eq('id', story.id)
			.eq('image_url', story.image_url)
			.is('image_object_name', null);
		if (updated.error) throwSupabaseError('normalizing a legacy story image', updated.error);
	}
	if (unresolved) console.error('story.image.legacy.unresolved', { count: unresolved });
}

/** Called only by the existing OIDC-authenticated maintenance endpoint. */
export async function collectStoryImages() {
	await normalizeLegacyStoryImages();
	for (let count = 0; count < 10; count++) {
		const item = await call<Cleanup | null>('app_claim_story_image_cleanup');
		if (!item) break;
		const identity = { p_object: item.object_name, p_token: item.lease_token };
		let failure: 'STORAGE_ERROR' | 'GENERATION_CONFLICT' | null = null;
		try {
			let generation = item.generation;
			if (!generation) {
				const observed = await getStoryImageGeneration(item.object_name);
				generation = await call<string | null>('app_bind_story_image_generation', {
					...identity,
					p_generation: observed
				});
				if (!generation) continue; // Another worker owns the newer lease.
			}
			await deleteStoryImageObject(item.object_name, generation);
		} catch (error) {
			const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
			if (code !== 404) {
				failure = code === 412 ? 'GENERATION_CONFLICT' : 'STORAGE_ERROR';
				console.error('story.image.cleanup.failed', { code: failure });
			}
		}
		// If this acknowledgement fails, the retained lease/generation makes replay safe.
		await call('app_finish_story_image_cleanup', { ...identity, p_error: failure });
	}
}
