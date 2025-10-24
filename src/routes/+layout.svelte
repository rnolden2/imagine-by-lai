<script lang="ts">
	import type { Snippet } from 'svelte';
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import type { PageData } from './$types';
	import { theme } from '$lib/stores';
	import { browser } from '$app/environment';

	let { children, data } = $props<{ children: Snippet; data: PageData }>();

	$effect(() => {
		if (browser) {
			document.documentElement.className = $theme;
		}
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="min-h-screen bg-gray-50">
	<header class="bg-white shadow-sm">
		<nav class="container mx-auto px-4 py-3 flex justify-between items-center">
			<a href="/" class="text-xl font-bold text-indigo-600">Imaginations By Lai</a>
			<div>
				{#if data.user?.isAdmin}
					<a href="/settings" class="text-gray-600 hover:text-indigo-600">Settings</a>
				{:else}
					<a href="/login" class="text-gray-600 hover:text-indigo-600">Admin Login</a>
				{/if}
			</div>
		</nav>
	</header>

	<main>
		{@render children?.()}
	</main>
</div>
