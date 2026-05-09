<template>
  <div class="w-full h-full relative">
    <router-view />
    <Legend v-if="isMapRoute" />

    <router-link
      v-if="isMapRoute"
      to="/activity"
      class="absolute top-3 right-14 z-2 flex h-[34px] w-[34px] items-center justify-center rounded-full border-none bg-white/45 text-[#666] no-underline shadow-sm backdrop-blur-2xl transition-colors hover:bg-white/65 max-sm:top-2 max-sm:right-12"
      title="Activity"
      aria-label="Activity"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    </router-link>

    <AuthButton @open-auth="showAuthModal = true" />
    <AuthModal :visible="showAuthModal" @close="showAuthModal = false" />
    <ListingModal />
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { useRoute } from "vue-router";
import Legend from "@/components/Legend.vue";

import AuthButton from "@/components/AuthButton.vue";
import AuthModal from "@/components/AuthModal.vue";
import ListingModal from "@/components/ListingModal.vue";
import { useAuth } from "@/composables/useAuth";
import { useListingStore } from "@/composables/useListingStore";

const route = useRoute();
const { showAuthModal } = useAuth();
const { syncFromUrl } = useListingStore();

const isMapRoute = computed(() => route.path === "/");

// Sync the listing modal when navigating between routes (e.g. activity → map)
watch(
  () => route.fullPath,
  () => syncFromUrl(),
);
</script>
