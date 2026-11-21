<script lang="ts">
  let count = 0;
</script>

<main>
  <h1>CrewCode Svelte Starter</h1>
  <p>Count: {count} <button on:click={() => count++}>+1</button></p>
  <p class="muted">Ask your CrewCode agent to build the next screen.</p>
</main>

<style>
  main {
    max-width: 720px;
    margin: 0 auto;
    padding: 48px 24px;
    font-family: system-ui, sans-serif;
  }
  .muted {
    color: #666;
  }
</style>
