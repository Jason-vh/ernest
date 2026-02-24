<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="auth-overlay" @click.self="$emit('close')">
        <div class="auth-modal">
          <!-- Header tabs -->
          <div class="auth-tabs">
            <button
              class="auth-tab"
              :class="{ 'auth-tab--active': mode === 'login' }"
              @click="mode = 'login'"
            >
              Sign in
            </button>
            <button
              class="auth-tab"
              :class="{ 'auth-tab--active': mode === 'register' }"
              @click="mode = 'register'"
            >
              Create account
            </button>
          </div>

          <!-- Login mode -->
          <div v-if="mode === 'login'" class="auth-body">
            <p class="auth-hint">
              Use your passkey to sign in.
            </p>
            <button class="auth-action" @click="handleLogin" :disabled="busy">
              <svg class="auth-action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
              </svg>
              {{ busy ? "Waiting for passkey..." : "Sign in with passkey" }}
            </button>
          </div>

          <!-- Register mode -->
          <div v-if="mode === 'register'" class="auth-body">
            <div class="auth-field">
              <label class="auth-field-label" for="auth-username">Username</label>
              <input
                id="auth-username"
                v-model="username"
                class="auth-input"
                type="text"
                placeholder="janssen"
                autocomplete="username"
                maxlength="64"
                :disabled="busy"
                @keydown.enter="handleRegister"
              />
            </div>
            <button
              class="auth-action"
              @click="handleRegister"
              :disabled="busy || !username.trim()"
            >
              <svg class="auth-action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
              </svg>
              {{ busy ? "Waiting for passkey..." : "Create account" }}
            </button>
          </div>

          <!-- Error message -->
          <Transition name="error">
            <div v-if="errorMsg" class="auth-error">
              {{ errorMsg }}
            </div>
          </Transition>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useAuth } from "../composables/useAuth";
import { PasskeyCancelledError } from "../api/auth";

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ close: [] }>();

const { register, login, error: authError } = useAuth();

const mode = ref<"login" | "register">("login");
const username = ref("");
const busy = ref(false);
const errorMsg = ref<string | null>(null);

// Clear error when switching modes
watch(mode, () => {
  errorMsg.value = null;
});

// Clear state when modal closes
watch(
  () => props.visible,
  (v) => {
    if (!v) {
      errorMsg.value = null;
      busy.value = false;
    }
  }
);

// Sync auth composable errors
watch(authError, (val) => {
  if (val) errorMsg.value = val;
});

async function handleLogin() {
  errorMsg.value = null;
  busy.value = true;
  try {
    await login();
    emit("close");
  } catch (e) {
    if (e instanceof PasskeyCancelledError) return;
    errorMsg.value =
      e instanceof Error ? e.message : "Login failed";
  } finally {
    busy.value = false;
  }
}

async function handleRegister() {
  if (!username.value.trim()) return;
  errorMsg.value = null;
  busy.value = true;
  try {
    await register(username.value.trim());
    emit("close");
  } catch (e) {
    if (e instanceof PasskeyCancelledError) return;
    errorMsg.value =
      e instanceof Error ? e.message : "Registration failed";
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.auth-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}

.auth-modal {
  width: 340px;
  max-width: calc(100vw - 32px);
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-radius: 14px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.06);
  font-family: system-ui, -apple-system, sans-serif;
  overflow: hidden;
}

.auth-tabs {
  display: flex;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.auth-tab {
  flex: 1;
  padding: 14px 0;
  border: none;
  background: none;
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #bbb;
  transition: color 0.15s;
  position: relative;
}

.auth-tab:hover {
  color: #888;
}

.auth-tab--active {
  color: #666;
}

.auth-tab--active::after {
  content: "";
  position: absolute;
  bottom: -1px;
  left: 20%;
  right: 20%;
  height: 2px;
  background: #999;
  border-radius: 1px;
}

.auth-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.auth-hint {
  font-size: 13px;
  color: #888;
  margin: 0;
  line-height: 1.4;
}

.auth-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.auth-field-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #999;
}

.auth-input {
  padding: 10px 12px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.5);
  font-family: inherit;
  font-size: 14px;
  color: #333;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.auth-input::placeholder {
  color: #ccc;
}

.auth-input:focus {
  border-color: rgba(0, 0, 0, 0.15);
  box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.04);
}

.auth-action {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  border: none;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.06);
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  color: #555;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}

.auth-action:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.1);
  color: #333;
}

.auth-action:disabled {
  opacity: 0.5;
  cursor: default;
}

.auth-action-icon {
  flex-shrink: 0;
  opacity: 0.6;
}

.auth-error {
  padding: 0 20px 16px;
  font-size: 12px;
  color: #c0392b;
  line-height: 1.4;
}

/* Modal transition */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-active .auth-modal,
.modal-leave-active .auth-modal {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .auth-modal,
.modal-leave-to .auth-modal {
  transform: scale(0.96) translateY(8px);
  opacity: 0;
}

/* Error transition */
.error-enter-active,
.error-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}

.error-enter-from,
.error-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
