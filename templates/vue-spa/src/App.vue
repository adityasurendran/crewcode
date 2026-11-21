<template>
  <main class="wrap">
    <h1>CrewCode Vue Starter</h1>
    <p>Count: {{ count }} <button @click="count++">+1</button></p>
    <p class="muted">Ask your CrewCode agent to build the next screen.</p>
  </main>
</template>

<script setup lang="ts">
import { ref } from "vue";

const count = ref(0);
</script>

<style>
.wrap {
  max-width: 720px;
  margin: 0 auto;
  padding: 48px 24px;
  font-family: system-ui, sans-serif;
}
.muted {
  color: #666;
}
</style>
