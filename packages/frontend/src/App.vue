<template>
  <div class="w-full h-full relative">
    <MapView />
    <Legend />
    <FundaFilters />
    <AuthButton @open-auth="showAuth = true" />
    <AuthModal :visible="showAuth" @close="showAuth = false" />
    <ListingModal />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import MapView from "@/components/MapView.vue";
import Legend from "@/components/Legend.vue";
import FundaFilters from "@/components/FundaFilters.vue";
import AuthButton from "@/components/AuthButton.vue";
import AuthModal from "@/components/AuthModal.vue";
import ListingModal from "@/components/ListingModal.vue";

const showAuth = ref(false);
</script>
