<script lang="ts">
	import type { Snippet } from 'svelte';
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import type { PageData } from './$types';
	import { theme } from '$lib/stores';
	import { browser } from '$app/environment';

	let { children, data }: { children: Snippet; data: PageData } = $props();

	$effect(() => {
		if (browser) {
			document.documentElement.className = $theme;
		}
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="min-h-screen bg-gray-50">
	<header class="bg-white shadow-sm">
		<nav class="container mx-auto px-4 py-3 flex justify-between items-center">
			<a href="/" class="text-xl font-bold text-primary">Imaginations By Lai</a>
			<div class="flex items-center gap-4">
				<a href="/math" class="text-gray-600 hover:text-primary transition-colors font-semibold">Math</a>
				<a href="/spelling" class="text-gray-600 hover:text-primary transition-colors font-semibold">Spelling</a>
				{#if data.user?.isAdmin}
					<a href="/settings" class="text-gray-600 hover:text-primary transition-colors">Settings</a>
				{:else}
					<a href="/login" class="text-gray-600 hover:text-primary transition-colors">Admin Login</a>
				{/if}
			</div>
		</nav>
	</header>

	<main>
		{@render children?.()}
	</main>
</div>
