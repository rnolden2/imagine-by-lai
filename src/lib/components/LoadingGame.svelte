<script lang="ts">
	import { onMount } from 'svelte';
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
	let audio: HTMLAudioElement;

	onMount(() => {
		if (audio) {
			audio.play().catch((error) => {
				// Autoplay was prevented.
				console.error('Audio autoplay failed:', error);
			});
		}
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
			if (audio) {
				audio.pause();
			}
		};
	});

	function handleClick(puppyId: number) {
		puppies = puppies.filter((p) => p.id !== puppyId);
		score++;
	}
</script>

<div class="bg-opacity-90 fixed inset-0 z-[100] bg-blue-200">
	<div class="relative h-full w-full">
		{#each puppies as puppy (puppy.id)}
			<button
				class="absolute h-20 w-20 -translate-x-1/2 -translate-y-1/2 transform transition-transform hover:scale-110"
				style="left: {puppy.x}%; top: {puppy.y}%;"
				on:click={() => handleClick(puppy.id)}
			>
				<img src={puppyPng} alt="Puppy" />
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
	<audio
		bind:this={audio}
		src="https://storage.googleapis.com/api-project-371618.appspot.com/imagine-by-lai/audio/kids-happy-music.mp3"
		loop
	></audio>
</div>
