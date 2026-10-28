<script lang="ts">
	import { resolve } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import LoadingGame from '#lib/components/LoadingGame.svelte';
	import type { ActionData, PageData } from './$types';

	export let data: PageData;
	export let form: ActionData;
	let cancelling = false;
	let refreshing = false;
	$: terminal = ['succeeded', 'partial', 'failed', 'cancelled'].includes(data.job.status);
	$: title =
		data.job.status === 'succeeded'
			? 'Your story is ready.'
			: data.job.status === 'partial'
				? 'Your story is ready to read without a new illustration.'
				: data.job.status === 'failed'
					? 'This story could not be completed.'
					: data.job.status === 'cancelled'
						? 'Story generation was cancelled.'
						: data.job.stage === 'text'
							? 'Writing your story.'
							: 'Creating the illustration.';

	onMount(() => {
		localStorage.removeItem('imagine.pending-story-job');
		localStorage.removeItem('imagine.pending-admin-story-job');
		const timer = setInterval(() => {
			if (terminal || refreshing) return;
			refreshing = true;
			void invalidateAll()
				.catch(() => {})
				.finally(() => (refreshing = false));
		}, 4000);
		return () => clearInterval(timer);
	});

	const errors: Record<string, string> = {
		PROVIDER_FAILED: 'The story provider could not complete this request.',
		UNCERTAIN_PROVIDER_RESULT:
			'A provider response could not be confirmed, so the app stopped before purchasing it again.',
		STORAGE_FAILED: 'The illustration could not be stored safely.',
		INVALID_OUTPUT: 'The generated result did not pass story validation.',
		STORY_CHANGED:
			'The story changed while the illustration was being made, so the newer edit was preserved.',
		STORY_DELETED: 'The story was deleted while its illustration was being made.',
		DEVICE_REVOKED: 'This device is no longer authorized for that child.',
		ATTEMPTS_EXHAUSTED: 'The worker could not recover this request after several attempts.',
		JOB_EXPIRED: 'This request expired before it could finish.',
		BUDGET_EXCEEDED: 'The generation allowance has been reached.',
		CANCELLED: 'The request was cancelled.'
	};
</script>

<svelte:head><title>{title} · Imagine by LAI</title></svelte:head>
<main class="mx-auto max-w-2xl px-5 py-12">
	<a href={resolve('/')} class="font-bold text-teal-800">← Story library</a>
	<section class="mt-6 rounded-3xl bg-white p-8 shadow" aria-labelledby="job-title">
		<p class="text-sm font-bold tracking-widest text-teal-700 uppercase">
			{data.job.status.replaceAll('_', ' ')}
		</p>
		<h1 id="job-title" class="my-4 text-3xl font-black text-slate-900">{title}</h1>
		<p aria-live="polite" class="text-slate-700">
			Current step: {data.job.stage === 'text' ? 'story text' : 'illustration'}.
		</p>
		{#if data.job.error_code}
			<p role="alert" class="mt-4 rounded-xl bg-amber-50 p-4 text-amber-950">
				{errors[data.job.error_code] ?? 'The request stopped safely.'}
			</p>
		{/if}
		{#if data.job.result_story_id}
			<a
				href={resolve('/story/[id]', { id: String(data.job.result_story_id) })}
				class="bg-primary mt-6 inline-block rounded-xl border border-black px-6 py-3 font-black text-slate-900"
			>
				Read the story →
			</a>
		{/if}
		{#if !terminal}
			<p class="mt-5 text-sm text-slate-600">
				You can leave this page. The accepted request will continue in the background.
			</p>
			<form
				method="POST"
				action="?/cancel"
				use:enhance={() => {
					cancelling = true;
					return async ({ update }) => {
						await update({ reset: false });
						cancelling = false;
					};
				}}
			>
				<button class="mt-5 rounded-xl border px-5 py-3 font-bold" disabled={cancelling}>
					{cancelling ? 'Cancelling…' : 'Cancel generation'}
				</button>
			</form>
		{/if}
		{#if form?.message}<p role="alert" class="mt-4 text-red-700">{form.message}</p>{/if}
	</section>
</main>

{#if !terminal}<LoadingGame />{/if}
