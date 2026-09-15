import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const ADMIN_SESSION_SECONDS = 8 * 60 * 60;
function sign(value: string, secret: string) {
	return createHmac('sha256', secret).update(`admin-session:${value}`).digest('base64url');
}
export function passwordsMatch(value: unknown, password: string): boolean {
	if (typeof value !== 'string' || !password) return false;
	const hash = (input: string) =>
		createHmac('sha256', 'password-comparison').update(input).digest();
	return timingSafeEqual(hash(value), hash(password));
}
export function createAdminSession(secret: string, now = Date.now()): string {
	if (!secret) throw new Error('Admin authentication is not configured.');
	const payload = `${Math.floor(now / 1000) + ADMIN_SESSION_SECONDS}.${randomBytes(24).toString('base64url')}`;
	return `${payload}.${sign(payload, secret)}`;
}
export function verifyAdminSession(
	token: string | undefined,
	secret: string,
	now = Date.now()
): boolean {
	if (!token || !secret || token.length > 200) return false;
	const parts = token.split('.');
	if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || !/^[\w-]{32}$/.test(parts[1])) return false;
	const expires = Number(parts[0]);
	const seconds = Math.floor(now / 1000);
	if (
		!Number.isSafeInteger(expires) ||
		expires <= seconds ||
		expires > seconds + ADMIN_SESSION_SECONDS
	)
		return false;
	const expected = Buffer.from(sign(`${parts[0]}.${parts[1]}`, secret));
	const actual = Buffer.from(parts[2]);
	return actual.length === expected.length && timingSafeEqual(actual, expected);
}
