import { expect, test, type Page } from '@playwright/test';

const operations = [
	'addition',
	'subtraction',
	'multiplication',
	'division',
	'fractions',
	'time',
	'number-recognition'
];

test.beforeEach(async ({ context }) => {
	await context.route('**/*', (route) =>
		new URL(route.request().url()).hostname === 'localhost' ? route.continue() : route.abort()
	);
});

async function saveOperation(page: Page, operation: string) {
	await page.goto('/settings');
	if (new URL(page.url()).pathname === '/login') {
		await page.getByLabel('Password', { exact: true }).fill('math-browser-test-password');
		await page.getByRole('button', { name: 'Login', exact: true }).click();
	}
	await page.getByRole('button', { name: 'Math Operations', exact: true }).click();
	const form = page
		.locator('form')
		.filter({ has: page.getByRole('heading', { name: 'Alex', exact: true }) });
	for (const op of operations) {
		await form.getByRole('checkbox', { name: op, exact: true }).setChecked(op === operation);
	}
	await form.getByLabel('Number range', { exact: true }).selectOption('20');
	await form.getByLabel('Clock interval', { exact: true }).selectOption('30');
	await form.getByRole('button', { name: 'Save Math', exact: true }).click();
	await expect(page.getByRole('status')).toContainText('Math settings saved.');
}

async function start(page: Page) {
	const refreshed = page.waitForResponse('**/api/math/settings');
	await page.goto('/games/space-math');
	await refreshed;
	await page.getByRole('button', { name: 'Alex', exact: true }).click();
}

async function correctAnswer(page: Page, operation: string) {
	if (operation === 'fractions') {
		const label = await page.getByRole('img', { name: /equal parts/ }).getAttribute('aria-label');
		const [a, b] = label!.match(/\d+/g)!.map(Number);
		return `${a}/${b}`;
	}
	if (operation === 'time') {
		const label = await page.getByRole('img', { name: /Clock with/ }).getAttribute('aria-label');
		const [hour, minute] = label!.match(/\d+/g)!.map(Number);
		return `${hour}:${String(minute).padStart(2, '0')}`;
	}
	if (operation === 'number-recognition') {
		const label = await page.getByRole('img', { name: /\d+ stars/ }).getAttribute('aria-label');
		return label!.match(/\d+/)![0];
	}
	const [a, b] = (await page.getByTestId('equation').innerText()).match(/\d+/g)!.map(Number);
	return String(
		operation === 'addition'
			? a + b
			: operation === 'subtraction'
				? a - b
				: operation === 'multiplication'
					? a * b
					: a / b
	);
}

async function answer(page: Page, value: string) {
	const response = page.waitForResponse(
		(res) => res.url().endsWith('/api/math') && res.request().method() === 'POST'
	);
	await page
		.getByRole('group', { name: 'Answer choices' })
		.getByRole('button', { name: value, exact: true })
		.click();
	const saved = await response;
	expect(saved.status()).toBe(200);
	return saved.request().postDataJSON();
}

for (const operation of operations) {
	test(`Space Math uses saved ${operation}, gives a hint, and saves the answer`, async ({
		page
	}) => {
		await saveOperation(page, operation);
		await start(page);
		await page.getByRole('button', { name: 'Show hint', exact: true }).click();
		await expect(page.locator('#space-hint')).toBeVisible();
		const value = await correctAnswer(page, operation);
		const logged = await answer(page, value);
		expect(logged).toMatchObject({ childId: 1, operation, givenAnswer: value });
		if (operation === 'addition' || operation === 'subtraction') {
			expect(logged.problemState.num1).toBeLessThanOrEqual(20);
			expect(logged.problemState.num2).toBeLessThanOrEqual(20);
		}
		if (operation === 'time') expect(logged.problemState.minute % 30).toBe(0);
		await expect(page.getByTestId('planet-count')).toHaveText('1 planet visited');
		await expect(page.getByRole('meter', { name: 'Ship fuel' })).toHaveAttribute(
			'aria-valuenow',
			'1'
		);
		await expect(page.getByRole('status')).toContainText('Welcome to Moonbeam');
		await page.getByRole('button', { name: 'Keep exploring' }).click();
		await expect(page.getByText('Next stop:')).toContainText('Peach');
		await expect(page.getByRole('meter')).toHaveAttribute('aria-valuenow', '0');
		await expect(page.locator('#space-hint')).toHaveCount(0);
	});
}

test('relaxed retries preserve the problem, fuel only once, and remain in parent history', async ({
	page
}) => {
	await saveOperation(page, 'addition');
	await start(page);
	const equation = await page.getByTestId('equation').innerText();
	const value = await correctAnswer(page, 'addition');
	const choices = await page
		.getByRole('group', { name: 'Answer choices' })
		.getByRole('button')
		.allTextContents();
	const wrong = choices.map((choice) => choice.trim()).find((choice) => choice !== value)!;
	const first = await answer(page, wrong);
	await answer(page, wrong);
	await expect(page.getByRole('status')).toContainText('Try again');
	await expect(page.getByTestId('equation')).toHaveText(equation);
	await expect(page.getByTestId('planet-count')).toHaveText('0 planets visited');
	await expect(page.getByRole('meter')).toHaveAttribute('aria-valuenow', '0');
	await page.clock.install();
	await page.clock.fastForward(60_000);
	await expect(page.getByTestId('equation')).toHaveText(equation);
	const correct = await answer(page, value);
	expect(correct.sessionId).toBe(first.sessionId);
	const correctButton = page
		.getByRole('group', { name: 'Answer choices' })
		.getByRole('button', { name: value, exact: true });
	await expect(correctButton).toBeDisabled();
	await page.clock.fastForward(60_000);
	await expect(page.getByRole('button', { name: 'Keep exploring' })).toBeVisible();
	await expect(page.getByTestId('planet-count')).toHaveText('1 planet visited');
	await page.goto('/settings');
	await page.getByRole('button', { name: 'Math Operations', exact: true }).click();
	const history = page
		.getByRole('row')
		.filter({ has: page.getByRole('cell', { name: 'Alex', exact: true }) });
	await expect(
		history.filter({ has: page.getByRole('cell', { name: '33%', exact: true }) })
	).toHaveCount(1);
});

test('switching children separates journeys and applies that child’s saved settings', async ({
	page
}) => {
	await saveOperation(page, 'division');
	await start(page);
	const alex = await answer(page, await correctAnswer(page, 'division'));
	await page.getByRole('button', { name: 'Sam', exact: true }).click();
	await expect(page.getByTestId('planet-count')).toHaveText('0 planets visited');
	const sam = await answer(page, await correctAnswer(page, 'addition'));
	expect(sam).toMatchObject({ childId: 2, operation: 'addition' });
	expect(sam.sessionId).not.toBe(alex.sessionId);
	expect(sam.problemState.num1).toBeLessThanOrEqual(10);
	expect(sam.problemState.num2).toBeLessThanOrEqual(10);
});

test('live settings refresh keeps an unchanged question, then applies a saved mode', async ({
	page,
	context
}) => {
	await saveOperation(page, 'addition');
	const game = await context.newPage();
	await start(game);
	await game.getByRole('button', { name: 'Show hint' }).click();
	const equation = await game.getByTestId('equation').innerText();
	const refreshed = game.waitForResponse('**/api/math/settings');
	await game.evaluate(() => window.dispatchEvent(new Event('focus')));
	await refreshed;
	await expect(game.getByTestId('equation')).toHaveText(equation);
	await expect(game.locator('#space-hint')).toBeVisible();
	await saveOperation(page, 'fractions');
	await expect(game.getByRole('img', { name: /equal parts/ })).toBeVisible();
	await expect(game.locator('#space-hint')).toHaveCount(0);
	await answer(game, await correctAnswer(game, 'fractions'));
	await saveOperation(page, 'time');
	await expect(game.getByRole('button', { name: 'Keep exploring' })).toBeVisible();
	// Wait for the new saved settings to be read before starting the next question.
	const settings = game.waitForResponse('**/api/math/settings');
	await game.evaluate(() => window.dispatchEvent(new Event('focus')));
	await settings;
	await game.getByRole('button', { name: 'Keep exploring' }).click();
	await expect(game.getByRole('img', { name: /Clock with/ })).toBeVisible();
	await expect(game.getByTestId('planet-count')).toHaveText('1 planet visited');
	await game.close();
});

test('history and refresh failures do not stop play', async ({ page }) => {
	await saveOperation(page, 'addition');
	await start(page);
	await page.route('**/api/math', (route) =>
		route.fulfill({ status: 503, json: { success: false } })
	);
	await page.route('**/api/math/settings', (route) => route.fulfill({ status: 503, json: {} }));
	await page.evaluate(() => window.dispatchEvent(new Event('focus')));
	await expect(page.getByText('Settings could not be refreshed.', { exact: false })).toBeVisible();
	await page
		.getByRole('group', { name: 'Answer choices' })
		.getByRole('button', { name: await correctAnswer(page, 'addition'), exact: true })
		.click();
	await expect(page.getByText('Some answers could not be saved', { exact: false })).toBeVisible();
	await expect(page.getByTestId('planet-count')).toHaveText('1 planet visited');
	await page.getByRole('button', { name: 'Keep exploring' }).click();
	await expect(page.getByRole('button', { name: 'Show hint' })).toBeVisible();
});

test('Games navigation, keyboard answers, reduced motion, and mobile layout work', async ({
	page
}) => {
	await saveOperation(page, 'addition');
	await page.setViewportSize({ width: 375, height: 812 });
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('/games');
	await page.getByRole('link', { name: /Space Math/ }).click();
	await expect(page).toHaveURL(/\/games\/space-math$/);
	await page.getByRole('button', { name: 'Alex', exact: true }).click();
	const correct = page
		.getByRole('group', { name: 'Answer choices' })
		.getByRole('button', { name: await correctAnswer(page, 'addition'), exact: true });
	await correct.focus();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('button', { name: 'Keep exploring' })).toBeFocused();
	await expect(page.getByTestId('planet-count')).toHaveText('1 planet visited');
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
	await page.screenshot({ path: '/private/tmp/space-math-mobile.png', fullPage: true });
	await page.keyboard.press('Enter');
	await expect(page.getByRole('heading', { name: 'What is the answer?' })).toBeFocused();
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.screenshot({ path: '/private/tmp/space-math-desktop.png', fullPage: true });
});
