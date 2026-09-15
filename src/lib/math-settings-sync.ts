import { base } from '$app/paths';
import type { MathSettings } from '$lib/types';

const CHANNEL = 'math-settings-saved';
const REFRESH_INTERVAL = 15_000;

export function notifyMathSettingsSaved() {
	if (typeof BroadcastChannel === 'undefined') return;
	const channel = new BroadcastChannel(CHANNEL);
	channel.postMessage('saved');
	channel.close();
}

// Refresh through the app server so database credentials stay on the server.
export function watchMathSettings(
	onSettings: (settings: MathSettings[]) => void,
	onError: (failed: boolean) => void
) {
	let stopped = false;
	let pending: AbortController | null = null;
	let refreshAgain = false;
	async function refresh() {
		if (stopped || document.visibilityState === 'hidden') return;
		if (pending) {
			refreshAgain = true;
			return;
		}
		const controller = new AbortController();
		pending = controller;
		const timeout = setTimeout(() => controller.abort(), 10_000);
		try {
			const response = await fetch(`${base}/api/math/settings`, {
				cache: 'no-store',
				signal: controller.signal
			});
			if (!response.ok) throw new Error('Settings refresh failed');
			const { mathSettings } = await response.json();
			if (!Array.isArray(mathSettings)) throw new Error('Invalid settings response');
			if (!stopped) {
				onSettings(mathSettings);
				onError(false);
			}
		} catch {
			if (!stopped) onError(true);
		} finally {
			clearTimeout(timeout);
			pending = null;
			// A save may have happened while an older read was in flight.
			if (refreshAgain) {
				refreshAgain = false;
				void refresh();
			}
		}
	}

	const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;
	if (channel) channel.onmessage = () => void refresh();
	window.addEventListener('focus', refresh);
	document.addEventListener('visibilitychange', refresh);
	const interval = setInterval(refresh, REFRESH_INTERVAL);
	void refresh();
	return () => {
		stopped = true;
		pending?.abort();
		clearInterval(interval);
		channel?.close();
		window.removeEventListener('focus', refresh);
		document.removeEventListener('visibilitychange', refresh);
	};
}
