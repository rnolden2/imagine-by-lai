<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Games · Imaginations By Lai</title></svelte:head>
<section class="mx-auto max-w-5xl px-6 py-14">
	<p class="font-bold tracking-widest text-teal-700">PLAY. PRACTICE. IMAGINE.</p>
	<h1 class="my-4 text-5xl font-extrabold text-slate-800">A little play goes a long way.</h1>
	<p class="mb-10 text-xl text-slate-600">
		Small adventures. Big discoveries. Made for your growing mind.
	</p>
	<div class="grid gap-6 md:grid-cols-2">
		<a
			href={resolve('/games/space-math')}
			class="block rounded-3xl bg-indigo-950 p-8 text-white shadow-sm transition hover:-translate-y-1"
		>
			<span class="text-5xl" aria-hidden="true">🚀</span>
			<h2 class="mt-5 text-3xl font-extrabold">Space Math</h2>
			<p class="my-3 text-lg text-indigo-100">
				A little math fuels a whole new adventure. Explore the planets at your own pace.
			</p>
			<span class="font-bold text-cyan-200">Let’s explore →</span>
		</a>
		{#if data.gameAvailability.kitchen}<a
				href={resolve('/games/word-kitchen')}
				class="block max-w-xl rounded-3xl bg-amber-100 p-8 shadow-sm transition hover:-translate-y-1"
				><span class="text-5xl" aria-hidden="true">🥣</span>
				<h2 class="mt-5 text-3xl font-extrabold text-teal-900">Word Kitchen</h2>
				<p class="my-3 text-lg text-slate-700">
					A pinch of spelling, a spoonful of imagination. What will you make today?
				</p>
				<span class="font-bold text-teal-900">Let’s cook →</span></a
			>{/if}
	</div>
</section>
