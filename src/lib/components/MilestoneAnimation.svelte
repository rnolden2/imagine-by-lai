<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';

	export let count: number;
	export let onDismiss: () => void;

	// ── Timeline (ms) ────────────────────────────────────────────────
	// 0.0–1.9s  star flies around the screen
	// 1.9–2.9s  star centers + grows huge (with anticipation dip)
	// 2.9s      flash + explode into star dust
	// 3.0–4.4s  message, then auto-dismiss
	const TOTAL = 4400;

	const reduced =
		typeof window !== 'undefined' &&
		window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

	onMount(() => {
		const t = setTimeout(onDismiss, reduced ? 1800 : TOTAL);
		return () => clearTimeout(t);
	});

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			onDismiss();
		}
	}

	const COLORS = ['#fde68a', '#fbbf24', '#f472b6', '#60a5fa', '#4ade80', '#a78bfa', '#fb923c'];

	// Deterministic-ish dust cloud
	const dust = Array.from({ length: 36 }, (_, i) => {
		const angle = (i / 36) * Math.PI * 2 + (i % 3) * 0.18;
		const dist = 24 + ((i * 37) % 30); // vmin
		return {
			x: Math.cos(angle) * dist,
			y: Math.sin(angle) * dist,
			size: 6 + ((i * 13) % 12),
			rot: (i * 47) % 360,
			delay: (i % 6) * 25,
			color: COLORS[i % COLORS.length]
		};
	});

	// Comet trail = same flight path, slightly behind
	const trail = [
		{ delay: -70, opacity: 0.45, scale: 0.8 },
		{ delay: -140, opacity: 0.28, scale: 0.62 },
		{ delay: -210, opacity: 0.15, scale: 0.45 }
	];
</script>

<div
	transition:fade={{ duration: 250 }}
	class="bg-primary/95 fixed inset-0 z-[200] flex cursor-pointer items-center justify-center overflow-hidden"
	class:reduced
	on:click={onDismiss}
	on:keydown={handleKeydown}
	role="button"
	tabindex="0"
	aria-label="Milestone reached, tap to continue"
>
	<!-- Comet trail -->
	{#each trail as t}
			<div
				class="stage flight"
				style="animation-delay:{t.delay}ms; opacity:{t.opacity}; --trail:{t.scale};"
			aria-hidden="true"
		>
			<svg class="star trail-star" viewBox="0 0 24 24">
				<polygon
					points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
				/>
			</svg>
		</div>
	{/each}

	<!-- Hero star: flies, centers, grows, then vanishes into dust -->
		<div class="stage flight">
		<svg class="star hero" viewBox="0 0 24 24">
			<polygon
				points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
			/>
		</svg>
	</div>

	<!-- Explosion flash -->
	<div class="flash" aria-hidden="true"></div>

	<!-- Star dust -->
	{#each dust as d}
		<div
			class="dust"
			style="--dx:{d.x}vmin; --dy:{d.y}vmin; --rot:{d.rot}deg; animation-delay:{2900 +
				d.delay}ms;"
			aria-hidden="true"
		>
			<svg width={d.size} height={d.size} viewBox="0 0 24 24" fill={d.color}>
				<polygon
					points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
				/>
			</svg>
		</div>
	{/each}

	<!-- Message revealed by the blast -->
	<div
		class="message flex flex-col items-center gap-2 rounded-3xl bg-slate-900/85 px-8 py-6 text-center shadow-2xl backdrop-blur-sm"
	>
		<p class="text-2xl font-bold tracking-wide text-white/80">Amazing!</p>
		<div class="text-8xl leading-none font-black text-white drop-shadow-lg sm:text-9xl">
			{count}
		</div>
		<p class="text-3xl font-bold text-white">correct in a row!</p>
		<p class="mt-4 text-lg text-white/70">Tap anywhere to keep going</p>
	</div>
</div>

<style>
	/* Centered origin for everything; motion expressed in vmin so it scales
	   identically on phones, tablets and desktop. */
	.stage,
	.dust,
	.flash,
	.message {
		position: absolute;
		top: 50%;
		left: 50%;
		will-change: transform, opacity;
	}

	.star {
		width: 9vmin;
		height: 9vmin;
		fill: #fde68a;
		filter: drop-shadow(0 0 1.2vmin #fbbf24) drop-shadow(0 0 3vmin rgba(251, 191, 36, 0.6));
	}
	.trail-star {
		transform: scale(var(--trail, 1));
		/* trail must vanish with the blast, not linger at centre */
		animation: trail-fade 250ms ease-out 2700ms forwards;
	}
	@keyframes trail-fade {
		from {
			opacity: 1;
			transform: scale(var(--trail, 1));
		}
		to {
			opacity: 0;
			transform: scale(var(--trail, 1));
		}
	}

	/* 1. FLY around the screen, 2. arrive dead centre. */
	@keyframes fly {
		0% {
			transform: translate(-50%, -50%) translate(-46vmin, 34vmin) rotate(0deg) scale(0.35);
			opacity: 0;
		}
		8% {
			opacity: 1;
		}
		22% {
			transform: translate(-50%, -50%) translate(-16vmin, -30vmin) rotate(220deg) scale(0.9);
		}
		38% {
			transform: translate(-50%, -50%) translate(40vmin, -18vmin) rotate(430deg) scale(0.7);
		}
		54% {
			transform: translate(-50%, -50%) translate(22vmin, 28vmin) rotate(660deg) scale(1);
		}
		68% {
			transform: translate(-50%, -50%) translate(-34vmin, 14vmin) rotate(880deg) scale(0.8);
		}
		80%,
		100% {
			transform: translate(-50%, -50%) translate(0, 0) rotate(1080deg) scale(1);
			opacity: 1;
		}
	}

	/* 3. DIP (anticipation) then GROW HUGE and blow apart.
	   Separate animation so its easing is independent of the flight path. */
	@keyframes grow {
		0%,
		80% {
			transform: scale(1);
			opacity: 1;
		}
		84% {
			transform: scale(0.8);
			opacity: 1;
		}
		96% {
			transform: scale(7);
			opacity: 1;
		}
		100% {
			transform: scale(9.6);
			opacity: 0;
		}
	}

	.flight {
		animation: fly 2900ms cubic-bezier(0.45, 0, 0.35, 1) forwards;
	}

	.hero {
		animation: grow 2900ms cubic-bezier(0.6, -0.1, 0.3, 1.4) forwards;
		transform-origin: 50% 50%;
	}

	/* 4. FLASH */
	@keyframes flash {
		0% {
			transform: translate(-50%, -50%) scale(0.2);
			opacity: 0;
		}
		40% {
			opacity: 0.95;
		}
		100% {
			transform: translate(-50%, -50%) scale(2.6);
			opacity: 0;
		}
	}
	.flash {
		width: 60vmin;
		height: 60vmin;
		border-radius: 9999px;
		background: radial-gradient(
			circle,
			rgba(255, 255, 255, 0.95) 0%,
			rgba(253, 230, 138, 0.6) 35%,
			rgba(251, 191, 36, 0) 70%
		);
		opacity: 0;
		animation: flash 700ms ease-out 2830ms forwards;
		pointer-events: none;
	}

	/* 5. STAR DUST */
	@keyframes dust {
		0% {
			transform: translate(-50%, -50%) translate(0, 0) rotate(0deg) scale(0.4);
			opacity: 0;
		}
		12% {
			opacity: 1;
		}
		100% {
			transform: translate(-50%, -50%) translate(var(--dx), calc(var(--dy) + 12vmin))
				rotate(var(--rot)) scale(0.15);
			opacity: 0;
		}
	}
	.dust {
		opacity: 0;
		animation: dust 1300ms cubic-bezier(0.15, 0.75, 0.35, 1) forwards;
		filter: drop-shadow(0 0 0.6vmin rgba(255, 255, 255, 0.7));
		pointer-events: none;
	}

	/* 6. MESSAGE */
	@keyframes reveal {
		0% {
			transform: translate(-50%, -50%) scale(0.6);
			opacity: 0;
		}
		60% {
			transform: translate(-50%, -50%) scale(1.06);
			opacity: 1;
		}
		100% {
			transform: translate(-50%, -50%) scale(1);
			opacity: 1;
		}
	}
	.message {
		opacity: 0;
		transform: translate(-50%, -50%);
		animation: reveal 600ms cubic-bezier(0.34, 1.56, 0.64, 1) 3000ms forwards;
	}

	/* Accessibility: skip the flight, keep a gentle pop. */
	:global(.reduced) .flight,
	:global(.reduced) .hero,
	:global(.reduced) .dust,
	:global(.reduced) .flash {
		animation: none !important;
		opacity: 0 !important;
	}
	:global(.reduced) .message {
		animation-delay: 0ms;
		animation-duration: 300ms;
	}
	@media (prefers-reduced-motion: reduce) {
		.flight,
		.hero,
		.dust,
		.flash {
			animation: none;
			opacity: 0;
		}
		.message {
			animation-delay: 0ms;
		}
	}
</style>
