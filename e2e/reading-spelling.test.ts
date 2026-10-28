import { expect, test, type Page } from '@playwright/test';

async function login(page: Page) {
	await page.goto('/login');
	await page.getByLabel('Password', { exact: true }).fill('math-browser-test-password');
	await page.getByRole('button', { name: 'Login', exact: true }).click();
	await expect(page).toHaveURL(/\/settings$/);
}

test.beforeEach(async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.route('**/api/tts', (route) =>
		route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"fixture"}' })
	);
});

test('spelling supports keyboard practice, announced feedback, reduced motion, and mobile layout', async ({
	page
}) => {
	await login(page);
	await page.goto('/spelling');
	const child = page.getByRole('button', { name: 'Alex', exact: true });
	await child.focus();
	await page.keyboard.press('Enter');
	await expect(child).toHaveAttribute('aria-pressed', 'true');

	const answer = page.getByLabel('Spell the word you hear', { exact: true });
	await expect(answer).toBeFocused();
	for (let attempt = 0; attempt < 2; attempt++) {
		await answer.fill('definitely wrong');
		await page.keyboard.press('Enter');
		await expect(page.getByText('Not quite — try again!', { exact: true })).toBeVisible();
		await expect(answer).toBeEnabled({ timeout: 3000 });
		await expect(answer).toBeFocused();
	}

	const saved = page.waitForRequest(
		(request) => request.method() === 'POST' && request.url().endsWith('/api/spelling')
	);
	await answer.fill('definitely wrong');
	await page.keyboard.press('Enter');
	await expect(page.getByText('The word was:', { exact: true })).toBeVisible();
	expect((await saved).postDataJSON()).toMatchObject({
		userId: 1,
		attemptsUsed: 3,
		givenAnswer: 'definitely wrong',
		isCorrect: false
	});
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
});

test('story reading tools provide keyboard controls and an accessible definition alternative', async ({
	page
}) => {
	await page.route('**/api/define?*', async (route) => {
		const word = new URL(route.request().url()).searchParams.get('word');
		expect(word).toBe('friend');
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ phonetic: '/frend/', definition: 'A person who cares about you.' })
		});
	});
	await login(page);
	await page.goto('/story/1');

	const guide = page.locator('.reading-guide-line');
	await page.getByRole('button', { name: 'Guide down', exact: true }).focus();
	await page.keyboard.press('Enter');
	await expect(guide).toBeVisible();
	const firstTop = await guide.evaluate((element) =>
		Number.parseFloat((element as HTMLElement).style.top)
	);
	await page.getByRole('button', { name: 'Guide up', exact: true }).focus();
	await page.keyboard.press('Enter');
	await expect
		.poll(() => guide.evaluate((element) => Number.parseFloat((element as HTMLElement).style.top)))
		.toBeLessThan(firstTop);
	await page.getByRole('button', { name: 'Hide guide', exact: true }).click();
	await expect(guide).toHaveCount(0);

	const lookup = page.getByLabel('Look up a word from this story', { exact: true });
	await lookup.fill('friend');
	await page.getByRole('button', { name: 'Define word', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'friend' });
	await expect(dialog).toContainText('/frend/');
	await expect(dialog).toContainText('A person who cares about you.');
	await dialog.getByRole('button', { name: 'Close word definition' }).focus();
	await page.keyboard.press('Enter');
	await expect(dialog).toHaveCount(0);
	await expect(lookup).toBeFocused();

	await lookup.fill('123');
	await page.getByRole('button', { name: 'Define word', exact: true }).click();
	await expect(page.getByRole('alert')).toContainText('using letters');
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
});

test('a late definition response cannot replace a newer lookup', async ({ page }) => {
	await page.route('**/api/define?*', async (route) => {
		const word = new URL(route.request().url()).searchParams.get('word');
		if (word === 'first') await new Promise((resolve) => setTimeout(resolve, 300));
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ phonetic: `/${word}/`, definition: `${word} definition` })
		});
	});
	await login(page);
	await page.goto('/story/1');

	const lookup = page.getByLabel('Look up a word from this story', { exact: true });
	await lookup.fill('first');
	await page.getByRole('button', { name: 'Define word', exact: true }).click();
	await lookup.fill('second');
	await page.getByRole('button', { name: 'Define word', exact: true }).click();

	const dialog = page.getByRole('dialog', { name: 'second' });
	await expect(dialog).toContainText('second definition');
	await page.waitForTimeout(400);
	await expect(dialog).toContainText('second definition');
	await expect(dialog).not.toContainText('first definition');
});

test('failed cloud audio playback releases resources and uses browser speech', async ({ page }) => {
	await page.unroute('**/api/tts');
	await page.route('**/api/tts', (route) =>
		route.fulfill({ status: 200, contentType: 'audio/mpeg', body: 'fixture audio' })
	);
	await page.addInitScript(() => {
		const revoked: string[] = [];
		const spoken: string[] = [];
		Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:fixture-audio' });
		Object.defineProperty(URL, 'revokeObjectURL', {
			value: (url: string) => revoked.push(url)
		});
		class RejectingAudio {
			src: string;
			onended: (() => void) | null = null;
			onerror: (() => void) | null = null;
			constructor(src: string) {
				this.src = src;
			}
			pause() {}
			play() {
				return Promise.reject(new Error('Playback blocked'));
			}
		}
		Object.defineProperty(window, 'Audio', { value: RejectingAudio });
		Object.defineProperty(window, 'speechSynthesis', {
			value: {
				speaking: false,
				cancel() {},
				speak(utterance: SpeechSynthesisUtterance) {
					spoken.push(utterance.text);
				}
			}
		});
		Object.assign(window, { __speechTest: { revoked, spoken } });
	});
	await login(page);
	await page.goto('/spelling');
	await page.getByRole('button', { name: 'Alex', exact: true }).click();

	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(
						window as typeof window & {
							__speechTest: { revoked: string[]; spoken: string[] };
						}
					).__speechTest
			)
		)
		.toEqual({ revoked: ['blob:fixture-audio'], spoken: [expect.any(String)] });
});
