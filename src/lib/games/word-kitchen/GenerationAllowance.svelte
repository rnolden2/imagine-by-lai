<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { GenerationQuota } from './generation-quota';
	let { quota }: { quota: GenerationQuota } = $props();
	let busy = $state(false);
	let message = $state('');
	let requestKey: string | undefined;
	async function resetAllowance() {
		if (busy) return;
		busy = true;
		message = '';
		requestKey ??= crypto.randomUUID();
		try {
			const response = await fetch('/api/settings/games', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'reset_generation_limit', key: requestKey })
			});
			if (!response.ok) throw new Error('Could not reset the allowance. Please retry.');
			await invalidateAll();
			requestKey = undefined;
			message = 'Daily game allowance reset. You can create another game.';
		} catch (error) {
			message = error instanceof Error ? error.message : 'Connection interrupted. Please retry.';
		} finally {
			busy = false;
		}
	}
</script>

<section aria-label="Daily game generation" class="mb-8 rounded-3xl bg-white p-6 shadow-sm">
	<h2 class="text-xl font-bold">Daily game generation</h2>
	<p class="mt-2">{quota.remaining} of {quota.limit} game starts remaining across all children.</p>
	<p class="mt-2 text-sm text-slate-600">
		Failed and cancelled jobs count. The allowance renews at midnight UTC. Resetting allows more
		paid generation today. Job history and the $5 daily spending cap stay in place.
	</p>
	<button
		class="mt-4 rounded-xl border border-teal-800 px-4 py-2 font-bold text-teal-800 disabled:opacity-50"
		disabled={busy || quota.used === 0}
		onclick={resetAllowance}>{busy ? 'Resetting…' : 'Reset daily game allowance'}</button
	>
	<p aria-live="polite" class="mt-3 text-sm">{message}</p>
</section>
