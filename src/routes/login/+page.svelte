<script lang="ts">
	import type { ActionData } from './$types';
	import { enhance } from '$app/forms';

	export let form: ActionData;
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-100">
	<div class="w-full max-w-sm space-y-6 rounded-lg bg-white p-8 shadow-md">
		<h1 class="text-center text-2xl font-bold text-gray-900">Admin Login</h1>
		<form method="POST" use:enhance class="space-y-6">
			<div>
				<label for="password" class="block text-sm font-medium text-gray-700">Password</label>
				<input
					type="password"
					id="password"
					name="password"
					class="focus:border-primary focus:ring-primary mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm"
					required
				/>
			</div>
			<div>
				<button
					type="submit"
					class="bg-primary focus:ring-primary flex w-full justify-center rounded-md border border-transparent px-4 py-3 text-sm font-medium text-black shadow-sm transition-opacity hover:opacity-90 focus:ring-2 focus:ring-offset-2 focus:outline-none"
				>
					Login
				</button>
			</div>
		</form>
		{#if form?.error}
			<p class="text-center text-sm text-red-500">{form.error}</p>
		{/if}
	</div>
</div>
