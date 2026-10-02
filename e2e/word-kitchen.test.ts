import { test, expect, type Page } from '@playwright/test';
async function login(page: Page) {
	await page.goto('/login');
	await page.locator('input[name="password"]').fill('kitchen-browser-test-password');
	await page.getByRole('button', { name: /unlock|login|sign in/i }).click();
	await page.waitForURL('**/settings');
}
test('requires parent permission to unlock child games and rejects cross-origin writes', async ({
	page,
	request
}) => {
	const denied = await request.post('/api/settings/games', {
		data: { action: 'unlock', childIds: [1] }
	});
	expect(denied.status()).toBe(403);
	await login(page);
	const cross = await page.request.post('/api/settings/games', {
		headers: { origin: 'https://untrusted.example' },
		data: { action: 'unlock', childIds: [1] }
	});
	expect(cross.status()).toBe(403);
	await page.goto('/settings/games');
	await page.getByRole('button', { name: 'Unlock this device' }).click();
	await expect(page.getByRole('status')).toHaveText('Saved.');
	await page.context().clearCookies({ name: 'session' });
	await page.goto('/games/word-kitchen');
	await expect(page.getByRole('heading', { name: 'What’s cooking today?' })).toBeVisible();
	await expect(page.getByRole('option', { name: 'Sam' })).toHaveCount(0);
	const forbidden = await page.request.post('/api/games/word-kitchen/start', {
		headers: { origin: 'http://localhost:4176' },
		data: {
			childId: 2,
			revisionId: '11111111-1111-4111-a111-111111111111',
			duration: 5,
			key: crypto.randomUUID()
		}
	});
	expect(forbidden.status()).toBe(404);
});
for (const title of ['Fruit Salad', 'Pancakes', 'Pizza'])
	for (const minutes of [5, 8, 10])
		test(`${title} ${minutes} minutes completes with keyboard-accessible controls`, async ({
			page
		}) => {
			await login(page);
			await page.goto('/games/word-kitchen');
			await page.getByLabel('Play time').selectOption(String(minutes));
			await page
				.locator('article')
				.filter({ has: page.getByRole('heading', { name: title, exact: true }) })
				.getByRole('button')
				.click();
			await page.waitForURL('**/session/*');
			if (title === 'Fruit Salad' && minutes === 5)
				await page.screenshot({ path: 'test-results/word-kitchen-play.png', fullPage: true });
			for (let i = 0; i < 60; i++) {
				if (await page.getByRole('heading', { name: 'Look what you made!' }).isVisible()) break;
				const show = page.getByRole('button', { name: 'Show me', exact: true });
				if (await show.isVisible()) {
					const together = page.getByRole('button', { name: 'Continue together →' });
					if (!(await together.isVisible())) {
						await show.click();
						await expect(together).toBeVisible();
					}
					await together.click();
					await expect(together).not.toBeVisible();
				} else {
					const action = page.locator('.play-panel .primary').first();
					await expect(action).toBeEnabled();
					const instruction = await page.locator('.play-panel h1').textContent();
					await action.focus();
					await page.keyboard.press('Enter');
					await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(instruction ?? '');
				}
			}
			await expect(page.getByRole('heading', { name: 'Look what you made!' })).toBeVisible();
			await expect(page.locator('.metrics')).toContainText(
				String(50 + { 5: 6, 8: 10, 10: 12 }[minutes as 5 | 8 | 10] * 5)
			);
		});
test('replays a committed move after a lost response without advancing twice', async ({ page }) => {
	await login(page);
	await page.goto('/games/word-kitchen');
	await page.locator('article').first().getByRole('button').click();
	await page.waitForURL('**/session/*');
	let dropped = false;
	await page.route('**/api/games/word-kitchen/session/*', async (route) => {
		if (!dropped && route.request().method() === 'POST') {
			dropped = true;
			await route.fetch();
			await route.abort('failed');
		} else await route.continue();
	});
	await page.getByRole('button', { name: 'Show me', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Retry saved move' })).toBeVisible();
	await page.reload();
	await expect(page.getByRole('button', { name: 'Continue together →' })).toBeVisible();
	await expect(page.locator('.eyebrow')).toContainText('STEP 1');
	expect(
		await page.evaluate(() =>
			Object.keys(localStorage).filter((k) => k.startsWith('word-kitchen:pending:'))
		)
	).toHaveLength(0);
});
test('mobile layout keeps all controls visible and supports reduced motion', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await login(page);
	await page.goto('/games/word-kitchen');
	await page.locator('article').first().getByRole('button').click();
	await page.waitForURL('**/session/*');
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await expect(page.getByRole('button', { name: 'A little hint' })).toBeVisible();
	await page.screenshot({ path: 'test-results/word-kitchen-mobile.png', fullPage: true });
});
