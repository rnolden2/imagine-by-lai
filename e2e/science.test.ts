import { expect, test } from '@playwright/test';

test.beforeEach(async ({ context }) => {
	await context.route('**/*', (route) =>
		new URL(route.request().url()).hostname === 'localhost' ? route.continue() : route.abort()
	);
});

test('constellation selects an experiment, explains science connections and navigates between them', async ({
	page
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/science');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('A universe of what if?');
	await expect(page.getByRole('status')).toContainText('148 activities');
	const map = page.getByRole('group', { name: 'Science constellation' });
	await expect(map.locator('.star')).toHaveCount(148);
	await map.getByRole('button', { name: 'Keep an ice cube frozen', exact: true }).click();
	const detail = page.getByRole('complementary', { name: 'Activity details' });
	await expect(detail.getByRole('heading', { name: 'Keep an ice cube frozen' })).toBeVisible();
	await detail.locator('summary').filter({ hasText: 'Try this together' }).click();
	await expect(
		detail.getByText('Place equal ice cubes in three identical bowls on a tray.')
	).toBeVisible();
	await detail.locator('summary').filter({ hasText: 'The science behind it' }).click();
	await expect(detail.getByText(/Heat moves from the warmer surroundings/)).toBeVisible();
	await expect(
		detail.getByRole('button', { name: /Water on the outside.*heat transfer/ })
	).toBeVisible();
	await detail.getByRole('button', { name: /Water on the outside.*heat transfer/ }).click();
	await expect(detail.getByRole('heading', { name: 'Water on the outside' })).toBeVisible();
	await detail.getByRole('button', { name: 'Similar materials', exact: true }).click();
	await expect(detail.locator('.related-activity').first()).toContainText('Both use');
	await detail.getByRole('button', { name: 'Close activity details' }).click();
	await expect(detail.getByRole('heading', { name: /One discovery leads/ })).toBeVisible();
	expect(errors).toEqual([]);
});

test('filters combine, list selection works, and no-match state can reset', async ({ page }) => {
	await page.goto('/science');
	await page.getByRole('button', { name: 'Physics', exact: true }).click();
	await expect(page.getByRole('status')).toContainText('26 activities');
	await page.getByLabel('Find a discovery').fill('wrapping');
	await expect(page.getByRole('status')).toContainText('1 activity');
	await page.getByRole('button', { name: 'Activity list', exact: true }).click();
	await page.locator('.activity-card').click();
	await expect(
		page.getByRole('complementary').getByRole('heading', { name: 'Keep an ice cube frozen' })
	).toBeVisible();
	await page.getByLabel('Includes materials').fill('paper, water');
	await expect(page.getByRole('status')).toContainText('0 activities');
	await expect(
		page.getByText('This selected activity is outside your current filters.')
	).toBeVisible();
	await page.getByRole('button', { name: 'Show all activities', exact: true }).click();
	await expect(page.getByRole('status')).toContainText('148 activities');
	await expect(page.locator('.activity-card')).toHaveCount(12);
	await page.getByRole('button', { name: /Show more activities/ }).click();
	await expect(page.locator('.activity-card')).toHaveCount(36);
	await page.getByRole('combobox', { name: 'Where', exact: true }).selectOption('outdoor');
	await page.getByRole('combobox', { name: 'Age', exact: true }).selectOption('5');
	await expect(page.locator('.activity-card')).not.toHaveCount(0);
});

test('map has keyboard selection and zoom controls', async ({ page }) => {
	await page.goto('/science');
	const map = page.getByRole('group', { name: 'Science constellation' });
	const star = map.getByRole('button', { name: 'Keep an ice cube frozen', exact: true });
	await star.focus();
	await page.keyboard.press('Enter');
	await expect(star).toHaveAttribute('aria-pressed', 'true');
	await map.getByRole('button', { name: 'Zoom in', exact: true }).click();
	await expect(map.getByRole('button', { name: 'Reset constellation view' })).toHaveText('150%');
	await map.getByRole('button', { name: 'Reset constellation view' }).click();
	await expect(map.getByRole('button', { name: 'Zoom out' })).toBeDisabled();
});

test('desktop constellation and selected panel are readable', async ({ page }, testInfo) => {
	await page.goto('/science');
	await page
		.getByRole('group', { name: 'Science constellation' })
		.getByRole('button', { name: 'Keep an ice cube frozen', exact: true })
		.click();
	await page.screenshot({ path: testInfo.outputPath('science-desktop.png'), fullPage: true });
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
});

test('mobile layout fits and selected details are reachable', async ({ page }, testInfo) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('/science');
	await page.getByRole('button', { name: 'Activity list', exact: true }).click();
	await page.locator('.activity-card').first().click();
	await expect(
		page.getByRole('complementary').getByRole('heading', { name: 'Keep an ice cube frozen' })
	).toBeInViewport();
	await page.screenshot({ path: testInfo.outputPath('science-mobile.png'), fullPage: true });
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
});
