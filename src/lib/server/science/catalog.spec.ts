import { beforeEach, describe, expect, it, vi } from 'vitest';
import { starterCatalog } from '#lib/science/starter';

const fixture = vi.hoisted(() => ({
	mode: '',
	rows: [] as unknown[],
	error: null as unknown,
	cursors: [] as (string | undefined)[],
	limits: [] as number[]
}));
vi.mock('#lib/server/runtime-config', () => ({
	env: {
		get SCIENCE_CATALOG_SOURCE() {
			return fixture.mode;
		}
	}
}));
vi.mock('#lib/server/db', () => ({
	getSupabase: async () => ({
		from: () => ({
			select: () => ({
				in: () => ({
					order: () => {
						let afterId: string | undefined;
						const query = {
							gt: (_column: string, id: string) => {
								afterId = id;
								return query;
							},
							limit: async (limit: number) => {
								fixture.cursors.push(afterId);
								fixture.limits.push(limit);
								const rows = fixture.rows.map((definition, index) => ({
									id: (definition as { activity?: { id?: string } }).activity?.id ?? `row-${index}`,
									definition
								}));
								const start = afterId ? rows.findIndex((row) => row.id > afterId!) : 0;
								return {
									data: start < 0 ? [] : rows.slice(start, start + limit),
									error: fixture.error
								};
							}
						};
						return query;
					}
				})
			})
		})
	}),
	throwSupabaseError: () => {
		throw new Error('Database unavailable');
	}
}));
import { loadScienceCatalog } from './catalog';

describe('science catalog loading', () => {
	beforeEach(() => {
		fixture.mode = '';
		fixture.rows = [];
		fixture.error = null;
		fixture.cursors = [];
		fixture.limits = [];
	});
	it('defaults to bundled starters without querying the database', async () => {
		expect(await loadScienceCatalog()).toHaveLength(starterCatalog.length);
		expect(fixture.cursors).toEqual([]);
	});
	it('paginates beyond the default API cap', async () => {
		fixture.mode = 'database';
		fixture.rows = Array.from({ length: 1001 }, (_, index) => ({
			...starterCatalog[index % starterCatalog.length],
			activity: {
				...starterCatalog[index % starterCatalog.length].activity,
				id: `test-${String(index).padStart(4, '0')}`,
				title: `Unique test activity ${index}`
			}
		}));
		expect(await loadScienceCatalog()).toHaveLength(1001);
		expect(fixture.cursors).toEqual([undefined, 'test-0499', 'test-0999']);
		expect(fixture.limits).toEqual([500, 500, 500]);
	});
	it('fails visibly instead of truncating a catalog beyond the safety cap', async () => {
		fixture.mode = 'database';
		fixture.rows = Array.from({ length: 5001 }, (_, index) => ({
			...starterCatalog[index % starterCatalog.length],
			activity: {
				...starterCatalog[index % starterCatalog.length].activity,
				id: `test-${String(index).padStart(4, '0')}`,
				title: `Unique test activity ${index}`
			}
		}));
		await expect(loadScienceCatalog()).rejects.toThrow('exceeds 5,000');
		expect(fixture.limits.at(-1)).toBe(501);
	});
	it('fails visibly rather than replacing a failed database with the bundled library', async () => {
		fixture.mode = 'database';
		fixture.error = { code: 'missing-table' };
		await expect(loadScienceCatalog()).rejects.toThrow('Database unavailable');
	});
	it('rejects draft records even if accidentally returned by the query', async () => {
		fixture.mode = 'database';
		fixture.rows = [{ ...starterCatalog[0], status: 'draft' }];
		await expect(loadScienceCatalog()).rejects.toThrow('stale review');
	});
	it('rejects invalid mode values', async () => {
		fixture.mode = 'databse';
		await expect(loadScienceCatalog()).rejects.toThrow('Invalid SCIENCE_CATALOG_SOURCE');
	});
});
