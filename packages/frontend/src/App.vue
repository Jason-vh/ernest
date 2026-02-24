<template>
  <div class="app">
    <MapView />
    <Legend />
    <FundaFilters />
  </div>
</template>

<script setup lang="ts">
import MapView from "./components/MapView.vue";
import Legend from "./components/Legend.vue";
import FundaFilters from "./components/FundaFilters.vue";
</script>

<style>
.app {
  width: 100%;
  height: 100%;
  position: relative;
}
</style>
