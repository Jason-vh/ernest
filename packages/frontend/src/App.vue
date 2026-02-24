<template>
  <div class="app">
    <MapView />
    <Legend />
  </div>
</template>

<script setup lang="ts">
import MapView from "./components/MapView.vue";
import Legend from "./components/Legend.vue";
</script>

<style>
.app {
  width: 100%;
  height: 100%;
  position: relative;
}
</style>
