<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="visible"
        class="fixed inset-0 z-100 flex items-center justify-center bg-black/20 backdrop-blur-[2px]"
        @click.self="$emit('close')"
        @keydown.escape="$emit('close')"
      >
        <div
          ref="modalRef"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-modal-title"
          class="modal-panel w-[340px] max-w-[calc(100vw-32px)] overflow-hidden rounded-[14px] bg-glass-strong font-sans shadow-[0_8px_40px_rgba(0,0,0,0.12),0_1px_3px_rgba(0,0,0,0.06)] backdrop-blur-[24px]"
          @keydown="trapFocus"
        >
          <!-- Header tabs -->
          <div class="flex border-b border-black/6">
            <button
              id="auth-modal-title"
              class="relative flex-1 cursor-pointer border-none bg-transparent py-3.5 font-inherit text-[11px] font-semibold uppercase tracking-wide transition-colors"
              :class="mode === 'login' ? 'text-[#444]' : 'text-[#999] hover:text-[#666]'"
              @click="mode = 'login'"
            >
              Sign in
              <span
                v-if="mode === 'login'"
                class="absolute bottom-[-1px] left-1/5 right-1/5 h-0.5 rounded-sm bg-[#666]"
              ></span>
            </button>
            <button
              class="relative flex-1 cursor-pointer border-none bg-transparent py-3.5 font-inherit text-[11px] font-semibold uppercase tracking-wide transition-colors"
              :class="mode === 'register' ? 'text-[#444]' : 'text-[#999] hover:text-[#666]'"
              @click="mode = 'register'"
            >
              Create account
              <span
                v-if="mode === 'register'"
                class="absolute bottom-[-1px] left-1/5 right-1/5 h-0.5 rounded-sm bg-[#666]"
              ></span>
            </button>
          </div>

          <!-- Login mode -->
          <div v-if="mode === 'login'" class="flex flex-col gap-3.5 p-5">
            <p class="m-0 text-[13px] leading-[1.4] text-[#666]">Use your passkey to sign in.</p>
            <button
              class="flex cursor-pointer items-center justify-center gap-2 rounded-[10px] border-none bg-black/10 px-4 py-3 font-inherit text-[13px] font-semibold text-[#333] transition-colors hover:not-disabled:bg-black/15 hover:not-disabled:text-[#111] disabled:cursor-default disabled:opacity-50"
              @click="handleLogin"
              :disabled="busy"
            >
              {{ busy ? "Waiting for passkey..." : "Sign in with passkey" }}
            </button>
          </div>

          <!-- Register mode -->
          <div v-if="mode === 'register'" class="flex flex-col gap-3.5 p-5">
            <div class="flex flex-col gap-1">
              <label
                class="text-[11px] font-semibold uppercase tracking-wide text-[#777]"
                for="auth-username"
                >Username</label
              >
              <input
                id="auth-username"
                v-model="username"
                class="rounded-lg border border-black/12 bg-white/60 px-3 py-2.5 font-inherit text-sm text-[#222] outline-none transition-[border-color,box-shadow] placeholder:text-[#aaa] focus:border-black/20 focus:shadow-[0_0_0_3px_rgba(0,0,0,0.04)]"
                type="text"
                placeholder="janssen"
                autocomplete="username"
                maxlength="64"
                :disabled="busy"
                @keydown.enter="handleRegister"
              />
            </div>
            <button
              class="flex cursor-pointer items-center justify-center gap-2 rounded-[10px] border-none bg-black/10 px-4 py-3 font-inherit text-[13px] font-semibold text-[#333] transition-colors hover:not-disabled:bg-black/15 hover:not-disabled:text-[#111] disabled:cursor-default disabled:opacity-50"
              @click="handleRegister"
              :disabled="busy || !username.trim()"
            >
              {{ busy ? "Waiting for passkey..." : "Create account" }}
            </button>
          </div>

          <!-- Error message -->
          <Transition name="error">
            <div v-if="errorMsg" class="px-5 pb-4 text-xs leading-[1.4] text-[#c0392b]">
              {{ errorMsg }}
            </div>
          </Transition>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import { useAuth } from "@/composables/useAuth";
import { PasskeyCancelledError } from "@/api/auth";

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ close: [] }>();

const { register, login, error: authError } = useAuth();

const mode = ref<"login" | "register">("login");
const username = ref("");
const busy = ref(false);
const errorMsg = ref<string | null>(null);
const modalRef = ref<HTMLDivElement>();

// Clear error when switching modes
watch(mode, () => {
  errorMsg.value = null;
});

// Clear state when modal closes; focus trap on open
watch(
  () => props.visible,
  (v) => {
    if (!v) {
      errorMsg.value = null;
      busy.value = false;
    } else {
      nextTick(() => {
        const first = modalRef.value?.querySelector<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
        );
        first?.focus();
      });
    }
  },
);

// Sync auth composable errors
watch(authError, (val) => {
  if (val) errorMsg.value = val;
});

function trapFocus(e: KeyboardEvent) {
  if (e.key !== "Tab" || !modalRef.value) return;
  const focusable = modalRef.value.querySelectorAll<HTMLElement>(
    "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
  );
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

async function handleLogin() {
  errorMsg.value = null;
  busy.value = true;
  try {
    await login();
    emit("close");
  } catch (e) {
    if (e instanceof PasskeyCancelledError) return;
    errorMsg.value = e instanceof Error ? e.message : "Login failed";
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
    errorMsg.value = e instanceof Error ? e.message : "Registration failed";
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
/* Modal transition */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-active .modal-panel,
.modal-leave-active .modal-panel {
  transition:
    transform 0.2s ease,
    opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-panel,
.modal-leave-to .modal-panel {
  transform: scale(0.96) translateY(8px);
  opacity: 0;
}

/* Error transition */
.error-enter-active,
.error-leave-active {
  transition:
    opacity 0.15s,
    transform 0.15s;
}

.error-enter-from,
.error-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
