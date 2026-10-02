<script lang="ts">
	import { onMount } from 'svelte';
	let { mechanic, label, imageUrl, disabled=false, oncomplete }:{mechanic:string;label:string;imageUrl?:string;disabled?:boolean;oncomplete:()=>void}=$props();
	let progress=$state(0);let holding=$state(false);let previous={x:0,y:0};let distance=0;let sent=false;let seconds=$state(3);
	const instruction=$derived(mechanic==='measure'?'Slide to fill to the line':mechanic==='slice'?'Swipe across to pretend slice':mechanic==='stir'||mechanic==='whisk'?'Move in a little circle':mechanic==='pour'?'Move down to pour':mechanic==='drag_to_bowl'?'Drag across to add it':'A little pretend cooking time');
	function finish(){if(disabled||sent)return;sent=true;progress=1;oncomplete();}
	function down(e:PointerEvent){if(disabled)return;holding=true;distance=0;previous={x:e.clientX,y:e.clientY};e.currentTarget instanceof HTMLElement&&e.currentTarget.setPointerCapture(e.pointerId);}
	function move(e:PointerEvent){if(!holding||disabled)return;distance+=Math.hypot(e.clientX-previous.x,e.clientY-previous.y);previous={x:e.clientX,y:e.clientY};progress=Math.min(distance/160,1);if(progress>=1){holding=false;finish();}}
	onMount(()=>{if(mechanic!=='timer')return;const timer=setInterval(()=>{seconds=Math.max(0,seconds-1);progress=(3-seconds)/3;},1000);return()=>clearInterval(timer);});
</script>
<div class="gesture-wrap">
	<p>{mechanic==='timer'?(seconds?`${seconds}…`:'Ready to serve!'):instruction}</p>
	<button type="button" class="gesture" aria-label={label} {disabled} onpointerdown={down} onpointermove={move} onpointerup={()=>holding=false} onpointercancel={()=>holding=false} onclick={finish}>
		{#if imageUrl}<img src={imageUrl} alt="" width="150" height="150" style={`transform:rotate(${['stir','whisk'].includes(mechanic)?progress*180:mechanic==='pour'?progress*-35:0}deg) translateX(${mechanic==='drag_to_bowl'?progress*65:0}px)`}/>{:else}<span aria-hidden="true">✦</span>{/if}
		<span class="track" aria-hidden="true"><span style={`width:${progress*100}%`}></span></span>
	</button>
	<button type="button" class="equivalent" {disabled} onclick={finish}>{mechanic==='timer'?'Skip wait':label} →</button>
</div>
<style>
	.gesture-wrap{padding:16px;background:#f0e9d7;border-radius:20px;margin:16px 0;text-align:center}.gesture-wrap p{font-weight:700;font-size:14px}.gesture{position:relative;display:flex;align-items:center;justify-content:center;width:100%;height:170px;touch-action:none;cursor:grab;border-radius:16px;overflow:hidden}.gesture img{object-fit:contain;max-height:140px;max-width:140px;pointer-events:none}.gesture>span:not(.track){font-size:72px;color:#d39c45}.track{position:absolute;bottom:4px;left:15%;height:8px;background:#d6d1c2;width:70%;border-radius:8px;overflow:hidden}.track span{display:block;height:100%;background:#428776}.equivalent{min-height:44px;font-weight:800;color:#185b50;width:100%;cursor:pointer}button:focus-visible{outline:3px solid #bb702c;outline-offset:3px}button:disabled{opacity:.5;cursor:default}@media(prefers-reduced-motion:reduce){.gesture img{transform:none!important}}
</style>
