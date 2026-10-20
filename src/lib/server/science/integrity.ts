import { createHash } from 'node:crypto';
import type { Activity, CatalogRecord } from '../../science/contracts.ts';

function canonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
	if (value && typeof value === 'object')
		return `{${Object.entries(value)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`)
			.join(',')}}`;
	return JSON.stringify(value);
}
export function contentHash(activity: Activity): string {
	return createHash('sha256').update(canonical(activity)).digest('hex');
}
export function isPublishable(record: CatalogRecord): boolean {
	return (
		(record.status === 'starter' && record.provenance.origin === 'starter') ||
		(record.status === 'reviewed' && record.review?.contentHash === contentHash(record.activity))
	);
}
