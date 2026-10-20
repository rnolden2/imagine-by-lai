<script lang="ts">
	import type { Problem } from '$lib/math';
	export let problem: Problem;
	export let showHint = false;
	$: hour = Number(problem.state.hour ?? 12);
	$: minute = Number(problem.state.minute ?? 0);
	$: numerator = Number(problem.state.numerator ?? 0);
	$: denominator = Number(problem.state.denominator ?? 1);
	$: number = Number(problem.state.number ?? 0);
</script>

{#if problem.op === 'time'}
	<svg
		viewBox="0 0 220 220"
		class="mx-auto h-52 w-52"
		role="img"
		aria-label={`Clock with the short hand at hour ${hour} and the long hand at minute ${minute}`}
	>
		<circle cx="110" cy="110" r="102" fill="#f8fafc" stroke="#c4b5fd" stroke-width="6" />
		{#each Array.from({ length: 12 }, (_, i) => i + 1) as n (n)}
			<text
				x={110 + 80 * Math.sin((n * Math.PI) / 6)}
				y={116 - 80 * Math.cos((n * Math.PI) / 6)}
				text-anchor="middle"
				fill="#312e81"
				font-size="18"
				font-weight="800">{n}</text
			>
		{/each}
		<line
			x1="110"
			y1="110"
			x2="110"
			y2="62"
			stroke="#312e81"
			stroke-width="9"
			stroke-linecap="round"
			transform={`rotate(${(hour % 12) * 30 + minute * 0.5} 110 110)`}
		/>
		<line
			x1="110"
			y1="110"
			x2="110"
			y2="39"
			stroke="#0e7490"
			stroke-width="5"
			stroke-linecap="round"
			transform={`rotate(${minute * 6} 110 110)`}
		/>
		<circle cx="110" cy="110" r="6" fill="#312e81" />
	</svg>
{:else if problem.op === 'fractions'}
	<div
		role="img"
		aria-label={`${numerator} of ${denominator} equal parts are glowing`}
		class="mx-auto flex h-24 w-full max-w-sm gap-1 rounded-2xl border-2 border-indigo-200 p-2"
	>
		{#each Array.from({ length: denominator }, (_, i) => i) as i (i)}
			<div
				class="flex flex-1 items-center justify-center rounded-md border-2 border-indigo-500 text-indigo-950"
				class:bg-cyan-200={i < numerator}
				class:bg-white={i >= numerator}
			>
				{#if showHint}<span class="text-sm font-black">{i + 1}</span>{/if}
			</div>
		{/each}
	</div>
{:else if problem.op === 'number-recognition'}
	<div
		role="img"
		aria-label={`${number} stars`}
		class="mx-auto flex max-w-xs flex-wrap justify-center gap-3"
	>
		{#each Array.from({ length: number }, (_, i) => i) as i (i)}
			<span class="relative text-4xl text-amber-300" aria-hidden="true"
				>★{#if showHint}<span
						class="absolute inset-0 grid place-items-center pt-1 text-xs font-black text-indigo-950"
						>{i + 1}</span
					>{/if}</span
			>
		{/each}
	</div>
{:else}
	<p
		class="text-center text-4xl font-extrabold tracking-tight text-white sm:text-6xl"
		data-testid="equation"
	>
		{problem.num1}
		<span class="text-cyan-200"
			>{problem.op === 'multiplication'
				? '×'
				: problem.op === 'division'
					? '÷'
					: problem.op === 'subtraction'
						? '−'
						: '+'}</span
		>
		{problem.num2} = ?
	</p>
	{#if showHint && (problem.op === 'addition' || problem.op === 'subtraction') && (problem.num1 ?? 0) + (problem.num2 ?? 0) <= 20}
		<div
			class="mt-4 flex flex-wrap items-center justify-center gap-3 text-2xl"
			aria-label="Stars to help you count"
		>
			<span class="text-amber-200">{'★'.repeat(problem.num1 ?? 0)}</span>
			<span>{problem.symbol}</span>
			<span class="text-cyan-200">{'★'.repeat(problem.num2 ?? 0)}</span>
		</div>
	{/if}
{/if}
