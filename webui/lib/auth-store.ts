"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { WEBUI, tClient } from "./i18n";

export interface Endpoint {
  id: string;
  name: string;
  url: string;
  requiresAuth: boolean;
  username: string;
  password: string;
}

const defaultEndpoint: Endpoint = {
  id: "local",
  name: "Local OxiDNS",
  url: "/api",
  requiresAuth: false,
  username: "",
  password: "",
};

let endpointIdSequence = 0;

/**
 * Generate an endpoint identifier without relying on Crypto.randomUUID().
 *
 * The WebUI is commonly served over plain HTTP on a LAN. Browsers do not
 * expose randomUUID() in those non-secure contexts, so using it directly made
 * the Add Endpoint action throw before Zustand could persist the endpoint.
 */
function createEndpointId(): string {
  endpointIdSequence += 1;
  return `endpoint-${Date.now().toString(36)}-${endpointIdSequence.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

interface ConnectionResult {
  ok: boolean;
  error?: string;
  requiresAuth?: boolean;
}

export interface AuthState {
  endpoints: Endpoint[];
  activeEndpointId: string;
  isAuthenticated: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  isHydrated: boolean;
  connectionEpoch: number;
  hasAttemptedAutoConnect: boolean;
  connectionError: string | null;
  needsCredentials: boolean;
  rememberLogin: boolean;
  addEndpoint: (endpoint: Omit<Endpoint, "id">) => string;
  updateEndpoint: (id: string, endpoint: Omit<Endpoint, "id">) => void;
  deleteEndpoint: (id: string) => void;
  switchEndpoint: (id: string) => Promise<boolean>;
  connect: (endpoint?: Endpoint) => Promise<boolean>;
  testEndpoint: (endpoint: Endpoint) => Promise<ConnectionResult>;
  attemptAutoConnect: () => Promise<void>;
  markHydrated: () => void;
  setRememberLogin: (remember: boolean) => void;
  logout: () => void;
}

export function activeEndpoint(state = useAuthStore.getState()): Endpoint {
  return (
    state.endpoints.find(
      (endpoint) => endpoint.id === state.activeEndpointId,
    ) ??
    state.endpoints[0] ??
    defaultEndpoint
  );
}

async function probeEndpoint(endpoint: Endpoint): Promise<ConnectionResult> {
  const url = endpoint.url.trim();
  if (!url)
    return { ok: false, error: tClient(WEBUI.storeErrors.serviceUrlRequired) };
  if (endpoint.requiresAuth && (!endpoint.username || !endpoint.password)) {
    return { ok: false, requiresAuth: true };
  }
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (endpoint.requiresAuth) {
      headers.Authorization = `Basic ${btoa(`${endpoint.username}:${endpoint.password}`)}`;
    }
    const response = await fetch(`${url.replace(/\/$/, "")}/health`, {
      headers,
    });
    if (response.status === 401) {
      return {
        ok: false,
        requiresAuth: true,
        error:
          endpoint.username && endpoint.password
            ? tClient(WEBUI.storeErrors.invalidCredentials)
            : undefined,
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        error: tClient(WEBUI.storeErrors.connectionHttpFailed, {
          status: response.status,
        }),
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : tClient(WEBUI.storeErrors.connectionFailed),
    };
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      endpoints: [defaultEndpoint],
      activeEndpointId: defaultEndpoint.id,
      isAuthenticated: false,
      isConnected: false,
      isConnecting: false,
      isHydrated: false,
      connectionEpoch: 0,
      hasAttemptedAutoConnect: false,
      connectionError: null,
      needsCredentials: false,
      rememberLogin: true,

      addEndpoint: (endpoint) => {
        const id = createEndpointId();
        set((state) => ({
          endpoints: [...state.endpoints, { ...endpoint, id }],
        }));
        return id;
      },
      updateEndpoint: (id, endpoint) =>
        set((state) => ({
          endpoints: state.endpoints.map((item) =>
            item.id === id ? { ...endpoint, id } : item,
          ),
          ...(id === state.activeEndpointId
            ? { isConnected: false, isAuthenticated: false }
            : {}),
        })),
      deleteEndpoint: (id) =>
        set((state) => {
          const endpoints = state.endpoints.filter(
            (endpoint) => endpoint.id !== id,
          );
          const next = endpoints[0] ?? defaultEndpoint;
          return {
            endpoints: endpoints.length ? endpoints : [next],
            activeEndpointId:
              id === state.activeEndpointId ? next.id : state.activeEndpointId,
            ...(id === state.activeEndpointId
              ? {
                  isConnected: false,
                  isAuthenticated: false,
                  connectionEpoch: state.connectionEpoch + 1,
                }
              : {}),
          };
        }),
      switchEndpoint: async (id) => {
        if (!get().endpoints.some((endpoint) => endpoint.id === id))
          return false;
        set((state) => ({
          activeEndpointId: id,
          isConnected: false,
          isAuthenticated: false,
          isConnecting: true,
          connectionError: null,
          needsCredentials: false,
          connectionEpoch: state.connectionEpoch + 1,
        }));
        return get().connect();
      },
      testEndpoint: probeEndpoint,
      setRememberLogin: (rememberLogin) => set({ rememberLogin }),
      logout: () =>
        set((state) => ({
          isConnected: false,
          isAuthenticated: false,
          needsCredentials: true,
          connectionError: null,
          endpoints: state.endpoints.map((endpoint) =>
            endpoint.id === state.activeEndpointId
              ? { ...endpoint, password: "" }
              : endpoint,
          ),
        })),
      connect: async (candidate) => {
        set({ isConnecting: true, connectionError: null });
        const endpoint = candidate ?? activeEndpoint(get());
        const result = await probeEndpoint(endpoint);
        if (!result.ok) {
          set({
            isConnected: false,
            isAuthenticated: false,
            isConnecting: false,
            needsCredentials: result.requiresAuth === true,
            connectionError: result.error ?? null,
            endpoints: result.requiresAuth
              ? get().endpoints.map((item) =>
                  item.id === endpoint.id
                    ? { ...item, requiresAuth: true }
                    : item,
                )
              : get().endpoints,
          });
          return false;
        }
        set((state) => ({
          endpoints: state.endpoints.map((item) =>
            item.id === endpoint.id ? endpoint : item,
          ),
          activeEndpointId: endpoint.id,
          isConnected: true,
          isAuthenticated: true,
          isConnecting: false,
          needsCredentials: false,
          connectionEpoch: state.connectionEpoch + 1,
        }));
        return true;
      },
      attemptAutoConnect: async () => {
        if (get().hasAttemptedAutoConnect) return;
        set({ hasAttemptedAutoConnect: true });
        if (!get().isConnecting) await get().connect();
      },
      markHydrated: () => set({ isHydrated: true }),
    }),
    {
      name: "oxidns-auth",
      version: 2,
      migrate: (persisted: unknown) => {
        const old = persisted as {
          serverConfig?: Omit<Endpoint, "id" | "name">;
          rememberLogin?: boolean;
        };
        if (!old.serverConfig) return persisted as AuthState;
        return {
          ...old,
          endpoints: [{ ...defaultEndpoint, ...old.serverConfig }],
          activeEndpointId: defaultEndpoint.id,
        };
      },
      partialize: (state) => ({
        rememberLogin: state.rememberLogin,
        activeEndpointId: state.activeEndpointId,
        endpoints: state.rememberLogin
          ? state.endpoints
          : state.endpoints.map((endpoint) => ({ ...endpoint, password: "" })),
      }),
      onRehydrateStorage: () => (state) => state?.markHydrated(),
    },
  ),
);
