import { expect, test } from '@playwright/test';

test('rollout switches block direct access and generation while preserving parent recovery', async ({
	page,
	baseURL
}, testInfo) => {
	const mode = testInfo.project.name;
	const request = page.request;
	const login = await request.post('/login', {
		headers: { origin: baseURL!, accept: 'text/html' },
		form: { password: 'kitchen-browser-test-password' },
		maxRedirects: 0
	});
	expect(login.status()).toBe(303);
	expect((await request.get('/settings/games')).status()).toBe(200);
	expect((await request.get('/math')).status()).toBe(200);
	expect((await request.get('/games')).status()).toBe(mode === 'games-disabled' ? 503 : 200);
	expect((await request.get('/games/space-math')).status()).toBe(
		mode === 'games-disabled' ? 503 : 200
	);
	expect((await request.get('/games/word-kitchen')).status()).toBe(
		mode === 'generation-disabled' ? 200 : 503
	);
	if (mode !== 'generation-disabled') {
		const start = await request.post('/api/games/word-kitchen/start', {
			headers: { origin: baseURL! },
			data: {}
		});
		expect(start.status()).toBe(503);
	}
	const favorite = await request.post('/api/settings/games', {
		headers: { origin: baseURL! },
		data: { action: 'favorite', childId: 1, name: 'Pancakes' }
	});
	expect(favorite.status()).toBe(200);
	await page.goto('/settings/games');
	await expect(page.getByRole('button', { name: 'Create game', exact: true })).toBeDisabled();
	await expect(
		page.getByRole('status').filter({ hasText: 'Creating new recipes is temporarily unavailable' })
	).toBeVisible();
	const generate = await request.post('/api/settings/games', {
		headers: { origin: baseURL! },
		data: {
			action: 'generate',
			childId: 1,
			favoriteId: crypto.randomUUID(),
			key: crypto.randomUUID()
		}
	});
	expect(generate.status()).toBe(503);
	expect((await generate.json()).message).toContain(
		'Creating new recipes is temporarily unavailable'
	);
	await expect(page.getByRole('link', { name: 'Games', exact: true })).toHaveCount(
		mode === 'games-disabled' ? 0 : 1
	);
});
