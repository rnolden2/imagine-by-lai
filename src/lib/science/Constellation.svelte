<script lang="ts">
	import { layout, related } from './graph';
	import { SvelteSet } from 'svelte/reactivity';
	import { subjects, subjectById } from './taxonomy';
	import type { Activity } from './contracts';
	let {
		activities,
		matchingIds,
		selectedId,
		mode,
		onselect,
		onsubject
	}: {
		activities: Activity[];
		matchingIds: Set<string>;
		selectedId: string | null;
		mode: 'science' | 'materials';
		onselect: (id: string) => void;
		onsubject: (id: string) => void;
	} = $props();
	let zoom = $state(1);
	let pan = $state({ x: 0, y: 0 });
	let dragging = $state(false);
	let start: { x: number; y: number; px: number; py: number } | null = null;
	let container: HTMLDivElement;
	const stars = $derived(layout(activities));
	const selected = $derived(activities.find((a) => a.id === selectedId));
	const neighbors = $derived(
		selected
			? related(
					selected,
					activities.filter((a) => matchingIds.has(a.id)),
					mode
				)
			: []
	);
	const lit = $derived(new Set([selectedId, ...neighbors.map((n) => n.activity.id)]));
	const selectedStar = $derived(stars.find((s) => s.activity.id === selectedId));
	const links = $derived.by(() => {
		if (selectedStar)
			return neighbors.map((n) => ({
				a: selectedStar,
				b: stars.find((s) => s.activity.id === n.activity.id)!
			}));
		// One meaningful neighbor per star is enough structure for the overview.
		const seen = new SvelteSet<string>();
		return stars.flatMap((star) => {
			const neighbor = related(star.activity, activities, 'science', 1)[0];
			if (!neighbor) return [];
			const key = [star.activity.id, neighbor.activity.id].sort().join(':');
			if (seen.has(key)) return [];
			seen.add(key);
			return [{ a: star, b: stars.find((s) => s.activity.id === neighbor.activity.id)! }];
		});
	});
	function reset() {
		zoom = 1;
		pan = { x: 0, y: 0 };
	}
	function zoomBy(delta: number) {
		zoom = Math.min(3, Math.max(1, Number((zoom + delta).toFixed(2))));
		if (zoom === 1) pan = { x: 0, y: 0 };
	}
	function pointerdown(event: PointerEvent) {
		if ((event.target as HTMLElement).closest('button')) return;
		start = { x: event.clientX, y: event.clientY, px: pan.x, py: pan.y };
		dragging = true;
		container.setPointerCapture(event.pointerId);
	}
	function pointermove(event: PointerEvent) {
		if (!start || !dragging) return;
		const maxX = (container.clientWidth * (zoom - 1)) / 2;
		const maxY = (container.clientHeight * (zoom - 1)) / 2;
		pan = {
			x: Math.max(-maxX, Math.min(maxX, start.px + event.clientX - start.x)),
			y: Math.max(-maxY, Math.min(maxY, start.py + event.clientY - start.y))
		};
	}
</script>

<div
	class="constellation"
	role="group"
	bind:this={container}
	onpointerdown={pointerdown}
	onpointermove={pointermove}
	onpointerup={() => {
		dragging = false;
		start = null;
	}}
	onpointercancel={() => {
		dragging = false;
		start = null;
	}}
	class:dragging
	aria-label="Science constellation"
>
	<div class="map-meta"><span class="live-dot"></span> A WORLD OF CONNECTIONS</div>
	<div class="map-surface" style:transform="translate({pan.x}px, {pan.y}px) scale({zoom})">
		<svg class="connections" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
			{#each links as link (`${link.a.activity.id}:${link.b.activity.id}`)}
				<line
					x1={link.a.x}
					y1={link.a.y}
					x2={link.b.x}
					y2={link.b.y}
					class:highlighted={!!selectedStar}
					class:filtered={!matchingIds.has(link.a.activity.id) ||
						!matchingIds.has(link.b.activity.id)}
				/>
			{/each}
		</svg>
		{#each subjects as subject (subject.id)}
			<button
				class="subject-name"
				style:left="{subject.x}%"
				style:top="{subject.y - 16}%"
				style:color={subject.color}
				onclick={() => onsubject(subject.id)}
				aria-label="Filter by {subject.label}"
			>
				<span aria-hidden="true">{subject.symbol}</span>
				{subject.label}
			</button>
		{/each}
		{#each stars as star (star.activity.id)}
			<button
				class="star"
				class:selected={selectedId === star.activity.id}
				class:neighbor={selected && lit.has(star.activity.id)}
				class:dim={selected && !lit.has(star.activity.id)}
				class:filtered={!matchingIds.has(star.activity.id)}
				disabled={!matchingIds.has(star.activity.id)}
				style:left="{star.x}%"
				style:top="{star.y}%"
				style:--star-color={subjectById.get(star.activity.subject)!.color}
				style:--inverse-zoom={1 / zoom}
				onclick={() => onselect(star.activity.id)}
				aria-label={star.activity.title}
				aria-pressed={selectedId === star.activity.id}
			>
				<span class="star-core"></span><span class="star-label">{star.activity.title}</span>
			</button>
		{/each}
	</div>
	<div class="map-bottom">
		<span>Select a star to discover its science</span>
		<div class="zoom-controls">
			<button onclick={() => zoomBy(-0.5)} disabled={zoom <= 1} aria-label="Zoom out">−</button>
			<button onclick={reset} aria-label="Reset constellation view"
				>{Math.round(zoom * 100)}%</button
			>
			<button onclick={() => zoomBy(0.5)} disabled={zoom >= 3} aria-label="Zoom in">+</button>
		</div>
	</div>
</div>

<style>
	.constellation {
		position: relative;
		height: 620px;
		overflow: hidden;
		border: 1px solid #263449;
		border-radius: 24px;
		background:
			radial-gradient(ellipse at 23% 35%, #152d453d, transparent 45%),
			radial-gradient(ellipse at 78% 70%, #34314445, transparent 45%), #0b1423;
		touch-action: pan-y;
	}
	.constellation::before {
		content: '';
		position: absolute;
		inset: 0;
		opacity: 0.3;
		pointer-events: none;
		background-image: radial-gradient(#93abc2 0.65px, transparent 0.8px);
		background-size: 43px 47px;
	}
	.map-surface {
		position: absolute;
		inset: 50px 20px 65px;
		transform-origin: center;
		transition: transform 240ms ease;
	}
	.dragging .map-surface {
		transition: none;
	}
	.map-meta {
		position: absolute;
		left: 25px;
		top: 23px;
		font-size: 10px;
		letter-spacing: 0.16em;
		color: #9aaec5;
		display: flex;
		align-items: center;
		gap: 9px;
		z-index: 2;
		pointer-events: none;
	}
	.live-dot {
		width: 5px;
		height: 5px;
		background: #b3d9e5;
		border-radius: 50%;
	}
	.connections {
		position: absolute;
		width: 100%;
		height: 100%;
		overflow: visible;
	}
	line {
		stroke: #91b5d3;
		stroke-opacity: 0.17;
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}
	line.highlighted {
		stroke: #c3ddf1;
		stroke-opacity: 0.65;
		stroke-width: 1.3;
	}
	line.filtered {
		stroke-opacity: 0.04;
	}
	.subject-name {
		position: absolute;
		transform: translate(-50%, -50%);
		white-space: nowrap;
		font-size: 11px;
		letter-spacing: 0.04em;
		font-weight: 800;
		padding: 7px;
		border-radius: 8px;
		cursor: pointer;
	}
	.subject-name span {
		margin-right: 5px;
	}
	.star {
		position: absolute;
		width: 30px;
		height: 30px;
		transform: translate(-50%, -50%) scale(var(--inverse-zoom));
		display: grid;
		place-items: center;
		border-radius: 50%;
		cursor: pointer;
		z-index: 1;
	}
	.star-core {
		width: 7px;
		height: 7px;
		background: var(--star-color);
		border-radius: 50%;
		box-shadow: 0 0 11px 2px color-mix(in srgb, var(--star-color) 35%, transparent);
		transition:
			opacity 200ms,
			transform 200ms;
	}
	.star:hover,
	.star:focus-visible,
	.star.selected {
		z-index: 5;
	}
	.star:focus-visible,
	.subject-name:focus-visible {
		outline: 2px solid #f0f7ff;
		outline-offset: 3px;
	}
	.star.selected .star-core {
		transform: scale(1.6);
		outline: 1px solid var(--star-color);
		outline-offset: 6px;
		box-shadow: 0 0 23px 7px color-mix(in srgb, var(--star-color) 30%, transparent);
	}
	.star.neighbor .star-core {
		transform: scale(1.2);
	}
	.star.dim .star-core {
		opacity: 0.2;
		box-shadow: none;
	}
	.star.filtered .star-core {
		opacity: 0.08;
		box-shadow: none;
	}
	.star-label {
		position: absolute;
		top: 32px;
		left: 50%;
		transform: translateX(-50%);
		width: max-content;
		max-width: 170px;
		background: #17263d;
		border: 1px solid #3c516b;
		color: #f4f8fc;
		border-radius: 8px;
		padding: 7px 10px;
		font-size: 12px;
		line-height: 1.35;
		text-align: center;
		pointer-events: none;
		opacity: 0;
	}
	.star:hover .star-label,
	.star:focus-visible .star-label,
	.star.selected .star-label {
		opacity: 1;
	}
	.map-bottom {
		position: absolute;
		bottom: 20px;
		left: 24px;
		right: 20px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 15px;
		font-size: 11px;
		color: #9aacbf;
	}
	.zoom-controls {
		display: flex;
		background: #101e31;
		border: 1px solid #34445b;
		border-radius: 10px;
	}
	.zoom-controls button {
		min-width: 35px;
		height: 36px;
		padding: 0 7px;
		color: #e6eef7;
		cursor: pointer;
	}
	.zoom-controls button:disabled {
		opacity: 0.35;
		cursor: default;
	}
	@media (pointer: coarse) {
		.star {
			width: 44px;
			height: 44px;
		}
		.star-label {
			top: 43px;
		}
		.zoom-controls button {
			min-width: 44px;
			height: 44px;
		}
	}
	@media (max-width: 640px) {
		.constellation {
			height: 440px;
		}
		.map-surface {
			inset: 65px 10px 65px;
		}
		.subject-name {
			font-size: 10px;
			max-width: 95px;
			white-space: normal;
			text-align: center;
			line-height: 1.25;
		}
		.map-bottom > span {
			max-width: 140px;
		}
		.star-label {
			max-width: 120px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.map-surface,
		.star-core {
			transition: none;
		}
	}
</style>
