<script lang="ts">
	import { page } from '$app/stores';

	const dbPhrases = [
		'supabase',
		'database',
		'child profiles',
		'math settings',
		'spelling words',
		'stories',
		'postgrest'
	];

	$: status = $page.status;
	$: error = $page.error as App.Error | null;
	$: message = error?.message ?? 'The app could not finish loading this page.';
	$: isDatabaseError =
		error?.code === 'SUPABASE_CONNECTION' ||
		status === 503 ||
		dbPhrases.some((phrase) => message.toLowerCase().includes(phrase));
	$: title = isDatabaseError
		? 'Database connection needs attention'
		: error?.title || (status === 404 ? 'Page not found' : 'Something went wrong');
	$: help =
		error?.help ??
		(isDatabaseError
			? [
					'Verify the deployed secrets: supabase_url and supabase_service_role_key.',
					'Confirm the Supabase project is online and the service role key has not been rotated.',
					'Run the schema SQL manually in the Supabase SQL Editor before using the app.',
					'Refresh after the deployment secrets are available to the Cloud Run service.'
				]
			: ['Refresh the page. If it happens again, check the server logs for the request.']);

	function refresh() {
		location.reload();
	}
</script>

<svelte:head>
	<title>{title} | Imaginations By Lai</title>
</svelte:head>

<main class="min-h-screen bg-slate-50 px-4 py-10">
	<section class="mx-auto max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl">
		<div class="{isDatabaseError ? 'bg-amber-400' : 'bg-primary'} px-6 py-5">
			<p class="text-sm font-black uppercase tracking-wide text-slate-800">Status {status}</p>
			<h1 class="mt-1 text-3xl font-black text-slate-950">{title}</h1>
		</div>

		<div class="space-y-6 p-6">
			<div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
				<p class="font-bold text-slate-800">{message}</p>
			</div>

			{#if isDatabaseError}
				<div class="rounded-xl border border-amber-200 bg-amber-50 p-4">
					<h2 class="text-lg font-black text-amber-950">What to check</h2>
					<ul class="mt-3 space-y-2 text-sm font-semibold text-amber-950">
						{#each help as item}
							<li class="flex gap-2">
								<span aria-hidden="true">-</span>
								<span>{item}</span>
							</li>
						{/each}
					</ul>
				</div>
			{:else}
				<ul class="space-y-2 text-sm font-semibold text-slate-600">
					{#each help as item}
						<li>{item}</li>
					{/each}
				</ul>
			{/if}

			<div class="flex flex-wrap gap-3">
				<button
					type="button"
					on:click={refresh}
					class="rounded-xl bg-slate-900 px-5 py-3 font-black text-white shadow transition hover:-translate-y-0.5 hover:shadow-lg"
				>
					Try Again
				</button>
				<a
					href="/"
					class="rounded-xl border border-slate-300 px-5 py-3 font-black text-slate-700 transition hover:bg-slate-100"
				>
					Go Home
				</a>
				<a
					href="/login"
					class="rounded-xl border border-slate-300 px-5 py-3 font-black text-slate-700 transition hover:bg-slate-100"
				>
					Admin Login
				</a>
			</div>
		</div>
	</section>
</main>
