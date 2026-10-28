<script lang="ts">
	import { onMount } from 'svelte';
	import {
		pendingPracticeCount,
		practiceHistoryChanged,
		retryPracticeHistory
	} from '#lib/practice-history';
	let count = $state(0);
	let retrying = $state(false);
	async function retry() {
		if (retrying) return;
		retrying = true;
		try {
			await retryPracticeHistory();
		} finally {
			retrying = false;
		}
	}
	onMount(() => {
		const update = () => {
			count = pendingPracticeCount();
		};
		const online = () => {
			void retry();
		};
		update();
		void retry();
		window.addEventListener(practiceHistoryChanged, update);
		window.addEventListener('storage', update);
		window.addEventListener('online', online);
		return () => {
			window.removeEventListener(practiceHistoryChanged, update);
			window.removeEventListener('storage', update);
			window.removeEventListener('online', online);
		};
	});
</script>

{#if count > 0}
	<aside class="border-b border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm text-amber-950">
		<p role="status">
			{count} practice {count === 1 ? 'answer is' : 'answers are'} waiting to save. Reconnect within
			24 hours. Keep this tab open if browser storage is unavailable.
		</p>
		<button
			class="mt-2 rounded-lg border border-amber-800 px-3 py-1 font-semibold"
			disabled={retrying}
			onclick={retry}>{retrying ? 'Saving…' : 'Retry saving'}</button
		>
	</aside>
{/if}
