<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	let message = $state('');
	let busy = $state(false);
	let refreshing = false;
	const failureMessages: Record<string, string> = {
		AMBIGUOUS_CONCEPT: 'Add a more specific favorite food, then create a new game.',
		RECIPE_BLOCKED: 'This recipe could not be made safely. Try a different favorite food.',
		PREFERENCES_CHANGED:
			'Food preferences changed while this recipe was being made. Review them and create a new game.',
		BUDGET_EXCEEDED: 'The daily generation allowance has been reached. Try again tomorrow.',
		BUDGET_NOT_CONFIGURED: 'Recipe generation is temporarily unavailable. Please try again later.',
		ASSET_SIZE_BUDGET:
			'The generated artwork could not be processed. Try a different favorite food.',
		UNCERTAIN_PROVIDER_RESULT:
			'The service could not safely confirm completion. Check the recipe list before trying again.',
		AI_PROVIDERS_FAILED:
			'The recipe service could not complete this request. Please try again later.',
		AI_GENERATION_TIMEOUT: 'The recipe service took too long to respond. Please try again later.',
		AI_REQUEST_REFUSED: 'Review the favorite food and try a different description.',
		MISSING_ASSET_CONCEPT: 'The recipe needs an ingredient that is not available yet.',
		ASSET_LIMIT: 'This recipe needs too many new pictures. Try a simpler favorite food.',
		PROVIDER_CREDITS_EXHAUSTED:
			'Recipe generation is temporarily unavailable. Please try again later.',
		STALE_LEASE: 'Recipe generation stopped safely. Please create a new game.',
		UNSUPPORTED_FAVORITE: 'Add a more specific favorite food, then create a new game.',
		GENERATION_FAILED: 'The recipe could not be completed. Please try again later.'
	};
	function failureMessage(code: string) {
		return failureMessages[code] ?? 'The recipe could not be completed. Please try again later.';
	}
	const terminal = $derived(
		['failed', 'cancelled', 'published', 'ready_for_preview', 'needs_parent_input'].includes(
			data.job.status
		)
	);
	onMount(() => {
		const timer = setInterval(() => {
			if (terminal || refreshing) return;
			refreshing = true;
			void invalidateAll()
				.catch(() => {
					if (!message) message = 'The latest job status could not be loaded. Retrying…';
				})
				.finally(() => (refreshing = false));
		}, 5000);
		return () => clearInterval(timer);
	});
	async function cancel() {
		busy = true;
		try {
			const r = await fetch('/api/settings/games', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'cancel', jobId: data.job.id }),
				signal: AbortSignal.timeout(15_000)
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
	<a href={resolve('/settings/games/word-kitchen/recipes')} class="font-bold text-teal-800"
		>← Recipe reviews</a
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
				{failureMessage(data.job.error_code)}
			</p>{/if}
		<p class="mt-5 text-slate-600">
			Creating recipes uses the shared daily generation allowance. Cancelling stops work that has
			not already completed.
		</p>
		{#if data.revisionId}<a
				href={resolve('/settings/games/word-kitchen/recipes/[revisionId]/preview', {
					revisionId: String(data.revisionId)
				})}
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
