import { json } from '@sveltejs/kit';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';

let ttsClient: TextToSpeechClient | null = null;

function getClient(): TextToSpeechClient {
	if (!ttsClient) {
		ttsClient = new TextToSpeechClient();
	}
	return ttsClient;
}

export async function POST({ request }) {
	const { text, slow = false } = await request.json();

	if (!text || typeof text !== 'string') {
		return json({ error: 'Missing text' }, { status: 400 });
	}

	try {
		const client = getClient();

		const [response] = await client.synthesizeSpeech({
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
		});

		const audioContent = Buffer.from(response.audioContent as Uint8Array);

		return new Response(audioContent, {
			headers: {
				'Content-Type': 'audio/mpeg',
				'Cache-Control': 'public, max-age=3600'
			}
		});
	} catch (err) {
		console.error('Google TTS error:', err);
		return json({ error: 'TTS failed' }, { status: 500 });
	}
}
