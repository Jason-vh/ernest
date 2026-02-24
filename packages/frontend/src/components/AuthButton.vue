<template>
  <div class="auth-button-wrap" v-if="!loading">
    <!-- Logged in: initials avatar -->
    <button v-if="user" class="auth-btn auth-btn--avatar" @click="showMenu = !showMenu">
      <span class="avatar-initials">{{ initials }}</span>
    </button>

    <!-- Logged out: sign in -->
    <button v-else class="auth-btn auth-btn--signin" @click="$emit('open-auth')">
      <span class="auth-label">Sign in</span>
    </button>

    <!-- Dropdown menu when logged in -->
    <Transition name="menu">
      <div v-if="showMenu" class="auth-menu">
        <div class="auth-menu-user">
          <span class="auth-menu-name">{{ user?.username }}</span>
        </div>
        <div class="auth-menu-divider"></div>
        <button class="auth-menu-item" @click="handleLogout">Sign out</button>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useAuth } from "../composables/useAuth";

defineEmits<{ "open-auth": [] }>();

const { user, loading, logout } = useAuth();
const showMenu = ref(false);

const initials = computed(() => {
  if (!user.value) return "";
  return user.value.username.slice(0, 2).toUpperCase();
});

function handleLogout() {
  showMenu.value = false;
  logout();
}

function onClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (!target.closest(".auth-button-wrap")) {
    showMenu.value = false;
  }
}

onMounted(() => document.addEventListener("click", onClickOutside));
onUnmounted(() => document.removeEventListener("click", onClickOutside));
</script>

<style scoped>
.auth-button-wrap {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 2;
  font-family: system-ui, -apple-system, sans-serif;
}

.auth-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  border: none;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.auth-btn--signin {
  background: rgba(255, 255, 255, 0.35);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 10px;
  padding: 8px 14px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.auth-btn--signin:hover {
  background: rgba(255, 255, 255, 0.55);
}

.auth-icon {
  color: #999;
  flex-shrink: 0;
}

.auth-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #999;
}

.auth-btn--avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.45);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  padding: 0;
  justify-content: center;
}

.auth-btn--avatar:hover {
  background: rgba(255, 255, 255, 0.65);
}

.avatar-initials {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: #666;
  line-height: 1;
}

.auth-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 180px;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 10px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
  padding: 8px 0;
  font-size: 13px;
}

.auth-menu-user {
  padding: 8px 14px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.auth-menu-name {
  font-weight: 600;
  color: #333;
  font-size: 13px;
}

.auth-menu-username {
  font-size: 11px;
  color: #999;
}

.auth-menu-divider {
  height: 1px;
  background: rgba(0, 0, 0, 0.08);
  margin: 4px 0;
}

.auth-menu-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 14px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  color: #666;
  transition: background-color 0.1s;
}

.auth-menu-item:hover {
  background: rgba(0, 0, 0, 0.04);
  color: #333;
}

/* Menu transition */
.menu-enter-active,
.menu-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.menu-enter-from,
.menu-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 640px) {
  .auth-button-wrap {
    top: 8px;
    right: 8px;
  }
}
</style>
