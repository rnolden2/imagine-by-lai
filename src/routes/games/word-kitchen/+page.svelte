<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	let childId = $state(0);
	let duration = $state<5 | 8 | 10>(8);
	let busy = $state(false);
	let message = $state('');
	let startKey = $state('');
	let selection = $state('');
	const selected = $derived(childId || Number(data.children[0]?.id));
	const cards = $derived(data.cards.filter((c) => c.childId === selected));
	async function start(revisionId: string) {
		if (busy) return;
		busy = true;
		message = '';
		const next = `${selected}:${revisionId}:${duration}`;
		if (selection !== next) {
			selection = next;
			startKey = crypto.randomUUID();
		}
		try {
			const r = await fetch('/api/games/word-kitchen/start', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ childId: selected, revisionId, duration, key: startKey })
			});
			const b = await r.json();
			if (!r.ok) throw new Error(b.message ?? 'Could not start. Please try again.');
			await goto(`/games/word-kitchen/session/${b.id}`);
		} catch (e) {
			message = e instanceof Error ? e.message : 'Connection interrupted. Try again.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Word Kitchen · Choose a recipe</title></svelte:head>
<section class="mx-auto max-w-6xl px-5 py-10">
	<a href="/games" class="font-bold text-teal-800">← Games</a>
	<p class="mt-8 font-bold tracking-widest text-amber-700">WELCOME, LITTLE CHEF</p>
	<h1 class="mt-2 text-5xl font-extrabold text-teal-950">What’s cooking today?</h1>
	<p class="my-5 text-lg text-slate-600">
		Pick a dish. Bring your words. We’ll make something wonderful.
	</p>
	<div class="my-8 flex flex-wrap gap-6">
		<label class="font-bold"
			>Chef <select class="ml-3 rounded-xl" bind:value={childId}
				><option value={0}>Choose a chef</option>{#each data.children as child}<option
						value={Number(child.id)}>{child.name}</option
					>{/each}</select
			></label
		><label class="font-bold"
			>Play time <select class="ml-3 rounded-xl" bind:value={duration}
				><option value={5}>About 5 minutes</option><option value={8}>About 8 minutes</option><option
					value={10}>About 10 minutes</option
				></select
			></label
		>
	</div>
	{#each data.active.filter((s) => s.childId === selected) as session}<a
			class="mb-4 block rounded-2xl bg-teal-100 p-4 font-bold text-teal-900"
			href={`/games/word-kitchen/session/${session.id}`}>Continue {session.title} →</a
		>{/each}
	<p role="alert" class="text-red-700">{message}</p>
	<div class="grid gap-6 md:grid-cols-3">
		{#each cards as card}<article
				class="overflow-hidden rounded-3xl border border-amber-100 bg-white shadow-sm"
			>
				<div class="flex h-56 items-center justify-center bg-amber-50">
					{#if card.hero}<img
							src={card.hero}
							alt={card.title}
							class="h-52 w-52 object-contain"
							width="208"
							height="208"
						/>{/if}
				</div>
				<div class="p-6">
					<p class="text-sm font-bold text-teal-700">
						{card.origin === 'curated' ? 'KITCHEN FAVORITE' : 'MADE FOR YOU'}
					</p>
					<h2 class="my-2 text-2xl font-extrabold">{card.title}</h2>
					<p class="min-h-24 text-slate-600">{card.description}</p>
					<button
						disabled={busy || !card.durations.includes(duration)}
						onclick={() => start(card.revisionId)}
						class="mt-5 w-full rounded-2xl bg-teal-800 p-4 font-bold text-white disabled:opacity-50"
						>{busy ? 'Getting ready…' : 'Let’s make it →'}</button
					>
				</div>
			</article>{:else}<p class="rounded-2xl bg-white p-8">
				No recipes available for this chef’s preferences yet. Ask a parent to set up the kitchen.
			</p>{/each}
	</div>
	<p class="mt-6 text-sm text-slate-500">{cards[0]?.notice ?? ''} This is a pretend kitchen.</p>
	{#if data.parent}<a class="mt-5 inline-block font-bold text-teal-800" href="/settings/games"
			>Parent kitchen controls →</a
		>{/if}
</section>
