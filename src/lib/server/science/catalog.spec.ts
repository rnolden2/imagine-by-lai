import { beforeEach, describe, expect, it, vi } from 'vitest';
import { starterCatalog } from '$lib/science/starter';

const fixture = vi.hoisted(() => ({
	mode: '',
	rows: [] as unknown[],
	error: null as unknown,
	ranges: [] as number[][]
}));
vi.mock('$env/dynamic/private', () => ({
	env: {
		get SCIENCE_CATALOG_SOURCE() {
			return fixture.mode;
		}
	}
}));
vi.mock('$lib/server/db', () => ({
	getSupabase: async () => ({
		from: () => ({
			select: () => ({
				in: () => ({
					order: () => ({
						range: async (start: number, end: number) => {
							fixture.ranges.push([start, end]);
							return {
								data: fixture.rows.slice(start, end + 1).map((definition) => ({ definition })),
								error: fixture.error
							};
						}
					})
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
		fixture.ranges = [];
	});
	it('defaults to bundled starters without querying the database', async () => {
		expect(await loadScienceCatalog()).toHaveLength(starterCatalog.length);
		expect(fixture.ranges).toEqual([]);
	});
	it('paginates beyond the default API cap', async () => {
		fixture.mode = 'database';
		fixture.rows = Array.from({ length: 1001 }, (_, index) => ({
			...starterCatalog[index % starterCatalog.length],
			activity: {
				...starterCatalog[index % starterCatalog.length].activity,
				id: `test-${index}`,
				title: `Unique test activity ${index}`
			}
		}));
		expect(await loadScienceCatalog()).toHaveLength(1001);
		expect(fixture.ranges).toEqual([
			[0, 499],
			[500, 999],
			[1000, 1499]
		]);
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
