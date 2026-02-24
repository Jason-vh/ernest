<template>
  <div class="station-popup">
    <strong>{{ name }}</strong>
    <span class="station-type">{{ type }}</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  name: string;
  type: string;
}>();
</script>

<style scoped>
.station-popup {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-family: system-ui, sans-serif;
  font-size: 13px;
}

.station-type {
  color: #666;
  text-transform: capitalize;
}
</style>
