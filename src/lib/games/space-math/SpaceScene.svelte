<script lang="ts">
	import { PLANETS } from './engine';
	export let visited = 0;
	export let landed = false;
	$: destination = PLANETS[(landed ? Math.max(0, visited - 1) : visited) % PLANETS.length];
</script>

<div class="scene" class:landed aria-hidden="true">
	<svg viewBox="0 0 640 200" class="w-full">
		{#each Array.from({ length: 32 }, (_, i) => i) as star (star)}
			<circle
				cx={(star * 137 + 29) % 640}
				cy={(star * 53 + 17) % 190}
				r={star % 3 === 0 ? 2 : 1}
				fill="#c7d2fe"
				opacity={star % 2 === 0 ? 0.7 : 0.35}
			/>
		{/each}
		<path
			d="M 90 135 Q 300 15 523 105"
			fill="none"
			stroke="#818cf8"
			stroke-width="2"
			stroke-dasharray="4 10"
			opacity="0.5"
		/>
		<circle cx="527" cy="106" r="67" fill={destination.color} />
		<ellipse
			cx="527"
			cy="106"
			rx="86"
			ry="19"
			fill="none"
			stroke={destination.color}
			stroke-width="8"
			opacity="0.5"
			transform="rotate(-25 527 106)"
		/>
		<circle cx="505" cy="80" r="12" fill="#312e81" opacity="0.13" />
		<circle cx="554" cy="126" r="18" fill="#312e81" opacity="0.13" />
		<g class="ship">
			<g transform="rotate(35)">
				<path class="flame" d="M-11 28 Q0 75 11 28" fill="#fcd34d" />
				<path d="M-15 3 L-29 31 L-10 25 M15 3 L29 31 L10 25" fill="#a5b4fc" />
				<path d="M0-42 Q-29-12-15 29 L15 29 Q29-12 0-42" fill="#f8fafc" />
				<path d="M0-42 Q-12-29-15-18 L15-18 Q12-29 0-42" fill="#c4b5fd" />
				<circle cy="-2" r="10" fill="#67e8f9" stroke="#3730a3" stroke-width="4" />
			</g>
		</g>
	</svg>
</div>

<style>
	.scene {
		overflow: hidden;
	}
	.ship {
		transform: translate(100px, 132px);
		transition: transform 1.4s ease-in-out;
	}
	.landed .ship {
		transform: translate(453px, 95px);
	}
	.flame {
		opacity: 0.2;
	}
	.landed .flame {
		animation: boost 1.4s ease-in-out;
	}
	@keyframes boost {
		15%,
		80% {
			opacity: 1;
		}
		100% {
			opacity: 0.2;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.ship {
			transition: none;
		}
		.landed .flame {
			animation: none;
		}
	}
</style>
