<template>
  <div class="flex h-full flex-col bg-[#f5f5f5]">
    <!-- Header -->
    <header
      class="flex items-center gap-3 border-b border-black/8 bg-white/80 px-5 py-4 backdrop-blur-lg"
    >
      <router-link
        to="/"
        class="flex h-8 w-8 items-center justify-center rounded-full text-[#666] no-underline transition-colors hover:bg-black/5"
        aria-label="Back to map"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      </router-link>
      <h1 class="text-[17px] font-semibold text-[#333]">Manage Listings</h1>
    </header>

    <div class="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-5 py-6">
      <!-- Add form -->
      <form class="glass mb-6 flex gap-2 p-4" @submit.prevent="handleAdd">
        <input
          v-model="newUrl"
          type="url"
          placeholder="https://www.funda.nl/detail/koop/..."
          class="flex-1 rounded-lg border border-black/10 bg-white/60 px-3 py-2 text-[14px] text-[#333] outline-none transition-colors placeholder:text-[#aaa] focus:border-[#E8950F]/50 focus:ring-1 focus:ring-[#E8950F]/30"
          :disabled="adding"
        />
        <button
          type="submit"
          class="rounded-lg border-none bg-[#E8950F] px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-[#d4870e] disabled:opacity-50"
          :disabled="adding || !newUrl.trim()"
        >
          {{ adding ? "Adding..." : "Add" }}
        </button>
      </form>

      <p v-if="addError" class="mb-4 text-[13px] text-red-600">{{ addError }}</p>

      <!-- Loading state -->
      <div v-if="loadingList" class="py-8 text-center text-[13px] text-[#999]">Loading...</div>

      <!-- Empty state -->
      <div v-else-if="items.length === 0" class="py-8 text-center text-[13px] text-[#999]">
        No manual listings yet. Paste a Funda URL above to add one.
      </div>

      <!-- Listings list -->
      <div v-else class="flex flex-col gap-3">
        <div v-for="item in items" :key="item.id" class="glass flex items-center gap-4 p-4">
          <!-- Thumbnail -->
          <div class="h-14 w-14 flex-none overflow-hidden rounded-lg bg-black/5">
            <img
              v-if="item.photos && item.photos.length > 0"
              :src="item.photos[0]"
              class="h-full w-full object-cover"
              alt=""
            />
          </div>

          <!-- Info -->
          <div class="min-w-0 flex-1">
            <p class="truncate text-[14px] font-medium text-[#333]">
              {{ item.address || shortenUrl(item.url) }}
            </p>
            <p v-if="item.price" class="text-[13px] text-[#666]">
              {{ formatPrice(item.price) }}
            </p>
            <div class="mt-1 flex items-center gap-2">
              <span
                class="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium"
                :class="statusClasses(item.status)"
              >
                {{ item.status }}
              </span>
              <span v-if="item.error" class="truncate text-[11px] text-red-500">{{
                item.error
              }}</span>
            </div>
          </div>

          <!-- Remove button -->
          <button
            class="flex-none cursor-pointer rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-[12px] text-[#999] transition-colors hover:bg-red-50 hover:text-red-600"
            :disabled="removing === item.id"
            @click="handleRemove(item.id)"
          >
            {{ removing === item.id ? "..." : "Remove" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import {
  addManualListing,
  getManualListings,
  removeManualListing,
  type ManualListingRow,
} from "@/api/client";

const items = ref<ManualListingRow[]>([]);
const loadingList = ref(true);
const newUrl = ref("");
const adding = ref(false);
const addError = ref<string | null>(null);
const removing = ref<number | null>(null);

async function loadItems() {
  try {
    items.value = await getManualListings();
  } finally {
    loadingList.value = false;
  }
}

async function handleAdd() {
  if (!newUrl.value.trim()) return;
  adding.value = true;
  addError.value = null;
  try {
    await addManualListing(newUrl.value.trim());
    newUrl.value = "";
    await loadItems();
  } catch (e) {
    addError.value = e instanceof Error ? e.message : "Failed to add";
  } finally {
    adding.value = false;
  }
}

async function handleRemove(id: number) {
  removing.value = id;
  try {
    await removeManualListing(id);
    items.value = items.value.filter((i) => i.id !== id);
  } finally {
    removing.value = null;
  }
}

function shortenUrl(url: string): string {
  try {
    return new URL(url).pathname.replace(/\/$/, "").split("/").pop() ?? url;
  } catch {
    return url;
  }
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(price);
}

function statusClasses(status: string): string {
  if (status === "fetched") return "bg-green-100 text-green-700";
  if (status === "failed") return "bg-red-100 text-red-600";
  return "bg-amber-100 text-amber-700";
}

onMounted(loadItems);
</script>
