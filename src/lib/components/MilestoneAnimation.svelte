<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, scale } from 'svelte/transition';

	export let count: number;
	export let onDismiss: () => void;

	onMount(() => {
		const t = setTimeout(onDismiss, 2500);
		return () => clearTimeout(t);
	});

	const starPositions = [
		{ x: 15, y: 20, size: 28, delay: 0, color: '#fbbf24' },
		{ x: 75, y: 15, size: 22, delay: 80, color: '#f472b6' },
		{ x: 85, y: 60, size: 30, delay: 150, color: '#34d399' },
		{ x: 10, y: 65, size: 24, delay: 60, color: '#60a5fa' },
		{ x: 50, y: 10, size: 20, delay: 200, color: '#a78bfa' },
		{ x: 40, y: 85, size: 26, delay: 100, color: '#fb923c' },
		{ x: 80, y: 85, size: 18, delay: 180, color: '#f87171' },
		{ x: 20, y: 85, size: 22, delay: 120, color: '#4ade80' }
	];
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
	transition:fade={{ duration: 300 }}
	class="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-primary/95 cursor-pointer"
	on:click={onDismiss}
>
	{#each starPositions as star}
		<div
			class="absolute star-burst"
			style="left:{star.x}%; top:{star.y}%; animation-delay:{star.delay}ms;"
		>
			<svg
				width={star.size}
				height={star.size}
				viewBox="0 0 24 24"
				fill={star.color}
			>
				<polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
			</svg>
		</div>
	{/each}

	<div in:scale={{ duration: 500, start: 0.3 }} class="flex flex-col items-center gap-4">
		<p class="text-white/80 text-2xl font-bold tracking-wide">Amazing!</p>
		<div class="text-white font-black text-9xl leading-none drop-shadow-lg pop-in">
			{count}
		</div>
		<p class="text-white font-bold text-3xl">correct in a row!</p>
		<p class="text-white/70 text-lg mt-4">Tap anywhere to keep going</p>
	</div>
</div>

<style>
	@keyframes star-burst {
		0% { transform: scale(0) rotate(0deg); opacity: 0; }
		30% { opacity: 1; }
		100% { transform: scale(1.4) rotate(180deg); opacity: 0; }
	}

	@keyframes pop-in {
		0% { transform: scale(0.5); }
		60% { transform: scale(1.15); }
		100% { transform: scale(1); }
	}

	.star-burst {
		animation: star-burst 2s ease-out forwards;
	}

	.pop-in {
		animation: pop-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
	}
</style>
