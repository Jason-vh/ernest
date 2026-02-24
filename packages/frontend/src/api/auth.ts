import { startRegistration, startAuthentication } from "@simplewebauthn/browser";

export class PasskeyCancelledError extends Error {
  constructor() {
    super("Cancelled");
    this.name = "PasskeyCancelledError";
  }
}

function rethrowIfCancelled(e: unknown): never {
  if (e instanceof Error && e.name === "NotAllowedError") {
    throw new PasskeyCancelledError();
  }
  throw e;
}

export interface User {
  id: string;
  username: string;
}

async function post(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : {},
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

export async function register(username: string): Promise<User> {
  // 1. Get registration options
  const optionsRes = await post("/api/auth/register/options", {
    username,
  });
  if (!optionsRes.ok) {
    const err = await optionsRes.json();
    throw new Error(err.error || "Failed to start registration");
  }
  const options = await optionsRes.json();

  // 2. Create passkey via browser (throws PasskeyCancelledError if user cancels)
  const attestation = await startRegistration({ optionsJSON: options }).catch(rethrowIfCancelled);

  // 3. Send attestation to server
  const verifyRes = await post("/api/auth/register/verify", attestation);
  if (!verifyRes.ok) {
    const err = await verifyRes.json();
    throw new Error(err.error || "Registration verification failed");
  }
  const result = await verifyRes.json();
  return result.user;
}

export async function login(): Promise<User> {
  // 1. Get authentication options
  const optionsRes = await post("/api/auth/login/options");
  if (!optionsRes.ok) {
    const err = await optionsRes.json();
    throw new Error(err.error || "Failed to start login");
  }
  const options = await optionsRes.json();

  // 2. Authenticate via browser (throws PasskeyCancelledError if user cancels)
  const assertion = await startAuthentication({ optionsJSON: options }).catch(rethrowIfCancelled);

  // 3. Send assertion to server
  const verifyRes = await post("/api/auth/login/verify", assertion);
  if (!verifyRes.ok) {
    const err = await verifyRes.json();
    throw new Error(err.error || "Login verification failed");
  }
  const result = await verifyRes.json();
  return result.user;
}

export async function logout(): Promise<void> {
  await post("/api/auth/logout");
}

export async function getMe(): Promise<User | null> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (!res.ok) return null;
  return res.json();
}
