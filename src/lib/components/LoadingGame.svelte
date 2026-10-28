<script lang="ts">
	import { onMount } from 'svelte';

	type Puppy = {
		id: number;
		x: number;
		y: number;
	};

	let puppies: Puppy[] = [];
	let score = 0;
	let visible = true;
	let gameInterval: ReturnType<typeof setInterval>;
	let spawnRate = 1000; // Start by spawning one per second
	const MAX_PUPPIES = 12;

	onMount(() => {
		// Function to add a new puppy
		const addPuppy = () => {
			const newPuppy: Puppy = {
				id: Date.now(),
				x: Math.random() * 90, // % of width
				y: Math.random() * 90 // % of height
			};
			puppies = [...puppies, newPuppy].slice(-MAX_PUPPIES);
		};

		// Start the game loop
		gameInterval = setInterval(addPuppy, spawnRate);

		// Gradually increase speed for the first 30 seconds
		const speedUpInterval = setInterval(() => {
			if (spawnRate > 300) {
				spawnRate -= 50;
				clearInterval(gameInterval);
				gameInterval = setInterval(addPuppy, spawnRate);
			}
		}, 1000);

		// Stop speeding up after 30 seconds
		const stopSpeedUpTimer = setTimeout(() => {
			clearInterval(speedUpInterval);
		}, 30000);

		return () => {
			clearInterval(gameInterval);
			clearInterval(speedUpInterval);
			clearTimeout(stopSpeedUpTimer);
		};
	});

	function handleClick(puppyId: number) {
		puppies = puppies.filter((p) => p.id !== puppyId);
		score++;
	}
</script>

{#if visible}
	<div class="bg-opacity-90 fixed inset-0 z-[100] bg-blue-200">
		<p class="sr-only" role="status">Story generation is continuing.</p>
		<div class="relative h-full w-full">
			{#each puppies as puppy (puppy.id)}
				<button
					class="absolute flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 transform items-center justify-center rounded-full bg-white/70 text-5xl shadow transition-transform hover:scale-110"
					style="left: {puppy.x}%; top: {puppy.y}%;"
					on:click={() => handleClick(puppy.id)}
					aria-label="Catch puppy"
				>
					<span aria-hidden="true">🐶</span>
				</button>
			{/each}
		</div>
		<div
			class="bg-opacity-50 absolute right-5 bottom-5 rounded-lg bg-black p-4 text-2xl font-bold text-white"
		>
			Score: {score}
		</div>
		<div class="absolute top-5 left-1/2 -translate-x-1/2 text-2xl font-bold text-white">
			Generating your story...
		</div>
		<button
			type="button"
			class="absolute top-5 right-5 rounded-xl bg-slate-900 px-4 py-3 font-bold text-white shadow"
			on:click={() => (visible = false)}
		>
			View progress
		</button>
	</div>
{/if}
