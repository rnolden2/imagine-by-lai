import { expect, test, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const origin = 'http://localhost:4175';
async function login(request: APIRequestContext) {
	const response = await request.post('/login', {
		headers: { origin, accept: 'text/html' },
		form: { password: 'math-browser-test-password' },
		maxRedirects: 0
	});
	expect(response.status()).toBe(303);
}
const attempt = () => ({
	eventId: crypto.randomUUID(),
	occurredAt: new Date().toISOString(),
	childId: 1,
	sessionId: crypto.randomUUID(),
	operation: 'addition',
	problemState: { num1: 2, num2: 3 },
	givenAnswer: '5'
});
test('anonymous pages, data loads, API reads and mutations cannot expose personal data', async ({
	request
}) => {
	for (const path of ['/', '/math', '/spelling', '/story/1', '/games/space-math', '/settings']) {
		const response = await request.get(path, { maxRedirects: 0 });
		expect(response.status()).toBe(303);
		expect(new URL(response.headers().location, response.url()).href).toBe(`${origin}/login`);
	}
	const data = await request.get('/math/__data.json');
	expect(await data.text()).not.toContain('Alex');
	for (const path of ['/api/math/settings', '/api/define?word=cat'])
		expect((await request.get(path)).status()).toBe(403);
	for (const path of ['/api/math', '/api/spelling', '/api/tts', '/api/settings/games']) {
		const response = await request.post(path, { headers: { origin }, data: attempt() });
		expect(response.status()).toBe(403);
	}
});
test('a parent-authorized device sees only its child and loses access when revoked', async ({
	browser,
	request
}) => {
	await login(request);
	const unlocked = await request.post('/api/settings/games', {
		headers: { origin },
		data: { action: 'unlock', childIds: [1] }
	});
	expect(unlocked.status()).toBe(200);
	const deviceId = (await unlocked.json()).id;
	const cookie = (await request.storageState()).cookies.find(
		(c) => c.name === 'word_kitchen_device'
	)!;
	const context = await browser.newContext({
		baseURL: origin,
		extraHTTPHeaders: { 'x-forwarded-proto': 'http' },
		storageState: { cookies: [cookie], origins: [] }
	});
	try {
		const page = await context.newPage();
		await page.goto('/math');
		await expect(page.getByRole('button', { name: 'Alex', exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Sam', exact: true })).toHaveCount(0);
		const settings = await context.request.get('/api/math/settings');
		expect(
			(await settings.json()).mathSettings.map((row: { child_id: number }) => row.child_id)
		).toEqual([1]);
		expect((await context.request.get('/story/2')).status()).toBe(404);
		const home = await context.request.get('/');
		expect(await home.text()).not.toContain('Sam private story');
		expect(
			(
				await context.request.post('/api/math', {
					headers: { origin },
					data: { ...attempt(), childId: 2 }
				})
			).status()
		).toBe(404);
		expect(
			(await context.request.post('/api/math', { headers: { origin }, data: attempt() })).status()
		).toBe(200);
		const revoked = await request.post('/api/settings/games', {
			headers: { origin },
			data: { action: 'revoke', deviceId }
		});
		expect(revoked.status()).toBe(200);
		expect((await context.request.get('/api/math/settings')).status()).toBe(403);
	} finally {
		await context.close();
	}
});
test('stored story markup is inert in the browser and sensitive responses are private', async ({
	page,
	request
}) => {
	await login(request);
	await page.context().addCookies((await request.storageState()).cookies);
	await page.goto('/story/1');
	expect(await page.evaluate(() => 'storyScriptRan' in window)).toBe(false);
	await expect(page.locator('h1').filter({ hasText: 'A safe story' })).toBeVisible();
	await expect(page.locator('[onclick]')).toHaveCount(0);
	const response = await request.get('/story/1');
	const storyDocument = await response.text();
	expect(storyDocument).not.toContain('window.storyScriptRan=true');
	expect(response.headers()['cache-control']).toContain('no-store');
	expect(response.headers()['x-content-type-options']).toBe('nosniff');
	expect(response.headers()['referrer-policy']).toBe('same-origin');
	expect(response.headers()['strict-transport-security']).toBe(
		'max-age=31536000; includeSubDomains'
	);
	expect(response.headers()['cross-origin-opener-policy']).toBe('same-origin');
	expect(response.headers()['cross-origin-resource-policy']).toBe('same-origin');
	expect(response.headers()['permissions-policy']).toContain('camera=()');
	const csp = response.headers()['content-security-policy'];
	expect(csp).toContain("default-src 'self'");
	expect(csp).toContain("object-src 'none'");
	expect(csp).toContain("frame-ancestors 'none'");
	expect(csp).toContain('https://storage.googleapis.com');
	expect(csp).not.toContain('fonts.googleapis.com');
	expect(csp.match(/script-src ([^;]+)/)?.[1]).not.toContain("'unsafe-inline'");
	expect(response.headers()['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
});

test('browser loaders allowlist fields when database rows gain private columns', async ({
	request
}) => {
	await login(request);
	for (const path of ['/', '/math', '/spelling', '/story/1', '/settings']) {
		const response = await request.get(path);
		expect(response.status(), path).toBe(200);
		const page = await response.text();
		expect(page, path).not.toContain('SENSITIVE_BILLING_SENTINEL');
		expect(page, path).not.toContain('SENSITIVE_COST_SENTINEL');
		expect(page, path).not.toContain('SENSITIVE_PROVIDER_SENTINEL');
	}
});

test('parent destructive actions require explicit confirmation before any request', async ({
	page,
	request
}) => {
	await login(request);
	await page.context().addCookies((await request.storageState()).cookies);
	await page.goto('/settings');
	const mutationRequests: string[] = [];
	page.on('request', (candidate) => {
		if (candidate.method() === 'POST' && candidate.url().includes('/settings?'))
			mutationRequests.push(candidate.url());
	});
	const dismiss = async (button: ReturnType<typeof page.getByRole>, message: RegExp) => {
		page.once('dialog', async (dialog) => {
			expect(dialog.message()).toMatch(message);
			await dialog.dismiss();
		});
		await button.click();
		expect(mutationRequests).toEqual([]);
	};

	const alexProfile = page.locator('form').filter({ has: page.getByLabel('Alex name') });
	await dismiss(
		alexProfile.getByRole('button', { name: 'Delete', exact: true }),
		/Delete Alex and all of their stories, settings, and learning history/
	);
	await page.getByRole('button', { name: 'Math Operations', exact: true }).click();
	await dismiss(page.getByRole('button', { name: 'Clear stats for Alex' }), /cannot be undone/);
	await page.getByRole('button', { name: 'Spelling Lists', exact: true }).click();
	await dismiss(
		page.getByRole('button', { name: 'Clear all', exact: true }),
		/Clear all spelling history for every child/
	);
	await page.getByRole('button', { name: 'System Status', exact: true }).click();
	await dismiss(
		page.getByRole('button', { name: 'Delete story and image' }).first(),
		/story cannot be recovered/
	);
});

test('primary workflows expose labeled controls, images, landmarks, and unique IDs', async ({
	page,
	request
}) => {
	await login(request);
	await page.context().addCookies((await request.storageState()).cookies);
	const failures: string[] = [];
	for (const path of [
		'/',
		'/math',
		'/spelling',
		'/games',
		'/games/space-math',
		'/science',
		'/story/1',
		'/settings'
	]) {
		await page.goto(path);
		const audit = await page.evaluate(() => {
			const text = (element: Element) => element.textContent?.trim() ?? '';
			const named = (element: Element) => {
				if (element.getAttribute('aria-label')?.trim()) return true;
				const labelledBy = element
					.getAttribute('aria-labelledby')
					?.split(/\s+/)
					.some((id) => {
						const label = document.getElementById(id);
						return label ? Boolean(text(label)) : false;
					});
				if (labelledBy) return true;
				if (
					'labels' in element &&
					Array.from(element.labels as NodeListOf<HTMLLabelElement>).some(text)
				)
					return true;
				if (element instanceof HTMLInputElement && ['submit', 'button'].includes(element.type))
					return Boolean(element.value.trim());
				if (
					element instanceof HTMLInputElement ||
					element instanceof HTMLSelectElement ||
					element instanceof HTMLTextAreaElement
				)
					return Boolean(element.getAttribute('title')?.trim());
				if (element instanceof HTMLImageElement) return Boolean(element.alt.trim());
				if (element.querySelector('img[alt]:not([alt=""])')) return true;
				return Boolean(text(element) || element.getAttribute('title')?.trim());
			};
			const controls = [
				...document.querySelectorAll(
					'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"]'
				)
			];
			const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
			return {
				unnamed: controls.filter((element) => !named(element)).map((element) => element.outerHTML),
				imagesWithoutAlt: [...document.images]
					.filter((image) => !image.hasAttribute('alt'))
					.map((image) => image.outerHTML),
				duplicateIds: [...new Set(ids.filter((id, index) => id && ids.indexOf(id) !== index))],
				language: document.documentElement.lang,
				title: document.title,
				mainCount: document.querySelectorAll('main').length
			};
		});
		if (audit.unnamed.length)
			failures.push(`${path} unnamed controls: ${audit.unnamed.join(', ')}`);
		if (audit.imagesWithoutAlt.length)
			failures.push(`${path} images without alt: ${audit.imagesWithoutAlt.join(', ')}`);
		if (audit.duplicateIds.length)
			failures.push(`${path} duplicate IDs: ${audit.duplicateIds.join(', ')}`);
		if (!audit.language) failures.push(`${path} is missing document language`);
		if (!audit.title) failures.push(`${path} is missing a document title`);
		if (audit.mainCount !== 1) failures.push(`${path} has ${audit.mainCount} main landmarks`);
	}
	expect(failures).toEqual([]);
});
test('primary workflows have no automatically detectable accessibility violations', async ({
	page,
	request
}) => {
	await page.route('**/api/tts', (route) =>
		route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"fixture"}' })
	);
	await login(request);
	await page.context().addCookies((await request.storageState()).cookies);
	const failures: Array<{
		path: string;
		id: string;
		impact: string | null;
		nodes: Array<{ target: string[]; html: string; failureSummary: string | undefined }>;
	}> = [];
	const audit = async (label: string) => {
		const { violations } = await new AxeBuilder({ page }).analyze();
		failures.push(
			...violations.map(({ id, impact, nodes }) => ({
				path: label,
				id,
				impact,
				nodes: nodes.map((node) => ({
					target: node.target,
					html: node.html,
					failureSummary: node.failureSummary
				}))
			}))
		);
	};
	for (const path of ['/', '/math', '/spelling', '/games', '/science', '/story/1', '/settings']) {
		await page.goto(path);
		await audit(path);
		if (path === '/math') {
			await page.getByRole('button', { name: 'Alex', exact: true }).click();
			await expect(page.getByText('Accuracy', { exact: true })).toBeVisible();
			await page.waitForTimeout(400); // Let the 250 ms Svelte entrance transition reach full opacity.
			await audit('/math — selected child');
		} else if (path === '/spelling') {
			await page.getByRole('button', { name: 'Alex', exact: true }).click();
			await expect(page.getByLabel('Spell the word you hear', { exact: true })).toBeVisible();
			await page.waitForTimeout(400); // Let the 300 ms practice-card transition finish.
			await audit('/spelling — active practice');
		} else if (path === '/games/space-math') {
			await page.getByRole('button', { name: 'Alex', exact: true }).click();
			await expect(page.getByRole('region', { name: 'Math challenge' })).toBeVisible();
			await audit('/games/space-math — active practice');
		} else if (path === '/science') {
			await page.locator('.star:not([disabled])').first().click();
			await expect(page.locator('#science-detail')).toBeVisible();
			await audit('/science — selected activity');
		} else if (path === '/settings') {
			for (const tab of ['Math Operations', 'Spelling Lists', 'System Status']) {
				await page.getByRole('button', { name: tab, exact: true }).click();
				await audit(`/settings — ${tab}`);
			}
		}
	}
	expect(failures).toEqual([]);
});
test('JSON APIs reject cross-origin, missing-origin, malformed and oversized requests', async ({
	request
}) => {
	await login(request);
	for (const originHeader of ['', 'https://evil.example']) {
		for (const path of ['/api/math', '/api/spelling', '/api/tts'])
			expect(
				(await request.post(path, { headers: { origin: originHeader }, data: attempt() })).status()
			).toBe(403);
	}
	for (const path of ['/api/math', '/api/spelling', '/api/tts']) {
		expect(
			(
				await request.post(path, {
					headers: { origin, 'content-type': 'application/json' },
					data: '{'
				})
			).status()
		).toBe(400);
		expect(
			(
				await request.post(path, { headers: { origin }, data: { text: 'a'.repeat(10000) } })
			).status()
		).toBe(413);
	}
	expect((await request.get('/api/define?word=' + 'a'.repeat(81))).status()).toBe(400);
});
test('locking parent settings removes the admin session and preserves child-device access', async ({
	page
}) => {
	await page.goto('/login');
	await page.getByLabel('Password', { exact: true }).fill('math-browser-test-password');
	await page.getByRole('button', { name: 'Login', exact: true }).click();
	await expect(page).toHaveURL(/\/settings$/);
	const status = await page.evaluate(
		async () =>
			(
				await fetch('/api/settings/games', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ action: 'unlock', childIds: [1] })
				})
			).status
	);
	expect(status).toBe(200);
	await page.getByRole('button', { name: 'Lock parent settings', exact: true }).click();
	await expect(page).toHaveURL(origin + '/');
	await expect(page.getByRole('button', { name: 'Lock parent settings', exact: true })).toHaveCount(
		0
	);
	const cookies = await page.context().cookies();
	expect(cookies.some((c) => c.name === 'session')).toBe(false);
	expect(cookies.some((c) => c.name === 'word_kitchen_device')).toBe(true);
	await page.goto('/settings');
	await expect(page).toHaveURL(/\/login$/);
});
test('a lost practice response is retried with the same receipt after reloading', async ({
	page,
	request
}) => {
	await login(request);
	await page.context().addCookies((await request.storageState()).cookies);
	const submissions: object[] = [];
	await page.route('**/api/math', async (route) => {
		submissions.push(route.request().postDataJSON());
		if (submissions.length === 1) {
			// Commit to the fixture, then lose the response as a real network failure can.
			const response = await route.fetch();
			expect(response.status()).toBe(200);
			await route.abort('connectionreset');
		} else await route.continue();
	});
	await page.goto('/math');
	await page.getByRole('button', { name: 'Alex', exact: true }).click();
	const choices = page.getByRole('button', { name: /^\d+(?:[/:]\d+)?$/ });
	if (await page.getByRole('textbox', { name: 'Your answer' }).count()) {
		await page.getByRole('textbox', { name: 'Your answer' }).fill('1');
		await page.getByRole('button', { name: 'Check', exact: true }).click();
	} else await choices.first().click();
	await expect(page.getByRole('button', { name: 'Retry saving', exact: true })).toBeVisible();
	await page.reload();
	await expect.poll(() => submissions.length).toBe(2);
	expect(submissions[1]).toEqual(submissions[0]);
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					Object.keys(localStorage).filter((key) => key.startsWith('practice-pending-v1:')).length
			)
		)
		.toBe(0);
	await expect(page.getByRole('button', { name: 'Retry saving', exact: true })).toHaveCount(0);
});
