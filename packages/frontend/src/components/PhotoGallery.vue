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
      <div v-if="fullscreenOpen" class="fixed inset-0 z-200 bg-black/92">
        <!-- Embla carousel -->
        <div ref="emblaRef" class="h-full w-full overflow-hidden">
          <div class="embla__container">
            <div v-for="(src, i) in photos" :key="i" class="embla__slide" @click="closeFullscreen">
              <img
                :src="src"
                :alt="`Photo ${i + 1}`"
                class="max-h-[90vh] max-w-[92vw] rounded-sm object-contain"
                @click.stop
              />
            </div>
          </div>
        </div>

        <!-- Close -->
        <button
          class="absolute top-4 right-4 z-10 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-none bg-white/12 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
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
          v-if="canScrollPrev"
          class="absolute left-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
          @click.stop="scrollPrev"
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
          v-if="canScrollNext"
          class="absolute right-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
          @click.stop="scrollNext"
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
          class="absolute bottom-5 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/50 px-3.5 py-1.5 text-[13px] tabular-nums text-white/80 backdrop-blur-sm"
        >
          {{ selectedIndex + 1 }} / {{ photos.length }}
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onBeforeUnmount } from "vue";
import EmblaCarousel, { type EmblaCarouselType } from "embla-carousel";

interface PhotoItem {
  src: string;
  index: number;
}

const props = defineProps<{ photos: string[] }>();

const emblaRef = ref<HTMLDivElement>();
const fullscreenOpen = ref(false);
const selectedIndex = ref(0);
const canScrollPrev = ref(false);
const canScrollNext = ref(false);
let embla: EmblaCarouselType | null = null;

// Group photos into columns: full (1 photo) | pair (2 photos) | full | pair ...
const columns = computed(() => {
  const cols: PhotoItem[][] = [];
  let i = 0;
  let isFull = true;
  while (i < props.photos.length) {
    if (isFull || i + 1 >= props.photos.length) {
      cols.push([{ src: props.photos[i], index: i }]);
      i++;
    } else {
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

function updateScrollState() {
  if (!embla) return;
  selectedIndex.value = embla.selectedScrollSnap();
  canScrollPrev.value = embla.canScrollPrev();
  canScrollNext.value = embla.canScrollNext();
}

function scrollPrev() {
  embla?.scrollPrev();
}

function scrollNext() {
  embla?.scrollNext();
}

function onKeydown(e: KeyboardEvent) {
  if (!fullscreenOpen.value || !embla) return;
  if (e.key === "ArrowLeft") embla.scrollPrev();
  else if (e.key === "ArrowRight") embla.scrollNext();
  else if (e.key === "Escape") closeFullscreen();
}

document.addEventListener("keydown", onKeydown);
onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeydown);
  embla?.destroy();
});

let previouslyFocused: HTMLElement | null = null;

function openFullscreen(index: number) {
  previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  selectedIndex.value = index;
  fullscreenOpen.value = true;
  nextTick(() => {
    if (!emblaRef.value) return;
    embla = EmblaCarousel(emblaRef.value, { loop: false, startIndex: index });
    embla.on("select", updateScrollState);
    updateScrollState();
  });
}

function closeFullscreen() {
  embla?.destroy();
  embla = null;
  fullscreenOpen.value = false;
  nextTick(() => {
    if (previouslyFocused) {
      previouslyFocused.focus();
    } else {
      document.querySelector<HTMLElement>("[role='dialog']")?.focus();
    }
  });
}
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

.embla__container {
  display: flex;
  height: 100%;
}

.embla__slide {
  flex: 0 0 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
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
