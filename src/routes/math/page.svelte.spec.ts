import { page } from '@vitest/browser/context';
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';
import type { PageData } from './$types';

vi.mock('$lib/math-settings-sync', () => ({ watchMathSettings: () => () => {} }));

const data = {
	user: undefined,
	users: [
		{
			id: 1,
			name: 'Alex',
			grade: '1',
			gender: 'boy',
			character_description: null,
			story_themes: [],
			story_length_minutes: 5
		},
		{
			id: 2,
			name: 'Sam',
			grade: 'K',
			gender: 'girl',
			character_description: null,
			story_themes: [],
			story_length_minutes: 5
		}
	],
	mathSettings: [
		{ id: 1, updated_at: '', child_id: 1, operations: ['addition'], config: { maxNumber: 10 } },
		{
			id: 2,
			updated_at: '',
			child_id: 2,
			operations: ['number-recognition'],
			config: { maxNumber: 20 }
		}
	]
} satisfies PageData;
afterEach(() => vi.restoreAllMocks());
it('uses the selected child’s mode, records answers once, and separates sessions', async () => {
	const fetchMock = vi
		.spyOn(globalThis, 'fetch')
		.mockResolvedValue(new Response('{"success":true}'));
	render(Page, { data });
	await page.getByRole('button', { name: 'Alex', exact: true }).click();
	await page.getByRole('textbox', { name: 'Your answer' }).fill('5');
	await page.getByRole('button', { name: 'Check', exact: true }).click();
	expect(fetchMock).toHaveBeenCalledTimes(1);
	const first = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
	expect(first).toMatchObject({ childId: 1, operation: 'addition' });
	await expect.element(page.getByRole('textbox', { name: 'Your answer' })).toBeDisabled();
	await page.getByRole('button', { name: 'Sam', exact: true }).click();
	await expect.element(page.getByText('Which number matches this group?')).toBeVisible();
	await page.getByRole('button', { name: /^\d+$/ }).first().click();
	const second = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
	expect(second).toMatchObject({ childId: 2, operation: 'number-recognition' });
	expect(second.sessionId).not.toBe(first.sessionId);
});
it('shows a history failure without blocking practice', async () => {
	vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 503 }));
	render(Page, { data });
	await page.getByRole('button', { name: 'Sam', exact: true }).click();
	await page.getByRole('button', { name: /^\d+$/ }).first().click();
	await expect
		.element(page.getByRole('status'))
		.toHaveTextContent('Some answers could not be saved');
});

it('applies refreshed modes to the selected child without restarting their session', async () => {
	const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
	const view = render(Page, { data });
	await page.getByRole('button', { name: 'Alex', exact: true }).click();
	await page.getByRole('textbox', { name: 'Your answer' }).fill('5');
	await page.getByRole('button', { name: 'Check', exact: true }).click();
	const first = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
	await view.rerender({
		data: {
			...data,
			mathSettings: data.mathSettings.map((row) =>
				row.child_id === 1 ? { ...row, operations: ['number-recognition'] } : row
			)
		}
	});
	await expect.element(page.getByText('Which number matches this group?')).toBeVisible();
	await page.getByRole('button', { name: /^\d+$/ }).first().click();
	const second = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
	expect(second).toMatchObject({
		childId: 1,
		operation: 'number-recognition',
		sessionId: first.sessionId
	});
});

it('preserves an unfinished answer when only another child or the save timestamp changes', async () => {
	const view = render(Page, { data });
	await page.getByRole('button', { name: 'Alex', exact: true }).click();
	await page.getByRole('textbox', { name: 'Your answer' }).fill('42');
	await view.rerender({
		data: {
			...data,
			mathSettings: data.mathSettings.map((row) => ({
				...row,
				updated_at: '2026-09-14T19:00:00Z',
				operations: row.child_id === 2 ? ['time'] : row.operations
			}))
		}
	});
	await expect.element(page.getByRole('textbox', { name: 'Your answer' })).toHaveValue('42');
});
