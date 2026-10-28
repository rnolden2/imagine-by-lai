import { json } from '@sveltejs/kit';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { access } from '#lib/server/games/authorization';
import { limit } from '#lib/server/games/common';
import { readBody, requireOrigin } from '#lib/server/request';
import { z } from 'zod';
import type { RequestHandler } from './$types';

let ttsClient: TextToSpeechClient | null = null;

function getClient(): TextToSpeechClient {
	if (!ttsClient) {
		ttsClient = new TextToSpeechClient();
	}
	return ttsClient;
}

export const POST: RequestHandler = async (event) => {
	requireOrigin(event);
	const scope = await access(event);
	const { text, slow } = await readBody(
		event,
		z.object({
			text: z
				.string()
				.trim()
				.min(1)
				.max(1000)
				.refine((value) => Buffer.byteLength(value, 'utf8') <= 4000),
			slow: z.boolean().default(false)
		}),
		8192
	);
	await limit(`app:speech:${scope.deviceId ?? 'parent'}`, 60, 60);
	await limit('app:speech:day', 2000, 86400);

	try {
		const client = getClient();
		// Await lazy gRPC/auth setup inside this error boundary. Calling the RPC
		// directly can leave a rejected initialization promise outside the handler.
		await client.initialize();

		const [response] = await client.synthesizeSpeech(
			{
				input: { text },
				voice: {
					languageCode: 'en-US',
					// en-US-Neural2-H is a warm, friendly female voice — great for kids
					name: 'en-US-Neural2-H'
				},
				audioConfig: {
					audioEncoding: 'MP3',
					speakingRate: slow ? 0.75 : 0.9,
					pitch: 1.0
				}
			},
			{ timeout: 15000, retry: null }
		);

		if (!response.audioContent?.length) throw new Error('No speech audio returned.');
		const audioContent = Buffer.from(response.audioContent as Uint8Array);

		return new Response(audioContent, {
			headers: {
				'Content-Type': 'audio/mpeg',
				'Cache-Control': 'private, no-store'
			}
		});
	} catch {
		// A failed lazy client can retain a rejected stub; allow the next request to
		// construct a clean client after credentials or the dependency recover.
		ttsClient = null;
		console.error('speech.failed', { requestId: event.locals.requestId });
		return json({ error: 'Speech is temporarily unavailable.' }, { status: 503 });
	}
};
