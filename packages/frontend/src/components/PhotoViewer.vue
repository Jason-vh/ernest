<template>
  <div class="fixed inset-0 z-200 bg-black/95" @click.self="close">
    <div ref="emblaRef" class="h-full w-full overflow-hidden">
      <div class="embla__container">
        <div v-for="(src, i) in photos" :key="i" class="embla__slide" @click="close">
          <img
            v-if="shouldRenderSlide(i)"
            :src="src"
            :alt="`Photo ${i + 1}`"
            class="max-h-[90vh] max-w-[92vw] rounded-sm object-contain"
            :loading="i === selectedIndex ? 'eager' : 'lazy'"
            @click.stop
          />
        </div>
      </div>
    </div>

    <button
      class="absolute top-4 right-4 z-10 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-black/55 text-white/85 transition-colors hover:bg-black/70 hover:text-white"
      @click="close"
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

    <button
      v-if="canScrollPrev"
      class="absolute left-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-black/55 text-white transition-colors hover:bg-black/70"
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
      class="absolute right-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-black/55 text-white transition-colors hover:bg-black/70"
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

    <div
      class="absolute bottom-5 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/55 px-3.5 py-1.5 text-[13px] tabular-nums text-white/85"
    >
      {{ selectedIndex + 1 }} / {{ photos.length }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import EmblaCarousel, { type EmblaCarouselType } from "embla-carousel";

const props = defineProps<{ photos: string[]; initialIndex: number }>();
const emit = defineEmits<{ close: []; select: [index: number] }>();

const emblaRef = ref<HTMLDivElement>();
const selectedIndex = ref(props.initialIndex);
const canScrollPrev = ref(false);
const canScrollNext = ref(false);
let embla: EmblaCarouselType | null = null;

function shouldRenderSlide(index: number) {
  return Math.abs(index - selectedIndex.value) <= 1;
}

function updateScrollState() {
  if (!embla) return;
  selectedIndex.value = embla.selectedScrollSnap();
  canScrollPrev.value = embla.canScrollPrev();
  canScrollNext.value = embla.canScrollNext();
  emit("select", selectedIndex.value);
}

function scrollPrev() {
  embla?.scrollPrev();
}

function scrollNext() {
  embla?.scrollNext();
}

function close() {
  emit("close");
}

function onKeydown(e: KeyboardEvent) {
  if (!embla) return;
  if (e.key === "ArrowLeft") embla.scrollPrev();
  else if (e.key === "ArrowRight") embla.scrollNext();
  else if (e.key === "Escape") {
    e.stopImmediatePropagation();
    close();
  }
}

onMounted(() => {
  document.addEventListener("keydown", onKeydown);
  nextTick(() => {
    if (!emblaRef.value) return;
    embla = EmblaCarousel(emblaRef.value, { loop: false, startIndex: props.initialIndex });
    embla.on("select", updateScrollState);
    updateScrollState();
  });
});

onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeydown);
  embla?.destroy();
});
</script>

<style scoped>
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
</style>
