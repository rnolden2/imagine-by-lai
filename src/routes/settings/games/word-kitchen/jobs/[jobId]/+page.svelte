<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	let message = $state('');
	let busy = $state(false);
	const terminal = $derived(
		['failed', 'cancelled', 'published', 'ready_for_preview', 'needs_parent_input'].includes(
			data.job.status
		)
	);
	onMount(() => {
		const timer = setInterval(() => {
			if (!terminal) void invalidateAll();
		}, 5000);
		return () => clearInterval(timer);
	});
	async function cancel() {
		busy = true;
		try {
			const r = await fetch('/api/settings/games', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'cancel', jobId: data.job.id })
			});
			if (!r.ok) throw new Error('Could not cancel yet. Please retry.');
			await invalidateAll();
		} catch (e) {
			message = e instanceof Error ? e.message : 'Could not connect.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Making a recipe · Parent kitchen</title></svelte:head>
<section class="mx-auto max-w-3xl px-6 py-12">
	<a href="/settings/games/word-kitchen/recipes" class="font-bold text-teal-800">← Recipe reviews</a
	>
	<h1 class="my-6 text-4xl font-extrabold">{data.job.input.favoriteName}</h1>
	<div class="rounded-3xl bg-white p-8 shadow-sm">
		<p class="text-sm font-bold tracking-widest text-teal-700">
			{data.job.status.replaceAll('_', ' ').toUpperCase()}
		</p>
		<h2 class="my-4 text-2xl font-bold">
			{data.job.status === 'ready_for_preview'
				? 'Your recipe is ready for a look.'
				: data.job.status === 'failed'
					? 'This recipe could not be completed.'
					: data.job.status === 'needs_parent_input'
						? 'This favorite needs a little more detail.'
						: data.job.status === 'cancelled'
							? 'Generation cancelled.'
							: 'Putting the ingredients together.'}
		</h2>
		<p aria-live="polite">
			Current step: {data.job.stage.replaceAll('_', ' ')}{data.job.checkpoint.assetIndex != null
				? ` · ${data.job.checkpoint.assetIndex} assets resolved`
				: ''}
		</p>
		{#if data.job.status === 'needs_parent_input'}<p class="mt-4">
				{data.job.checkpoint.plan?.reason ||
					'Check the favorite name and food preferences, then start a new game from the parent kitchen.'}
			</p>{/if}{#if data.job.error_code}<p class="mt-4 text-sm">
				Status detail: {data.job.error_code.replaceAll('_', ' ').toLowerCase()}
			</p>{/if}
		<p class="mt-5 text-slate-600">
			Reserved generation allowance: ${Number(data.job.estimated_cost).toFixed(2)}. This is an
			estimate, not a provider invoice. Completed provider work may still be billed after
			cancellation.
		</p>
		{#if data.revisionId}<a
				href={`/settings/games/word-kitchen/recipes/${data.revisionId}/preview`}
				class="mt-6 inline-block rounded-xl bg-teal-800 px-6 py-3 font-bold text-white"
				>Review recipe →</a
			>{/if}{#if !terminal}<p class="mt-4">
				You can leave this page. Generation continues in the background.
			</p>
			<button class="mt-6 rounded-xl border px-5 py-3" disabled={busy} onclick={cancel}
				>Cancel generation</button
			>{/if}
		<p role="alert" class="mt-4 text-red-700">{message}</p>
	</div>
</section>
