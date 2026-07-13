/**
 * Client-side TTS utility backed by Google Cloud Text-to-Speech.
 * Falls back to the browser's built-in SpeechSynthesis if the API call fails.
 */

let currentAudio: HTMLAudioElement | null = null;

/**
 * Speak `text` using Google Cloud TTS.
 * @param text  The text to speak.
 * @param slow  If true, uses a slower speaking rate (good for spelling words).
 */
export async function speak(text: string, slow = false): Promise<void> {
	// Stop any audio that is already playing
	if (currentAudio) {
		currentAudio.pause();
		URL.revokeObjectURL(currentAudio.src);
		currentAudio = null;
	}

	try {
		const res = await fetch('/api/tts', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ text, slow })
		});

		if (!res.ok) throw new Error(`TTS API returned ${res.status}`);

		const blob = await res.blob();
		const url = URL.createObjectURL(blob);
		const audio = new Audio(url);
		currentAudio = audio;

		await new Promise<void>((resolve) => {
			audio.onended = () => {
				URL.revokeObjectURL(url);
				if (currentAudio === audio) currentAudio = null;
				resolve();
			};
			audio.onerror = () => {
				URL.revokeObjectURL(url);
				if (currentAudio === audio) currentAudio = null;
				resolve();
			};
			audio.play().catch(() => resolve());
		});
	} catch (err) {
		console.warn('Google TTS failed, falling back to browser speech:', err);
		browserSpeak(text, slow);
	}
}

/** Stop any currently-playing TTS audio. */
export function stopSpeaking(): void {
	if (currentAudio) {
		currentAudio.pause();
		URL.revokeObjectURL(currentAudio.src);
		currentAudio = null;
	}
	if (typeof window !== 'undefined') {
		window.speechSynthesis?.cancel();
	}
}

function browserSpeak(text: string, slow: boolean): void {
	if (typeof window === 'undefined') return;
	const synth = window.speechSynthesis;
	if (synth.speaking) synth.cancel();
	const utt = new SpeechSynthesisUtterance(text);
	utt.rate = slow ? 0.75 : 0.85;
	utt.pitch = 1.1;
	synth.speak(utt);
}
