<template>
  <div class="w-full h-full relative">
    <MapView />
    <Legend />
    <FundaFilters />
    <AuthButton @open-auth="showAuthModal = true" />
    <AuthModal :visible="showAuthModal" @close="showAuthModal = false" />
    <ListingModal />
  </div>
</template>

<script setup lang="ts">
import MapView from "@/components/MapView.vue";
import Legend from "@/components/Legend.vue";
import FundaFilters from "@/components/FundaFilters.vue";
import AuthButton from "@/components/AuthButton.vue";
import AuthModal from "@/components/AuthModal.vue";
import ListingModal from "@/components/ListingModal.vue";
import { useAuth } from "@/composables/useAuth";

const { showAuthModal } = useAuth();
</script>
