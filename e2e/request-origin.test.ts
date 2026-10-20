import { expect, test } from '@playwright/test';

const hosts = [
	'imagine-by-lai-xaoktxu34q-uc.a.run.app',
	'imagine-by-lai-247644706560.us-central1.run.app'
];

for (const host of hosts) {
	const headers = {
		Host: host,
		Origin: `https://${host}`,
		'X-Forwarded-Proto': 'https',
		Accept: 'text/html'
	};
	test(`login and math writes work through Cloud Run host ${host}`, async ({ request }) => {
		const login = await request.post('/login', {
			headers,
			form: { password: 'math-browser-test-password' },
			maxRedirects: 0
		});
		expect(login.status()).toBe(303);
		expect(login.headers().location).toBe('/settings');
		const cookie = login.headers()['set-cookie'];
		expect(cookie).toContain('HttpOnly');
		expect(cookie).toContain('Secure');
		const settings = await request.get('/settings', {
			headers: { ...headers, Cookie: cookie.split(';')[0] },
			maxRedirects: 0
		});
		expect(settings.status()).toBe(200);
		const answer = await request.post('/api/math', {
			headers,
			data: {
				childId: 1,
				sessionId: crypto.randomUUID(),
				operation: 'addition',
				problemState: { num1: 2, num2: 3 },
				givenAnswer: '5'
			}
		});
		expect(answer.status()).toBe(200);
		expect(await answer.json()).toEqual({ success: true });
	});

	test(`cross-site login and math requests stay blocked on ${host}`, async ({ request }) => {
		const crossSite = { ...headers, Origin: 'https://untrusted.example' };
		const login = await request.post('/login', {
			headers: crossSite,
			form: { password: 'math-browser-test-password' },
			maxRedirects: 0
		});
		expect(login.status()).toBe(403);
		const answer = await request.post('/api/math', { headers: crossSite, data: {} });
		expect(answer.status()).toBe(403);
	});
}
