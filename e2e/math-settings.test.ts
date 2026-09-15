import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ context }) => {
	await context.route('**/*', (route) =>
		new URL(route.request().url()).hostname === 'localhost' ? route.continue() : route.abort()
	);
});

const operations = [
	'addition',
	'subtraction',
	'multiplication',
	'division',
	'fractions',
	'time',
	'number-recognition'
];
async function openSettings(page: Page) {
	await page.goto('/settings');
	if (new URL(page.url()).pathname === '/login') {
		await page.getByLabel('Password', { exact: true }).fill('math-browser-test-password');
		await page.getByRole('button', { name: 'Login', exact: true }).click();
		await expect(page).toHaveURL(/\/settings$/);
	}
	await page.getByRole('button', { name: 'Math Operations', exact: true }).click();
}
function formFor(page: Page, name = 'Alex') {
	return page.locator('form').filter({ has: page.getByRole('heading', { name, exact: true }) });
}
async function selectOperations(page: Page, selected: string[], name = 'Alex') {
	const form = formFor(page, name);
	for (const op of operations)
		await form.getByRole('checkbox', { name: op, exact: true }).setChecked(selected.includes(op));
	return form;
}
for (const operation of operations) {
	test(`save ${operation}, reload, and practice the saved mode`, async ({ page }) => {
		await openSettings(page);
		const form = await selectOperations(page, [operation]);
		await form.getByLabel('Number range', { exact: true }).selectOption('20');
		await form.getByLabel('Clock interval', { exact: true }).selectOption('5');
		const saved = page.waitForResponse(
			(res) => res.request().method() === 'POST' && res.url().includes('saveMathSettings')
		);
		await form.getByRole('button', { name: 'Save Math', exact: true }).click();
		expect((await saved).status()).toBe(200);
		await expect(page.getByRole('status')).toContainText('Math settings saved.');
		await expect(form.getByRole('checkbox', { name: operation, exact: true })).toBeChecked();
		await page.reload();
		await page.getByRole('button', { name: 'Math Operations', exact: true }).click();
		for (const op of operations)
			await expect(formFor(page).getByRole('checkbox', { name: op, exact: true })).toBeChecked({
				checked: op === operation
			});
		await expect(formFor(page).getByLabel('Number range', { exact: true })).toHaveValue('20');
		await expect(formFor(page).getByLabel('Clock interval', { exact: true })).toHaveValue('5');
		await expect(
			formFor(page, 'Sam').getByRole('checkbox', { name: 'addition', exact: true })
		).toBeChecked();
		await page.goto('/math');
		await page.getByRole('button', { name: 'Alex', exact: true }).click();
		const logged = page.waitForRequest(
			(req) => req.method() === 'POST' && req.url().endsWith('/api/math')
		);
		if (['fractions', 'time', 'number-recognition'].includes(operation)) {
			await page
				.getByRole('button', { name: /^\d+(?:[/:]\d+)?$/ })
				.first()
				.click();
		} else {
			await page.getByRole('textbox', { name: 'Your answer' }).fill('1');
			await page.getByRole('button', { name: 'Check', exact: true }).click();
		}
		expect((await logged).postDataJSON()).toMatchObject({ childId: 1, operation });
	});
}
test('adding a mode preserves the existing selection after save and reload', async ({ page }) => {
	await openSettings(page);
	const form = await selectOperations(page, ['addition']);
	await form.getByRole('button', { name: 'Save Math', exact: true }).click();
	await expect(page.getByRole('status')).toContainText('Math settings saved.');
	await expect(form.getByRole('button', { name: 'Save Math', exact: true })).toBeEnabled();
	await form.getByRole('checkbox', { name: 'fractions', exact: true }).check();
	await form.getByRole('checkbox', { name: 'time', exact: true }).check();
	await form.getByRole('button', { name: 'Save Math', exact: true }).click();
	await expect(page.getByRole('status')).toContainText('Math settings saved.');
	await openSettings(page);
	for (const operation of ['addition', 'fractions', 'time'])
		await expect(
			formFor(page).getByRole('checkbox', { name: operation, exact: true })
		).toBeChecked();
});
test('an empty selection fails without overwriting saved operations', async ({ page }) => {
	await openSettings(page);
	const baseline = await selectOperations(page, ['addition']);
	await baseline.getByRole('button', { name: 'Save Math', exact: true }).click();
	await expect(page.getByRole('status')).toContainText('Math settings saved.');
	await expect(baseline.getByRole('button', { name: 'Save Math', exact: true })).toBeEnabled();
	const form = await selectOperations(page, []);
	await form.getByRole('button', { name: 'Save Math', exact: true }).click();
	await expect(page.getByRole('status')).toContainText('at least one valid math operation');
	await expect(form.getByRole('button', { name: 'Save Math', exact: true })).toBeEnabled();
	await openSettings(page);
	await expect(
		formFor(page).getByRole('checkbox', { name: 'addition', exact: true })
	).toBeChecked();
});
test('a database failure keeps the unsaved selection available to retry', async ({ page }) => {
	await openSettings(page);
	const form = await selectOperations(page, ['division'], 'Save Failure');
	await form.getByRole('button', { name: 'Save Math', exact: true }).click();
	await expect(page.getByRole('status')).toContainText('Math settings could not be saved');
	await expect(form.getByRole('checkbox', { name: 'division', exact: true })).toBeChecked();
	await expect(form.getByRole('button', { name: 'Save Math', exact: true })).toBeEnabled();
	await openSettings(page);
	await expect(
		formFor(page, 'Save Failure').getByRole('checkbox', { name: 'addition', exact: true })
	).toBeChecked();
	await expect(
		formFor(page, 'Save Failure').getByRole('checkbox', { name: 'division', exact: true })
	).not.toBeChecked();
});

test('saving updates an already-open practice tab without reselecting the child', async ({
	page,
	context
}) => {
	await openSettings(page);
	let form = await selectOperations(page, ['addition']);
	await form.getByRole('button', { name: 'Save Math', exact: true }).click();
	await expect(page.getByRole('status')).toContainText('Math settings saved.');
	const practice = await context.newPage();
	await practice.goto('/math');
	await practice.getByRole('button', { name: 'Alex', exact: true }).click();
	await practice.getByRole('textbox', { name: 'Your answer' }).fill('42');
	form = await selectOperations(page, ['number-recognition']);
	await form.getByRole('button', { name: 'Save Math', exact: true }).click();
	await expect(page.getByRole('status')).toContainText('Math settings saved.');
	await expect(practice.getByText('Which number matches this group?')).toBeVisible();
	await expect(form.getByRole('checkbox', { name: 'addition', exact: true })).not.toBeChecked();
	await expect(
		form.getByRole('checkbox', { name: 'number-recognition', exact: true })
	).toBeChecked();
	await practice.close();
});

test('practice polls for saves from a separate browser context', async ({ page, browser }) => {
	await openSettings(page);
	const form = await selectOperations(page, ['addition']);
	await form.getByRole('button', { name: 'Save Math', exact: true }).click();
	await expect(page.getByRole('status')).toContainText('Math settings saved.');
	const practice = await browser.newPage({ baseURL: 'http://localhost:4175' });
	try {
		await practice.route('**/*', (route) =>
			new URL(route.request().url()).hostname === 'localhost' ? route.continue() : route.abort()
		);
		await practice.clock.install();
		const initial = practice.waitForResponse('**/api/math/settings');
		await practice.goto('/math');
		await initial;
		await practice.getByRole('button', { name: 'Alex', exact: true }).click();
		await selectOperations(page, ['time']);
		await form.getByLabel('Clock interval', { exact: true }).selectOption('60');
		await form.getByRole('button', { name: 'Save Math', exact: true }).click();
		await expect(page.getByRole('status')).toContainText('Math settings saved.');
		await practice.clock.fastForward(15_000);
		await expect(practice.getByText('What time is shown?')).toBeVisible();
		const logged = practice.waitForRequest('**/api/math');
		await practice
			.getByRole('button', { name: /^\d+:\d+$/ })
			.first()
			.click();
		expect((await logged).postDataJSON()).toMatchObject({
			childId: 1,
			operation: 'time',
			problemState: { minute: 0 }
		});
	} finally {
		await practice.context().close();
	}
});

test('focus refresh preserves an answer and recovers from a failed settings read', async ({
	page
}) => {
	await openSettings(page);
	const form = await selectOperations(page, ['addition']);
	await form.getByRole('button', { name: 'Save Math', exact: true }).click();
	await expect(page.getByRole('status')).toContainText('Math settings saved.');
	await page.getByRole('link', { name: 'Math', exact: true }).click();
	await page.getByRole('button', { name: 'Alex', exact: true }).click();
	await page.getByRole('textbox', { name: 'Your answer' }).fill('42');
	await page.route('**/api/math/settings', (route) =>
		route.fulfill({ status: 503, json: { error: 'Temporary failure' } })
	);
	await page.evaluate(() => window.dispatchEvent(new Event('focus')));
	await expect(page.getByRole('status')).toContainText('Settings could not be refreshed');
	await expect(page.getByRole('textbox', { name: 'Your answer' })).toHaveValue('42');
	await page.unroute('**/api/math/settings');
	const refreshed = page.waitForResponse('**/api/math/settings');
	await page.evaluate(() => window.dispatchEvent(new Event('focus')));
	expect((await refreshed).headers()['cache-control']).toBe('no-store');
	await expect(page.getByRole('status')).toHaveCount(0);
	await expect(page.getByRole('textbox', { name: 'Your answer' })).toHaveValue('42');
});
