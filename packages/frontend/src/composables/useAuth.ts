import { ref } from "vue";
import type { User } from "@/api/auth";
import {
  getMe,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  PasskeyCancelledError,
} from "@/api/auth";

// Module-level singleton state
const user = ref<User | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

let initialized = false;

async function checkSession() {
  if (initialized) return;
  initialized = true;
  loading.value = true;
  try {
    user.value = await getMe();
  } catch {
    user.value = null;
  } finally {
    loading.value = false;
  }
}

export function useAuth() {
  // Check session on first use
  checkSession();

  async function register(username: string) {
    error.value = null;
    try {
      user.value = await apiRegister(username);
    } catch (e) {
      if (e instanceof PasskeyCancelledError) throw e;
      error.value = e instanceof Error ? e.message : "Registration failed";
      throw e;
    }
  }

  async function login() {
    error.value = null;
    try {
      user.value = await apiLogin();
    } catch (e) {
      if (e instanceof PasskeyCancelledError) throw e;
      error.value = e instanceof Error ? e.message : "Login failed";
      throw e;
    }
  }

  async function logout() {
    error.value = null;
    await apiLogout();
    user.value = null;
  }

  return {
    user,
    loading,
    error,
    register,
    login,
    logout,
  };
}
