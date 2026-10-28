import { error, type RequestEvent } from '@sveltejs/kit';
import type { z } from 'zod';

export function requireOrigin(event: Pick<RequestEvent, 'request' | 'url'>) {
	if (event.request.headers.get('origin') !== event.url.origin)
		error(403, 'Same-origin request required.');
}

/** Enforce the limit while reading, including bodies without Content-Length. */
export async function readBody<T>(
	event: Pick<RequestEvent, 'request'>,
	schema: z.ZodType<T>,
	maxBytes = 65536
): Promise<T> {
	const request = event.request;
	if (
		request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
	)
		error(415, 'JSON content required.');
	if (Number(request.headers.get('content-length') ?? 0) > maxBytes)
		error(413, 'Request is too large.');
	if (!request.body) error(400, 'Invalid request.');
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > maxBytes) {
				void reader.cancel().catch(() => {});
				error(413, 'Request is too large.');
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	try {
		const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
		return schema.parse(JSON.parse(text));
	} catch {
		error(400, 'Invalid request.');
	}
}
