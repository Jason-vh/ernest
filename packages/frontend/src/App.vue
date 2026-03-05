<template>
  <div class="w-full h-full relative">
    <router-view />
    <Legend v-if="isMapRoute" />

    <AuthButton @open-auth="showAuthModal = true" />
    <AuthModal :visible="showAuthModal" @close="showAuthModal = false" />
    <ListingModal />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import Legend from "@/components/Legend.vue";

import AuthButton from "@/components/AuthButton.vue";
import AuthModal from "@/components/AuthModal.vue";
import ListingModal from "@/components/ListingModal.vue";
import { useAuth } from "@/composables/useAuth";

const route = useRoute();
const { showAuthModal } = useAuth();

const isMapRoute = computed(() => route.path === "/");
</script>
