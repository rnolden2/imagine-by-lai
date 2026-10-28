import { env } from '#lib/server/runtime-config';
import { getSupabase, throwSupabaseError } from '#lib/server/db';
import { validateCatalog } from '#lib/science/contracts';
import { starterCatalog } from '#lib/science/starter';
import { isPublishable } from './integrity';

export async function loadScienceCatalog() {
	if (!env.SCIENCE_CATALOG_SOURCE || env.SCIENCE_CATALOG_SOURCE === 'bundled')
		return starterCatalog;
	if (env.SCIENCE_CATALOG_SOURCE !== 'database') throw new Error('Invalid SCIENCE_CATALOG_SOURCE');
	const db = await getSupabase();
	const definitions: unknown[] = [];
	// Keyset pagination avoids Supabase's default cap without making later pages scan
	// every preceding row. The final page requests one extra row so the safety cap
	// fails visibly instead of silently dropping published activities.
	const pageSize = 500;
	const maximum = 5000;
	let afterId: string | undefined;
	for (let pageNumber = 0; pageNumber < maximum / pageSize; pageNumber++) {
		let query = db
			.from('science_experiments')
			.select('id,definition')
			.in('status', ['starter', 'reviewed'])
			.order('id');
		if (afterId) query = query.gt('id', afterId);
		const result = await query.limit(
			pageNumber === maximum / pageSize - 1 ? pageSize + 1 : pageSize
		);
		if (result.error) throwSupabaseError('load science catalog', result.error);
		const rows = result.data ?? [];
		if (rows.length > pageSize) throw new Error('Science catalog exceeds 5,000 activities');
		definitions.push(...rows.map((row) => row.definition));
		if (rows.length < pageSize) break;
		afterId = String(rows[rows.length - 1].id);
	}
	// Reject changed reviewed content instead of silently publishing an unreviewed revision.
	const catalog = validateCatalog(definitions);
	if (catalog.some((record) => !isPublishable(record)))
		throw new Error('Science catalog contains a stale review');
	return catalog;
}
