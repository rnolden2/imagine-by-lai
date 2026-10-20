<script lang="ts">
	let {
		mechanic,
		label,
		active = false,
		progress = 0,
		ingredientUrl,
		vesselUrl,
		toolUrl,
		cupUrl,
		dishUrl
	}: {
		mechanic: string;
		label: string;
		active?: boolean;
		progress?: number;
		ingredientUrl?: string;
		vesselUrl?: string;
		toolUrl?: string;
		cupUrl?: string;
		dishUrl?: string;
	} = $props();
	const motion = $derived(
		mechanic === 'drag_to_bowl' && /flip/i.test(label)
			? 'flip'
			: mechanic === 'drag_to_bowl' && /sprinkle/i.test(label)
				? 'sprinkle'
				: mechanic === 'pour' && /spread/i.test(label)
					? 'spread'
					: mechanic
	);
</script>

<div
	class="cooking-animation"
	class:playing={active}
	data-motion={motion}
	style={`--progress:${Math.max(0, Math.min(1, progress))}`}
	role="img"
	aria-label={`${label} animation`}
>
	<div class="worktop"></div>
	{#if motion === 'slice'}
		<div class="cutting-board"></div>
		<div class="food-to-slice">
			{#if ingredientUrl}
				{#each [0, 1, 2] as piece (piece)}
					<img
						class={`food-piece piece-${piece}`}
						src={ingredientUrl}
						alt=""
						style={`clip-path:inset(0 ${100 - ((piece + 1) * 100) / 3}% 0 ${(piece * 100) / 3}%)`}
					/>
				{/each}
			{:else}<span class="food-placeholder"></span>{/if}
		</div>
		<svg class="slicing-tool" viewBox="0 0 160 70" aria-hidden="true">
			<path d="M12 22 H106 V47 H35 Q12 47 12 22" fill="#dae6e5" stroke="#7a9697" stroke-width="3" />
			<rect x="104" y="20" width="48" height="29" rx="10" fill="#438476" />
		</svg>
		<div class="slice-lines"><span></span><span></span></div>
	{:else if motion === 'measure'}
		<div class="measure-cup">
			<div class="measured-ingredient"></div>
			<span class="fill-line"></span>
			<span class="measure-tick tick-one"></span><span class="measure-tick tick-two"></span>
		</div>
		<span class="measure-label">Fill to the line</span>
	{:else}
		<div class="stationary-vessel">
			{#if vesselUrl}<img src={vesselUrl} alt="" />{:else}<div class="fallback-bowl"></div>{/if}
		</div>
		{#if motion === 'stir' || motion === 'whisk'}
			<div class="mixing-surface"><span></span><span></span><span></span></div>
			<div class="mixing-tool" class:whisk={motion === 'whisk'}>
				{#if toolUrl}<img src={toolUrl} alt="" />{:else}
					<svg viewBox="0 0 65 180" aria-hidden="true">
						<rect x="26" y="5" width="14" height="112" rx="7" fill="#c39462" />
						<ellipse cx="33" cy="135" rx="24" ry="34" fill="#dcb17c" />
					</svg>
				{/if}
			</div>
		{:else if motion === 'pour'}
			<div class="pouring-cup">
				{#if cupUrl}<img src={cupUrl} alt="" />{:else}<div class="fallback-cup"></div>{/if}
			</div>
			<div class="pour-stream"></div>
			<div class="pour-puddle"></div>
		{:else if motion === 'spread'}
			<div class="sauce"></div>
			<div class="spreading-tool">
				{#if toolUrl}<img src={toolUrl} alt="" />{:else}<span class="spoon"></span>{/if}
			</div>
		{:else if motion === 'sprinkle'}
			<div class="sprinkling-hand">
				{#if ingredientUrl}<img src={ingredientUrl} alt="" />{:else}<span>✦</span>{/if}
			</div>
			<div class="sprinkles">
				{#each [0, 1, 2, 3, 4, 5, 6, 7] as i (i)}<span style={`--i:${i}`}></span>{/each}
			</div>
		{:else if motion === 'drag_to_bowl'}
			<div class="moving-ingredient">
				{#if ingredientUrl}<img src={ingredientUrl} alt="" />{:else}<span class="food-placeholder"
					></span>{/if}
			</div>
		{:else if motion === 'flip'}
			<div class="pancake"></div>
			<div class="flipping-spatula">
				{#if toolUrl}<img src={toolUrl} alt="" />{:else}<span class="spoon"></span>{/if}
			</div>
		{:else if motion === 'timer'}
			<div class="steam">
				{#each [0, 1, 2] as i (i)}<span style={`--i:${i}`}></span>{/each}
			</div>
			<div class="kitchen-timer"><span></span></div>
		{:else}
			<div class="ready-dish">
				{#if dishUrl}<img src={dishUrl} alt="" />{:else}<span>✦</span>{/if}
			</div>
		{/if}
	{/if}
	<span class="action-label">{label}</span>
</div>

<style>
	.cooking-animation {
		position: relative;
		width: 100%;
		height: 100%;
		isolation: isolate;
	}
	img,
	svg {
		width: 100%;
		height: 100%;
		object-fit: contain;
		pointer-events: none;
	}
	.worktop {
		position: absolute;
		left: 12%;
		right: 12%;
		bottom: 16%;
		height: 12%;
		border-radius: 50%;
		background: #ba98772b;
	}
	.stationary-vessel {
		position: absolute;
		left: 27%;
		top: 35%;
		width: 48%;
		height: 48%;
	}
	.action-label {
		position: absolute;
		bottom: 0;
		width: 100%;
		text-align: center;
		font-size: clamp(12px, 2vw, 16px);
		font-weight: 800;
		color: #21584f;
	}
	.fallback-bowl {
		height: 65%;
		margin-top: 20%;
		border-radius: 12% 12% 50% 50%;
		background: #78ac9e;
		border-top: 8px solid #b3d6c6;
	}
	.cutting-board {
		position: absolute;
		left: 20%;
		top: 55%;
		width: 60%;
		height: 24%;
		border-radius: 20px;
		background: #dbad76;
		border-bottom: 8px solid #b88754;
		transform: skewX(-10deg);
	}
	.food-to-slice {
		position: absolute;
		left: 30%;
		top: 30%;
		width: 40%;
		height: 45%;
	}
	.food-piece {
		position: absolute;
		inset: 0;
	}
	.slicing-tool {
		position: absolute;
		left: 30%;
		top: 15%;
		width: 40%;
		height: 24%;
		transform: translateY(calc(var(--progress) * 35px));
	}
	.slice-lines {
		position: absolute;
		left: 42%;
		top: 52%;
		width: 20%;
		height: 15%;
		display: flex;
		justify-content: space-between;
		opacity: var(--progress);
	}
	.slice-lines span {
		width: 3px;
		background: #fff4cf;
		transform: rotate(12deg);
	}
	.food-placeholder {
		display: block;
		width: 65%;
		height: 65%;
		margin: 15%;
		background: #e9ae60;
		border-radius: 45%;
	}
	.measure-cup {
		position: absolute;
		left: 34%;
		top: 18%;
		width: 32%;
		height: 61%;
		border: 5px solid #68988e;
		border-top: 0;
		border-radius: 0 0 18% 18%;
		background: #fafffcad;
		overflow: hidden;
	}
	.measured-ingredient {
		position: absolute;
		bottom: 0;
		width: 100%;
		height: calc(10% + var(--progress) * 62%);
		background: #edce88;
		border-top: 5px solid #f9e3ad;
	}
	.fill-line {
		position: absolute;
		top: 28%;
		width: 100%;
		border-top: 3px dashed #256a5b;
	}
	.measure-tick {
		position: absolute;
		right: 0;
		width: 24%;
		border-top: 3px solid #68988e;
	}
	.tick-one {
		top: 52%;
	}
	.tick-two {
		top: 76%;
	}
	.measure-label {
		position: absolute;
		top: 8%;
		width: 100%;
		text-align: center;
		font-weight: 700;
		font-size: 12px;
	}
	.mixing-tool {
		position: absolute;
		left: 45%;
		top: 7%;
		width: 25%;
		height: 54%;
		transform-origin: 50% 85%;
		transform: translateX(calc(var(--progress) * 14px)) rotate(-18deg);
	}
	.mixing-surface {
		position: absolute;
		left: 37%;
		top: 51%;
		width: 28%;
		height: 10%;
		border-radius: 50%;
		background: #e3bd7f88;
		overflow: hidden;
	}
	.mixing-surface span {
		position: absolute;
		width: 13%;
		height: 35%;
		border-radius: 50%;
		background: #c88851;
		top: 30%;
	}
	.mixing-surface span:nth-child(1) {
		left: 15%;
	}
	.mixing-surface span:nth-child(2) {
		left: 45%;
	}
	.mixing-surface span:nth-child(3) {
		left: 72%;
	}
	.pouring-cup {
		position: absolute;
		left: 17%;
		top: 2%;
		width: 28%;
		height: 43%;
		transform-origin: 75% 65%;
		transform: rotate(calc(var(--progress) * 50deg));
	}
	.fallback-cup {
		margin: 15%;
		height: 65%;
		background: #a8d6dc;
		border: 4px solid #508c94;
		border-radius: 10% 10% 25% 25%;
	}
	.pour-stream {
		position: absolute;
		left: 43%;
		top: 32%;
		width: 4%;
		height: 30%;
		border-radius: 40%;
		background: #e6c27e;
		transform-origin: top;
		transform: scaleY(var(--progress));
	}
	.pour-puddle {
		position: absolute;
		left: 38%;
		top: 56%;
		width: 25%;
		height: 8%;
		border-radius: 50%;
		background: #e6c27e;
		transform: scale(var(--progress));
	}
	.sauce {
		position: absolute;
		left: 35%;
		top: 51%;
		width: 33%;
		height: 15%;
		border-radius: 50%;
		background: #cf654a;
		transform: scaleX(calc(0.3 + var(--progress) * 0.7));
	}
	.spreading-tool {
		position: absolute;
		left: 43%;
		top: 20%;
		width: 20%;
		height: 41%;
		transform: rotate(-35deg) translateX(calc(var(--progress) * 20px));
	}
	.spoon {
		display: block;
		width: 15%;
		height: 90%;
		margin: auto;
		border-radius: 30%;
		background: #c59564;
	}
	.spoon::after {
		content: '';
		display: block;
		position: absolute;
		width: 50%;
		height: 30%;
		bottom: 0;
		left: 25%;
		background: #dbb07a;
		border-radius: 45%;
	}
	.sprinkling-hand {
		position: absolute;
		left: 25%;
		top: 0;
		width: 28%;
		height: 30%;
		transform: rotate(15deg);
	}
	.sprinkles {
		position: absolute;
		inset: 0;
	}
	.sprinkles span {
		position: absolute;
		left: calc(36% + var(--i) * 4%);
		top: calc(25% + var(--i) * 2%);
		width: 3%;
		height: 6%;
		border-radius: 3px;
		background: #f8d472;
		transform: translateY(calc(var(--progress) * 45px)) rotate(calc(var(--i) * 30deg));
		opacity: calc(0.25 + var(--progress) * 0.75);
	}
	.moving-ingredient {
		position: absolute;
		left: 12%;
		top: 10%;
		width: 27%;
		height: 38%;
		transform: translate(calc(var(--progress) * 100px), calc(var(--progress) * 50px));
	}
	.pancake {
		position: absolute;
		left: 38%;
		top: 50%;
		width: 27%;
		height: 10%;
		background: #dc9b4c;
		border: 4px solid #f3cd83;
		border-radius: 50%;
	}
	.flipping-spatula {
		position: absolute;
		left: 26%;
		top: 36%;
		width: 27%;
		height: 34%;
		transform: rotate(-30deg);
	}
	.kitchen-timer {
		position: absolute;
		right: 12%;
		top: 35%;
		width: 16%;
		aspect-ratio: 1;
		border: 5px solid #398273;
		border-radius: 50%;
		background: #fff9df;
	}
	.kitchen-timer span {
		position: absolute;
		left: calc(50% - 2px);
		top: 10%;
		width: 4px;
		height: 40%;
		background: #398273;
		transform-origin: bottom;
		transform: rotate(calc(var(--progress) * 360deg));
	}
	.steam {
		position: absolute;
		left: 37%;
		top: 17%;
		width: 28%;
		height: 35%;
	}
	.steam span {
		position: absolute;
		left: calc(var(--i) * 34%);
		top: 20%;
		height: 75%;
		width: 16%;
		border-left: 4px solid #fffdf5;
		border-radius: 50%;
		opacity: 0.8;
	}
	.ready-dish {
		position: absolute;
		left: 25%;
		top: 25%;
		width: 50%;
		height: 50%;
	}
	.playing .slicing-tool {
		animation: slice 1s ease-in-out both;
	}
	.playing .piece-0 {
		animation: separate-left 1s ease-out both;
	}
	.playing .piece-2 {
		animation: separate-right 1s ease-out both;
	}
	.playing .slice-lines {
		opacity: 1;
	}
	.playing .measured-ingredient {
		animation: fill 1s ease-out both;
	}
	.playing .mixing-tool {
		animation: stir 0.5s linear 2;
	}
	.playing .mixing-tool.whisk {
		animation: whisk 0.16s ease-in-out 6;
	}
	.playing .mixing-surface span {
		animation: ingredients 0.5s ease-in-out 2;
	}
	.playing .pouring-cup {
		animation: tip 1s ease-in-out both;
	}
	.playing .pour-stream {
		animation: stream 1s ease-in-out both;
	}
	.playing .pour-puddle {
		animation: puddle 1s ease-out both;
	}
	.playing .sauce {
		animation: spread 1s ease-in-out both;
	}
	.playing .spreading-tool {
		animation: spread-tool 0.5s ease-in-out 2;
	}
	.playing .sprinkling-hand {
		animation: sprinkle-hand 0.25s ease-in-out 4;
	}
	.playing .sprinkles span {
		animation: sprinkle 0.7s ease-in calc(var(--i) * 0.025s) both;
	}
	.playing .moving-ingredient {
		animation: add 1s ease-in-out both;
	}
	.playing .pancake {
		animation: flip 1s ease-in-out both;
	}
	.playing .flipping-spatula {
		animation: spatula 1s ease-in-out both;
	}
	.playing .steam span {
		animation: steam 1s ease-out calc(var(--i) * -0.25s) both;
	}
	.playing .kitchen-timer span {
		animation: clock 1s linear both;
	}
	@keyframes slice {
		0%,
		100% {
			transform: translate(0, 0);
		}
		25% {
			transform: translate(-12px, 65px);
		}
		45% {
			transform: translate(12px, 0);
		}
		70% {
			transform: translate(22px, 65px);
		}
	}
	@keyframes separate-left {
		0%,
		65% {
			transform: none;
		}
		100% {
			transform: translateX(-12px) rotate(-5deg);
		}
	}
	@keyframes separate-right {
		0%,
		65% {
			transform: none;
		}
		100% {
			transform: translateX(12px) rotate(5deg);
		}
	}
	@keyframes fill {
		from {
			height: 10%;
		}
		to {
			height: 72%;
		}
	}
	@keyframes stir {
		0%,
		100% {
			transform: translate(-15px, 0) rotate(-15deg);
		}
		25% {
			transform: translate(0, -9px) rotate(0);
		}
		50% {
			transform: translate(15px, 0) rotate(15deg);
		}
		75% {
			transform: translate(0, 9px) rotate(0);
		}
	}
	@keyframes whisk {
		0%,
		100% {
			transform: translateX(-12px) rotate(-12deg);
		}
		50% {
			transform: translateX(12px) rotate(12deg);
		}
	}
	@keyframes ingredients {
		0%,
		100% {
			transform: translate(0, 0);
		}
		50% {
			transform: translate(12px, 4px);
		}
	}
	@keyframes tip {
		0%,
		100% {
			transform: rotate(0);
		}
		25%,
		75% {
			transform: rotate(55deg);
		}
	}
	@keyframes stream {
		0%,
		15%,
		90%,
		100% {
			transform: scaleY(0);
		}
		30%,
		75% {
			transform: scaleY(1);
		}
	}
	@keyframes puddle {
		from {
			transform: scale(0);
		}
		to {
			transform: scale(1);
		}
	}
	@keyframes spread {
		from {
			transform: scaleX(0.3);
		}
		to {
			transform: scaleX(1);
		}
	}
	@keyframes spread-tool {
		0%,
		100% {
			transform: translateX(-22px) rotate(-35deg);
		}
		50% {
			transform: translateX(22px) rotate(10deg);
		}
	}
	@keyframes sprinkle-hand {
		0%,
		100% {
			transform: rotate(10deg);
		}
		50% {
			transform: rotate(25deg);
		}
	}
	@keyframes sprinkle {
		from {
			transform: translateY(0) rotate(0);
			opacity: 0;
		}
		20% {
			opacity: 1;
		}
		to {
			transform: translateY(70px) rotate(60deg);
			opacity: 1;
		}
	}
	@keyframes add {
		0% {
			transform: translate(0, 0);
		}
		55% {
			transform: translate(100px, 0);
		}
		100% {
			transform: translate(100px, 65px) scale(0.7);
			opacity: 0.4;
		}
	}
	@keyframes flip {
		0%,
		100% {
			transform: translateY(0) rotateX(0);
		}
		50% {
			transform: translateY(-85px) rotateX(180deg);
		}
	}
	@keyframes spatula {
		0%,
		100% {
			transform: rotate(-30deg);
		}
		35% {
			transform: translateY(-28px) rotate(-10deg);
		}
	}
	@keyframes steam {
		from {
			transform: translateY(15px);
			opacity: 0;
		}
		40% {
			opacity: 0.9;
		}
		to {
			transform: translateY(-25px);
			opacity: 0;
		}
	}
	@keyframes clock {
		to {
			transform: rotate(360deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.cooking-animation *,
		.playing * {
			animation: none !important;
			transform: none !important;
		}
		.playing .measured-ingredient {
			height: 72%;
		}
		.playing .sprinkles span,
		.playing .slice-lines {
			opacity: 1;
		}
	}
</style>
