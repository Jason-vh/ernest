<template>
  <!-- Single photo: full-width hero -->
  <button v-if="photos.length === 1" class="hero-single" @click="emit('open-photo', 0)">
    <img :src="photos[0]" alt="Photo 1" />
  </button>

  <!-- Multiple photos: horizontally scrolling masonry -->
  <div v-else class="masonry-scroll" style="scrollbar-width: none">
    <div class="masonry-track">
      <template v-for="(col, ci) in columns" :key="ci">
        <!-- Single full-height photo -->
        <button
          v-if="col.length === 1"
          class="masonry-full"
          @click="emit('open-photo', col[0].index)"
        >
          <img :src="col[0].src" :alt="`Photo ${col[0].index + 1}`" loading="lazy" />
        </button>
        <!-- Pair of half-height photos stacked -->
        <div v-else class="masonry-pair">
          <button
            v-for="item in col"
            :key="item.index"
            class="masonry-half"
            @click="emit('open-photo', item.index)"
          >
            <img :src="item.src" :alt="`Photo ${item.index + 1}`" loading="lazy" />
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

interface PhotoItem {
  src: string;
  index: number;
}

const props = defineProps<{ photos: string[] }>();
const emit = defineEmits<{ "open-photo": [index: number] }>();

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
</script>

<style scoped>
.hero-single {
  display: block;
  width: 100%;
  height: min(260px, 38dvh);
  padding: 0;
  border: none;
  background: #e5e5e5;
  cursor: pointer;
  overflow: hidden;
}

@media (min-width: 640px) {
  .hero-single {
    height: 260px;
  }
}

.hero-single img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: filter 0.15s ease;
}

.hero-single:hover img {
  filter: brightness(0.92);
}

.masonry-scroll {
  overflow-x: auto;
  overscroll-behavior-x: contain;
}

.masonry-track {
  display: flex;
  gap: 2px;
  height: min(260px, 38dvh);
}

@media (min-width: 640px) {
  .masonry-track {
    height: 260px;
  }
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
</style>
