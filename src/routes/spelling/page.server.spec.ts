import { beforeEach, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const fixture = vi.hoisted(() => ({
	users: [] as Row[],
	words: [] as Row[],
	filters: [] as { table: string; column: string; values: unknown[] }[],
	queries: [] as string[]
}));

function query(table: string) {
	fixture.queries.push(table);
	const builder = {
		select: () => builder,
		in: (column: string, values: unknown[]) => {
			fixture.filters.push({ table, column, values });
			return builder;
		},
		order: () => builder,
		then: (
			resolve: (value: { data: Row[]; error: null }) => unknown,
			reject: (reason: unknown) => unknown
		) =>
			Promise.resolve({
				data: table === 'child_profiles' ? fixture.users : fixture.words,
				error: null
			}).then(resolve, reject)
	};
	return builder;
}

vi.mock('#lib/server/games/authorization', () => ({
	access: async () => ({ childIds: [1, 2], deviceId: null, parent: true })
}));
vi.mock('#lib/server/db', () => ({
	getSupabase: async () => ({ from: (table: string) => query(table) }),
	getSupabaseErrorMessage: () => 'Database unavailable',
	throwSupabaseError: () => {
		throw new Error('Database unavailable');
	}
}));

import { load } from './+page.server';

beforeEach(() => {
	fixture.users = [];
	fixture.words = [];
	fixture.filters = [];
	fixture.queries = [];
});

it('loads custom words only for distinct authorized child grades', async () => {
	fixture.users = [
		{ id: 1, name: 'One', grade: '2', gender: 'girl' },
		{ id: 2, name: 'Two', grade: 'K', gender: 'boy' },
		{ id: 3, name: 'Three', grade: '2', gender: 'girl' }
	];
	fixture.words = [
		{ id: 10, word: 'planet', grade: '2' },
		{ id: 11, word: 'sun', grade: 'K' }
	];
	const result = (await load({} as Parameters<typeof load>[0])) as { customWords: Row[] };
	expect(fixture.filters).toContainEqual({
		table: 'spelling_words',
		column: 'grade',
		values: ['2', 'K']
	});
	expect(result.customWords).toEqual(fixture.words);
});

it('does not query spelling words when no authorized profiles exist', async () => {
	const result = (await load({} as Parameters<typeof load>[0])) as { customWords: Row[] };
	expect(fixture.queries).toEqual(['child_profiles']);
	expect(result.customWords).toEqual([]);
});
