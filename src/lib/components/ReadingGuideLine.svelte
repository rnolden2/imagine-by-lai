<script lang="ts">
  export let top = 0;
  export let height = 0;
  export let visible = false;
</script>

{#if visible}
  <div
    class="reading-guide-line"
    style="top: {top}px; height: {height}px;"
  ></div>
{/if}

<style>
  .reading-guide-line {
    position: absolute;
    left: 0;
    right: 0;
    background-color: rgba(255, 255, 0, 0.2);
    z-index: 1;
    pointer-events: none;
    transition: top 0.1s ease-out;
  }
</style>
