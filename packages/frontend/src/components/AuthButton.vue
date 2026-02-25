<template>
  <div
    ref="wrapRef"
    class="absolute top-3 right-3 z-2 font-sans max-sm:top-2 max-sm:right-2"
    v-if="!loading"
  >
    <!-- Logged in: initials avatar -->
    <button
      v-if="user"
      class="flex h-[34px] w-[34px] items-center justify-center rounded-full border-none bg-white/45 p-0 shadow-sm backdrop-blur-2xl transition-colors hover:bg-white/65"
      aria-haspopup="true"
      :aria-expanded="showMenu"
      @click="showMenu = !showMenu"
    >
      <span class="text-[11px] font-bold leading-none tracking-[0.02em] text-[#666]">{{
        initials
      }}</span>
    </button>

    <!-- Logged out: sign in -->
    <button
      v-else
      class="glass flex items-center gap-1.5 border-none px-3.5 py-2 hover:bg-glass"
      @click="$emit('open-auth')"
    >
      <span class="text-[11px] font-semibold uppercase tracking-wide text-[#999]">Sign in</span>
    </button>

    <!-- Dropdown menu when logged in -->
    <Transition name="menu">
      <div
        v-if="showMenu"
        class="absolute top-[calc(100%+6px)] right-0 min-w-[180px] rounded-[10px] bg-white/65 p-2 px-0 text-[13px] shadow-lg backdrop-blur-[20px]"
      >
        <div class="flex flex-col gap-px px-3.5 py-2">
          <span class="text-[13px] font-semibold text-[#333]">{{ user?.username }}</span>
        </div>
        <div class="my-1 h-px bg-black/8"></div>
        <button
          class="block w-full cursor-pointer border-none bg-transparent px-3.5 py-2 text-left font-inherit text-[13px] text-[#666] transition-colors hover:bg-black/4 hover:text-[#333]"
          @click="handleLogout"
        >
          Sign out
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useAuth } from "@/composables/useAuth";

defineEmits<{ "open-auth": [] }>();

const { user, loading, logout } = useAuth();
const showMenu = ref(false);
const wrapRef = ref<HTMLDivElement>();

const initials = computed(() => {
  if (!user.value) return "";
  return user.value.username.slice(0, 2).toUpperCase();
});

function handleLogout() {
  showMenu.value = false;
  logout();
}

function onClickOutside(e: MouseEvent) {
  if (e.target instanceof Node && !wrapRef.value?.contains(e.target)) {
    showMenu.value = false;
  }
}

onMounted(() => document.addEventListener("click", onClickOutside));
onUnmounted(() => document.removeEventListener("click", onClickOutside));
</script>

<style scoped>
.menu-enter-active,
.menu-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.menu-enter-from,
.menu-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
