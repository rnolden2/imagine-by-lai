import { beforeEach, expect, it, vi } from 'vitest';
import { error } from '@sveltejs/kit';
import { verifyAdminSession } from './admin-session';

const mocks = vi.hoisted(() => ({ password: 'a-long-test-password', limit: vi.fn() }));
vi.mock('#lib/server/secrets', () => ({
	get ADMIN_PASSWORD() {
		return mocks.password;
	}
}));
vi.mock('#lib/server/games/common', () => ({ limit: mocks.limit }));
import { actions } from '../../routes/login/+page.server';

function event(password = mocks.password) {
	const form = new FormData();
	form.set('password', password);
	return {
		request: new Request('https://app.example/login', { method: 'POST', body: form }),
		cookies: { set: vi.fn() }
	} as unknown as Parameters<NonNullable<typeof actions.default>>[0];
}
beforeEach(() => {
	mocks.password = 'a-long-test-password';
	mocks.limit.mockReset().mockResolvedValue(undefined);
});
it('rejects an insecure configuration without issuing a session', async () => {
	mocks.password = '1234';
	const e = event();
	expect(await actions.default!(e)).toMatchObject({ status: 503 });
	expect(e.cookies.set).not.toHaveBeenCalled();
});
it('issues a signed, bounded, HttpOnly, SameSite session only after successful authentication', async () => {
	const e = event();
	await expect(actions.default!(e)).rejects.toMatchObject({ status: 303, location: '/settings' });
	const call = vi.mocked(e.cookies.set).mock.calls[0];
	expect(call[0]).toBe('session');
	expect(verifyAdminSession(call[1], mocks.password)).toBe(true);
	expect(call[2]).toMatchObject({ path: '/', httpOnly: true, sameSite: 'strict', maxAge: 28800 });
	expect(mocks.limit).toHaveBeenCalledWith('app:login', 30, 300);
});
it('rejects incorrect passwords and fails closed when the rate-limit store fails', async () => {
	const e = event('wrong');
	expect(await actions.default!(e)).toMatchObject({ status: 401 });
	mocks.limit.mockRejectedValue(new Error('database failure'));
	expect(await actions.default!(event())).toMatchObject({ status: 503 });
	expect(e.cookies.set).not.toHaveBeenCalled();
});
it('returns a useful rate-limit response without creating a cookie', async () => {
	mocks.limit.mockImplementation(() => error(429, 'limited'));
	const e = event();
	expect(await actions.default!(e)).toMatchObject({ status: 429 });
	expect(e.cookies.set).not.toHaveBeenCalled();
});
