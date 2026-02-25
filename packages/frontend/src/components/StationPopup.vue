<template>
  <div class="flex flex-col gap-0.5 font-sans text-[13px]">
    <strong>{{ name }}</strong>
    <span class="capitalize text-[#666]">{{ type }}</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  name: string;
  type: string;
}>();
</script>
