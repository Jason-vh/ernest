<template>
  <!-- Horizontally scrolling masonry: full | pair | full | pair ... -->
  <div class="masonry-scroll" style="scrollbar-width: none">
    <div class="masonry-track">
      <template v-for="(col, ci) in columns" :key="ci">
        <!-- Single full-height photo -->
        <button v-if="col.length === 1" class="masonry-full" @click="openFullscreen(col[0].index)">
          <img :src="col[0].src" :alt="`Photo ${col[0].index + 1}`" loading="lazy" />
        </button>
        <!-- Pair of half-height photos stacked -->
        <div v-else class="masonry-pair">
          <button
            v-for="item in col"
            :key="item.index"
            class="masonry-half"
            @click="openFullscreen(item.index)"
          >
            <img :src="item.src" :alt="`Photo ${item.index + 1}`" loading="lazy" />
          </button>
        </div>
      </template>
    </div>
  </div>

  <!-- Fullscreen overlay -->
  <Teleport to="body">
    <Transition name="fullscreen">
      <div
        v-if="fullscreenIndex !== null"
        ref="overlayRef"
        tabindex="0"
        class="fixed inset-0 z-200 flex items-center justify-center bg-black/92 outline-none"
        @click.self="closeFullscreen"
        @keydown.escape.stop="closeFullscreen"
        @keydown.left="prevPhoto"
        @keydown.right="nextPhoto"
      >
        <img
          :src="photos[fullscreenIndex]"
          :alt="`Photo ${fullscreenIndex + 1}`"
          class="max-h-[90vh] max-w-[92vw] rounded-sm object-contain"
        />

        <!-- Close -->
        <button
          class="absolute top-4 right-4 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-none bg-white/12 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
          @click="closeFullscreen"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <!-- Nav arrows -->
        <button
          v-if="fullscreenIndex > 0"
          class="absolute left-3 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-none bg-white/12 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
          @click.stop="prevPhoto"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <button
          v-if="fullscreenIndex < photos.length - 1"
          class="absolute right-3 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-none bg-white/12 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
          @click.stop="nextPhoto"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>

        <!-- Counter -->
        <div
          class="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3.5 py-1.5 text-[13px] tabular-nums text-white/80 backdrop-blur-sm"
        >
          {{ fullscreenIndex + 1 }} / {{ photos.length }}
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";

interface PhotoItem {
  src: string;
  index: number;
}

const props = defineProps<{ photos: string[] }>();

const overlayRef = ref<HTMLDivElement>();
const fullscreenIndex = ref<number | null>(null);

// Group photos into columns: full (1 photo) | pair (2 photos) | full | pair ...
const columns = computed(() => {
  const cols: PhotoItem[][] = [];
  let i = 0;
  let isFull = true;
  while (i < props.photos.length) {
    if (isFull || i + 1 >= props.photos.length) {
      // Single full-height column (or last remaining photo)
      cols.push([{ src: props.photos[i], index: i }]);
      i++;
    } else {
      // Pair of two stacked
      cols.push([
        { src: props.photos[i], index: i },
        { src: props.photos[i + 1], index: i + 1 },
      ]);
      i += 2;
    }
    isFull = !isFull;
  }
  return cols;
});

let previouslyFocused: HTMLElement | null = null;

function openFullscreen(index: number) {
  previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  fullscreenIndex.value = index;
}

function closeFullscreen() {
  fullscreenIndex.value = null;
  nextTick(() => {
    // Return focus to the modal so Escape continues to work
    if (previouslyFocused) {
      previouslyFocused.focus();
    } else {
      // Fall back to the closest dialog ancestor
      document.querySelector<HTMLElement>("[role='dialog']")?.focus();
    }
  });
}

function prevPhoto() {
  if (fullscreenIndex.value !== null && fullscreenIndex.value > 0) {
    fullscreenIndex.value--;
  }
}

function nextPhoto() {
  if (fullscreenIndex.value !== null && fullscreenIndex.value < props.photos.length - 1) {
    fullscreenIndex.value++;
  }
}

// Focus the fullscreen overlay for keyboard nav
watch(fullscreenIndex, (v) => {
  if (v !== null) {
    nextTick(() => {
      overlayRef.value?.focus();
    });
  }
});
</script>

<style scoped>
.masonry-scroll {
  overflow-x: auto;
  overscroll-behavior-x: contain;
}

.masonry-track {
  display: flex;
  gap: 2px;
  height: 260px;
}

.masonry-full {
  display: block;
  flex-shrink: 0;
  height: 100%;
  padding: 0;
  border: none;
  background: #e5e5e5;
  cursor: pointer;
}

.masonry-full img {
  display: block;
  height: 100%;
  width: auto;
  object-fit: cover;
  transition: filter 0.15s ease;
}

.masonry-full:hover img {
  filter: brightness(0.92);
}

.masonry-pair {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 2px;
  height: 100%;
}

.masonry-half {
  display: block;
  height: calc(50% - 1px);
  padding: 0;
  border: none;
  background: #e5e5e5;
  cursor: pointer;
  overflow: hidden;
}

.masonry-half img {
  display: block;
  height: 100%;
  width: auto;
  min-width: 100%;
  object-fit: cover;
  transition: filter 0.15s ease;
}

.masonry-half:hover img {
  filter: brightness(0.92);
}

.fullscreen-enter-active,
.fullscreen-leave-active {
  transition: opacity 0.2s ease;
}

.fullscreen-enter-from,
.fullscreen-leave-to {
  opacity: 0;
}
</style>
