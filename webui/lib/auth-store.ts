"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { WEBUI, tClient } from "./i18n";

export interface ServerConfig {
  url: string;
  requiresAuth: boolean;
  username: string;
  password: string;
}

export interface Endpoint extends ServerConfig {
  id: string;
  name: string;
}

export type EndpointAvailability =
  | "unknown"
  | "checking"
  | "online"
  | "offline"
  | "auth-required";

export interface EndpointStatus {
  availability: EndpointAvailability;
  checkedAt?: number;
  version?: string;
  uptimeMs?: number;
  error?: string;
}

interface HealthProbe {
  status?: string;
  version?: string;
  uptime_ms?: number;
}

export interface AuthState {
  endpoints: Endpoint[];
  activeEndpointId: string;
  endpointStatuses: Record<string, EndpointStatus>;
  /** Compatibility projection of the active endpoint for API consumers. */
  serverConfig: ServerConfig;
  isAuthenticated: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  isHydrated: boolean;
  connectionEpoch: number;
  hasAttemptedAutoConnect: boolean;
  connectionError: string | null;
  needsCredentials: boolean;
  rememberLogin: boolean;

  setServerConfig: (config: ServerConfig) => void;
  addEndpoint: (endpoint: Omit<Endpoint, "id">) => string;
  updateEndpoint: (id: string, endpoint: Omit<Endpoint, "id">) => void;
  removeEndpoint: (id: string) => void;
  setActiveEndpoint: (id: string) => void;
  connect: (config?: ServerConfig) => Promise<boolean>;
  probeEndpoint: (id: string) => Promise<EndpointStatus>;
  probeAllEndpoints: () => Promise<void>;
  attemptAutoConnect: () => Promise<void>;
  markHydrated: () => void;
  setRememberLogin: (remember: boolean) => void;
  logout: () => void;
}

const DEFAULT_ENDPOINT: Endpoint = {
  id: "default",
  name: "OxiDNS",
  url: "/api",
  requiresAuth: false,
  username: "",
  password: "",
};

function serverConfigOf(endpoint: Endpoint): ServerConfig {
  const { url, requiresAuth, username, password } = endpoint;
  return { url, requiresAuth, username, password };
}

function endpointId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `endpoint-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function endpointHeaders(endpoint: ServerConfig): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (endpoint.requiresAuth && endpoint.username && endpoint.password) {
    headers.Authorization = `Basic ${btoa(`${endpoint.username}:${endpoint.password}`)}`;
  }
  return headers;
}

async function probe(endpoint: Endpoint): Promise<EndpointStatus> {
  if (endpoint.requiresAuth && (!endpoint.username || !endpoint.password)) {
    return { availability: "auth-required", checkedAt: Date.now() };
  }
  try {
    const response = await fetch(
      `${endpoint.url.trim().replace(/\/$/, "")}/health`,
      { method: "GET", headers: endpointHeaders(endpoint) },
    );
    if (response.status === 401) {
      return { availability: "auth-required", checkedAt: Date.now() };
    }
    if (!response.ok) {
      return {
        availability: "offline",
        checkedAt: Date.now(),
        error: tClient(WEBUI.storeErrors.connectionHttpFailed, {
          status: response.status,
        }),
      };
    }
    const health = (await response.json()) as HealthProbe;
    return {
      availability: "online",
      checkedAt: Date.now(),
      version: health.version,
      uptimeMs: health.uptime_ms,
    };
  } catch (error) {
    return {
      availability: "offline",
      checkedAt: Date.now(),
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
      endpoints: [DEFAULT_ENDPOINT],
      activeEndpointId: DEFAULT_ENDPOINT.id,
      endpointStatuses: {},
      serverConfig: serverConfigOf(DEFAULT_ENDPOINT),
      isAuthenticated: false,
      isConnected: false,
      isConnecting: false,
      isHydrated: false,
      connectionEpoch: 0,
      hasAttemptedAutoConnect: false,
      connectionError: null,
      needsCredentials: false,
      rememberLogin: true,

      setServerConfig: (config) =>
        set((state) => ({
          endpoints: state.endpoints.map((endpoint) =>
            endpoint.id === state.activeEndpointId
              ? { ...endpoint, ...config }
              : endpoint,
          ),
          serverConfig: config,
          ...(isSameServerConfig(state.serverConfig, config)
            ? {}
            : disconnectedState()),
        })),

      addEndpoint: (endpoint) => {
        const id = endpointId();
        set((state) => ({
          endpoints: [...state.endpoints, { id, ...endpoint }],
        }));
        return id;
      },

      updateEndpoint: (id, endpoint) =>
        set((state) => {
          const isActive = id === state.activeEndpointId;
          return {
            endpoints: state.endpoints.map((current) =>
              current.id === id ? { id, ...endpoint } : current,
            ),
            ...(isActive
              ? {
                  serverConfig: serverConfigOf({ id, ...endpoint }),
                  ...disconnectedState(),
                  hasAttemptedAutoConnect: false,
                }
              : {}),
          };
        }),

      removeEndpoint: (id) =>
        set((state) => {
          if (state.endpoints.length === 1) return {};
          const endpoints = state.endpoints.filter(
            (endpoint) => endpoint.id !== id,
          );
          const endpointStatuses = { ...state.endpointStatuses };
          delete endpointStatuses[id];
          if (id !== state.activeEndpointId)
            return { endpoints, endpointStatuses };
          const active = endpoints[0];
          return {
            endpoints,
            endpointStatuses,
            activeEndpointId: active.id,
            serverConfig: serverConfigOf(active),
            ...disconnectedState(),
            hasAttemptedAutoConnect: false,
          };
        }),

      setActiveEndpoint: (id) =>
        set((state) => {
          const endpoint = state.endpoints.find((item) => item.id === id);
          if (!endpoint || endpoint.id === state.activeEndpointId) return {};
          return {
            activeEndpointId: endpoint.id,
            serverConfig: serverConfigOf(endpoint),
            ...disconnectedState(),
            hasAttemptedAutoConnect: false,
          };
        }),

      setRememberLogin: (remember) => set({ rememberLogin: remember }),

      logout: () =>
        set((state) => {
          const config = { ...state.serverConfig, username: "", password: "" };
          return {
            ...disconnectedState(),
            needsCredentials: true,
            serverConfig: config,
            endpoints: state.endpoints.map((endpoint) =>
              endpoint.id === state.activeEndpointId
                ? { ...endpoint, username: "", password: "" }
                : endpoint,
            ),
          };
        }),

      connect: async (config) => {
        set({ isConnecting: true, connectionError: null });
        if (config && !isSameServerConfig(config, get().serverConfig)) {
          get().setServerConfig(config);
        }
        const { activeEndpointId, endpoints } = get();
        const endpoint = endpoints.find((item) => item.id === activeEndpointId);
        if (!endpoint?.url.trim()) {
          set({
            isConnecting: false,
            connectionError: tClient(WEBUI.storeErrors.serviceUrlRequired),
          });
          return false;
        }
        const status = await probe(endpoint);
        // Ignore an old response after an endpoint switch or edit.
        const current = get();
        const stillCurrent =
          current.activeEndpointId === endpoint.id &&
          isSameServerConfig(current.serverConfig, endpoint);
        set((state) => ({
          endpointStatuses: {
            ...state.endpointStatuses,
            [endpoint.id]: status,
          },
          ...(stillCurrent
            ? status.availability === "online"
              ? {
                  isConnected: true,
                  isAuthenticated: true,
                  isConnecting: false,
                  needsCredentials: false,
                  connectionError: null,
                  connectionEpoch: state.connectionEpoch + 1,
                  hasAttemptedAutoConnect: true,
                }
              : {
                  isConnected: false,
                  isAuthenticated: false,
                  isConnecting: false,
                  needsCredentials: status.availability === "auth-required",
                  connectionError: status.error ?? null,
                  hasAttemptedAutoConnect: true,
                }
            : {}),
        }));
        return stillCurrent && status.availability === "online";
      },

      probeEndpoint: async (id) => {
        const endpoint = get().endpoints.find((item) => item.id === id);
        if (!endpoint) return { availability: "unknown" };
        set((state) => ({
          endpointStatuses: {
            ...state.endpointStatuses,
            [id]: { availability: "checking" },
          },
        }));
        const status = await probe(endpoint);
        set((state) => {
          const unchanged = state.endpoints.some(
            (item) => item.id === id && isSameServerConfig(item, endpoint),
          );
          return unchanged
            ? { endpointStatuses: { ...state.endpointStatuses, [id]: status } }
            : {};
        });
        return status;
      },

      probeAllEndpoints: async () => {
        const ids = get().endpoints.map((endpoint) => endpoint.id);
        await Promise.allSettled(ids.map((id) => get().probeEndpoint(id)));
      },

      attemptAutoConnect: async () => {
        if (get().hasAttemptedAutoConnect || get().isConnecting) return;
        set({ hasAttemptedAutoConnect: true });
        await get().connect();
      },

      markHydrated: () => set({ isHydrated: true }),
    }),
    {
      name: "oxidns-auth",
      version: 2,
      migrate: (persisted) => {
        const old = persisted as Partial<AuthState> | undefined;
        if (old?.endpoints?.length) return old as AuthState;
        const config = old?.serverConfig ?? serverConfigOf(DEFAULT_ENDPOINT);
        const endpoint = { ...DEFAULT_ENDPOINT, ...config };
        return {
          ...old,
          endpoints: [endpoint],
          activeEndpointId: endpoint.id,
          serverConfig: serverConfigOf(endpoint),
        } as AuthState;
      },
      partialize: (state) => ({
        rememberLogin: state.rememberLogin,
        activeEndpointId: state.activeEndpointId,
        endpoints: state.rememberLogin
          ? state.endpoints
          : state.endpoints.map((endpoint) => ({ ...endpoint, password: "" })),
        serverConfig: state.rememberLogin
          ? state.serverConfig
          : { ...state.serverConfig, password: "" },
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const active =
            state.endpoints.find(
              (endpoint) => endpoint.id === state.activeEndpointId,
            ) ?? state.endpoints[0];
          if (active) {
            state.activeEndpointId = active.id;
            state.serverConfig = serverConfigOf(active);
          }
          state.markHydrated();
        }
      },
    },
  ),
);

function disconnectedState() {
  return {
    isConnected: false,
    isAuthenticated: false,
    isConnecting: false,
    connectionError: null,
    needsCredentials: false,
  };
}

function isSameServerConfig(left: ServerConfig, right: ServerConfig) {
  return (
    left.url === right.url &&
    left.requiresAuth === right.requiresAuth &&
    left.username === right.username &&
    left.password === right.password
  );
}
