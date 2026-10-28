import { expect, it } from 'vitest';
import { z } from 'zod';
import { readBody, requireOrigin } from './request';

const schema = z.object({ text: z.string().min(1) });
function event(body: string, headers: Record<string, string> = {}) {
	return {
		url: new URL('https://app.example/api'),
		request: new Request('https://app.example/api', {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...headers },
			body
		})
	};
}
it('rejects missing and foreign origins and allows the exact origin', () => {
	for (const origin of ['', 'null', 'https://evil.example', 'http://app.example'])
		expect(() => requireOrigin(event('{}', { origin }))).toThrow();
	expect(() => requireOrigin(event('{}', { origin: 'https://app.example' }))).not.toThrow();
});
it('validates content type, JSON syntax and schema', async () => {
	expect(await readBody(event('{"text":"hello"}'), schema)).toEqual({ text: 'hello' });
	await expect(
		readBody(event('{}', { 'content-type': 'text/plain' }), schema)
	).rejects.toMatchObject({ status: 415 });
	for (const body of ['{', '{"text":4}', 'null', '[]', '{"text":""}'])
		await expect(readBody(event(body), schema)).rejects.toMatchObject({ status: 400 });
});
it('counts UTF-8 bytes without relying on Content-Length', async () => {
	await expect(readBody(event('{"text":"éééé"}'), schema, 16)).rejects.toMatchObject({
		status: 413
	});
	await expect(
		readBody(event('{}', { 'content-length': '100' }), schema, 16)
	).rejects.toMatchObject({ status: 413 });
});
it('cancels oversized chunked input before reading the remainder', async () => {
	let cancelled = false;
	const stream = new ReadableStream<Uint8Array>({
		pull(controller) {
			controller.enqueue(new Uint8Array(32));
		},
		cancel() {
			cancelled = true;
		}
	});
	const request = new Request('https://app.example', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: stream,
		duplex: 'half'
	} as RequestInit);
	await expect(readBody({ request }, schema, 16)).rejects.toMatchObject({ status: 413 });
	expect(cancelled).toBe(true);
});
