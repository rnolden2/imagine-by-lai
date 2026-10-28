import { beforeEach, expect, it, vi } from 'vitest';

type Result = { data: unknown; error: null };
const fixture = vi.hoisted(() => ({
	filters: [] as { table: string; column: string; value: unknown }[]
}));

function query(table: string) {
	const result: Result = {
		data:
			table === 'child_profiles'
				? { id: 7, grade: '2', name: 'Reader' }
				: table === 'game_child_settings'
					? null
					: table === 'spelling_words'
						? [{ id: 11, word: 'planet', grade: '2' }]
						: [],
		error: null
	};
	const builder = {
		select: () => builder,
		eq: (column: string, value: unknown) => {
			fixture.filters.push({ table, column, value });
			return builder;
		},
		gte: () => builder,
		order: () => builder,
		limit: async () => result,
		maybeSingle: async () => result,
		then: (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) =>
			Promise.resolve(result).then(resolve, reject)
	};
	return builder;
}

vi.mock('#lib/server/db', () => ({
	getSupabase: async () => ({ from: (table: string) => query(table) })
}));

import { learningContext } from './learning-context';

beforeEach(() => {
	fixture.filters = [];
});

it('loads only custom spelling words for the child grade', async () => {
	const context = await learningContext(7);
	expect(fixture.filters).toContainEqual({ table: 'spelling_words', column: 'grade', value: '2' });
	expect(context.candidates).toContainEqual(
		expect.objectContaining({ id: 'custom:11', word: 'planet', source: 'custom' })
	);
	expect(context.notice).toContain('current custom');
});
