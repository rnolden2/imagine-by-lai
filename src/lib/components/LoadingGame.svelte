<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import puppyPng from '$lib/assets/puppy.png';

	type Puppy = {
		id: number;
		x: number;
		y: number;
	};

	let puppies: Puppy[] = [];
	let score = 0;
	let gameInterval: NodeJS.Timeout;
	let spawnRate = 1000; // Start by spawning one per second

	onMount(() => {
		// Function to add a new puppy
		const addPuppy = () => {
			const newPuppy: Puppy = {
				id: Date.now(),
				x: Math.random() * 90, // % of width
				y: Math.random() * 90 // % of height
			};
			puppies = [...puppies, newPuppy];
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
		setTimeout(() => {
			clearInterval(speedUpInterval);
		}, 30000);

		return () => {
			clearInterval(gameInterval);
			clearInterval(speedUpInterval);
		};
	});

	function handleClick(puppyId: number) {
		puppies = puppies.filter((p) => p.id !== puppyId);
		score++;
	}
</script>

<div class="fixed inset-0 bg-blue-200 bg-opacity-90 z-50">
	<div class="relative w-full h-full">
		{#each puppies as puppy (puppy.id)}
			<button
				class="absolute w-20 h-20 transform -translate-x-1/2 -translate-y-1/2 transition-transform hover:scale-110"
				style="left: {puppy.x}%; top: {puppy.y}%;"
				on:click={() => handleClick(puppy.id)}
			>
				<img src={puppyPng} alt="Puppy" />
			</button>
		{/each}
	</div>
	<div class="absolute bottom-5 right-5 text-2xl font-bold text-white bg-black bg-opacity-50 p-4 rounded-lg">
		Score: {score}
	</div>
	<div class="absolute top-5 left-1/2 -translate-x-1/2 text-2xl font-bold text-white">
		Generating your story...
	</div>
</div>
