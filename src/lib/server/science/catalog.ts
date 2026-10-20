import { env } from '$env/dynamic/private';
import { getSupabase, throwSupabaseError } from '$lib/server/db';
import { validateCatalog } from '$lib/science/contracts';
import { starterCatalog } from '$lib/science/starter';
import { isPublishable } from './integrity';

export async function loadScienceCatalog() {
	if (!env.SCIENCE_CATALOG_SOURCE || env.SCIENCE_CATALOG_SOURCE === 'bundled')
		return starterCatalog;
	if (env.SCIENCE_CATALOG_SOURCE !== 'database') throw new Error('Invalid SCIENCE_CATALOG_SOURCE');
	const db = await getSupabase();
	const definitions: unknown[] = [];
	// Explicit pagination avoids Supabase's default row cap when the library grows.
	for (let offset = 0; offset < 5000; offset += 500) {
		const result = await db
			.from('science_experiments')
			.select('definition')
			.in('status', ['starter', 'reviewed'])
			.order('id')
			.range(offset, offset + 499);
		if (result.error) throwSupabaseError('load science catalog', result.error);
		definitions.push(...(result.data ?? []).map((row) => row.definition));
		if ((result.data?.length ?? 0) < 500) break;
	}
	// Reject changed reviewed content instead of silently publishing an unreviewed revision.
	const catalog = validateCatalog(definitions);
	if (catalog.some((record) => !isPublishable(record)))
		throw new Error('Science catalog contains a stale review');
	return catalog;
}
