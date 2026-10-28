<script lang="ts">
	import type { Snippet } from 'svelte';
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import type { PageData } from './$types';
	import { theme } from '#lib/stores';
	import { browser } from '$app/env';
	import { resolve } from '$app/paths';
	import PracticeSaveStatus from '#lib/components/PracticeSaveStatus.svelte';

	let { children, data }: { children: Snippet; data: PageData } = $props();

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
		<nav
			aria-label="Primary navigation"
			class="container mx-auto flex flex-wrap items-center justify-between gap-3 px-4 py-3"
		>
			<a href={resolve('/')} class="text-primary text-xl font-bold">Imaginations By Lai</a>
			<div class="flex flex-wrap items-center gap-4">
				<a
					href={resolve('/math')}
					class="hover:text-primary font-semibold text-gray-600 transition-colors">Math</a
				>
				<a
					href={resolve('/spelling')}
					class="hover:text-primary font-semibold text-gray-600 transition-colors">Spelling</a
				>
				{#if data.gameAvailability.games}<a
						href={resolve('/games')}
						class="font-semibold text-teal-800">Games</a
					>{/if}
				<a href={resolve('/science')} class="font-semibold text-indigo-800">Science</a>
				<a href={resolve('/login')} class="hover:text-primary text-gray-600 transition-colors">
					Settings 🔒
				</a>
				{#if data.user?.isAdmin}
					<form method="POST" action={resolve('/logout')}>
						<button class="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold">
							Lock parent settings
						</button>
					</form>
				{/if}
			</div>
		</nav>
	</header>

	<main>
		<PracticeSaveStatus />
		{@render children?.()}
	</main>
</div>
