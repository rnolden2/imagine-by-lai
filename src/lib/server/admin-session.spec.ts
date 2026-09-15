import { expect, it } from 'vitest';
import {
	ADMIN_SESSION_SECONDS,
	createAdminSession,
	passwordsMatch,
	verifyAdminSession
} from './admin-session';
it('rejects forged, modified, expired, and password-rotated admin sessions', () => {
	const now = 1700000000000;
	const token = createAdminSession('test-secret', now);
	expect(verifyAdminSession(token, 'test-secret', now)).toBe(true);
	expect(verifyAdminSession('admin', 'test-secret', now)).toBe(false);
	expect(verifyAdminSession(token + 'x', 'test-secret', now)).toBe(false);
	expect(verifyAdminSession(token, 'other-secret', now)).toBe(false);
	expect(verifyAdminSession(token, 'test-secret', now + ADMIN_SESSION_SECONDS * 1000)).toBe(false);
	expect(verifyAdminSession(undefined, '', now)).toBe(false);
	expect(passwordsMatch('', '')).toBe(false);
	expect(passwordsMatch('secret', 'secret')).toBe(true);
	expect(passwordsMatch('wrong', 'secret')).toBe(false);
});
