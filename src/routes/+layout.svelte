<script lang="ts">
	import type { Snippet } from 'svelte';
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import type { PageData } from './$types';
	import { theme } from '$lib/stores';
	import { browser } from '$app/environment';
	import { base } from '$app/paths';

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
		<nav class="container mx-auto flex items-center justify-between px-4 py-3">
			<a href="{base}/" class="text-primary text-xl font-bold">Imaginations By Lai</a>
			<div class="flex items-center gap-4">
				<a href="{base}/math" class="hover:text-primary font-semibold text-gray-600 transition-colors"
					>Math</a
				>
				<a href="{base}/spelling" class="hover:text-primary font-semibold text-gray-600 transition-colors"
					>Spelling</a
				>
				<a href="{base}/login" class="hover:text-primary text-gray-600 transition-colors">
					Settings 🔒
				</a>
			</div>
		</nav>
	</header>

	<main>
		{@render children?.()}
	</main>
</div>
