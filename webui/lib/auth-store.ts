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

export type EndpointStatus = "unknown" | "checking" | "online" | "offline";

export interface ManagedEndpoint extends ServerConfig {
  id: string;
  name: string;
  status: EndpointStatus;
}

export interface AuthState {
  serverConfig: ServerConfig;
  endpoints: ManagedEndpoint[];
  activeEndpointId: string;
  isAuthenticated: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  isHydrated: boolean;
  /** Increments after every successful backend connection. */
  connectionEpoch: number;
  hasAttemptedAutoConnect: boolean;
  connectionError: string | null;
  needsCredentials: boolean;
  rememberLogin: boolean;

  setServerConfig: (config: ServerConfig) => void;
  addEndpoint: (name: string, config: ServerConfig) => string;
  updateEndpoint: (id: string, name: string, config: ServerConfig) => void;
  removeEndpoint: (id: string) => void;
  selectEndpoint: (id: string) => void;
  probeEndpoints: () => Promise<void>;
  connect: (config?: ServerConfig) => Promise<boolean>;
  attemptAutoConnect: () => Promise<void>;
  markHydrated: () => void;
  setRememberLogin: (remember: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      serverConfig: {
        url: "/api",
        requiresAuth: false,
        username: "",
        password: "",
      },
      endpoints: [
        {
          id: "default",
          name: "OxiDNS",
          url: "/api",
          requiresAuth: false,
          username: "",
          password: "",
          status: "unknown",
        },
      ],
      activeEndpointId: "default",
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
          serverConfig: config,
          endpoints: state.endpoints.map((endpoint) =>
            endpoint.id === state.activeEndpointId
              ? { ...endpoint, ...config }
              : endpoint,
          ),
          ...(isSameServerConfig(state.serverConfig, config)
            ? {}
            : {
                isAuthenticated: false,
                isConnected: false,
                connectionError: null,
                needsCredentials: false,
              }),
        })),

      addEndpoint: (name, config) => {
        const id = crypto.randomUUID();
        set((state) => ({
          endpoints: [
            ...state.endpoints,
            { id, name: name.trim(), ...config, status: "unknown" },
          ],
        }));
        return id;
      },

      updateEndpoint: (id, name, config) =>
        set((state) => {
          const isActive = id === state.activeEndpointId;
          return {
            endpoints: state.endpoints.map((endpoint) =>
              endpoint.id === id
                ? { ...endpoint, name: name.trim(), ...config }
                : endpoint,
            ),
            ...(isActive ? { serverConfig: config } : {}),
          };
        }),

      removeEndpoint: (id) =>
        set((state) => {
          if (state.endpoints.length === 1) return state;
          const endpoints = state.endpoints.filter(
            (endpoint) => endpoint.id !== id,
          );
          if (id !== state.activeEndpointId) return { endpoints };
          const next = endpoints[0];
          return {
            endpoints,
            activeEndpointId: next.id,
            serverConfig: endpointConfig(next),
            isAuthenticated: false,
            isConnected: false,
            connectionError: null,
            needsCredentials: false,
          };
        }),

      selectEndpoint: (id) =>
        set((state) => {
          const endpoint = state.endpoints.find((item) => item.id === id);
          if (!endpoint || id === state.activeEndpointId) return state;
          return {
            activeEndpointId: id,
            serverConfig: endpointConfig(endpoint),
            isAuthenticated: false,
            isConnected: false,
            connectionError: null,
            needsCredentials: false,
          };
        }),

      probeEndpoints: async () => {
        const endpoints = get().endpoints;
        set((state) => ({
          endpoints: state.endpoints.map((endpoint) => ({
            ...endpoint,
            status: "checking",
          })),
        }));
        await Promise.all(
          endpoints.map(async (endpoint) => {
            const status = await probeEndpoint(endpoint);
            set((state) => ({
              endpoints: state.endpoints.map((current) =>
                current.id === endpoint.id ? { ...current, status } : current,
              ),
            }));
          }),
        );
      },

      setRememberLogin: (remember) => set({ rememberLogin: remember }),

      logout: () =>
        set((state) => ({
          isConnected: false,
          isAuthenticated: false,
          needsCredentials: true,
          connectionError: null,
          serverConfig: {
            ...state.serverConfig,
            username: "",
            password: "",
          },
        })),

      connect: async (config?: ServerConfig) => {
        set({ isConnecting: true, connectionError: null });

        const serverConfig = config ?? get().serverConfig;

        try {
          const url = serverConfig.url.trim();
          if (!url) {
            throw new Error(tClient(WEBUI.storeErrors.serviceUrlRequired));
          }
          const headers: Record<string, string> = {
            Accept: "application/json",
          };
          if (serverConfig.requiresAuth) {
            if (!serverConfig.username || !serverConfig.password) {
              // Credentials known to be incomplete (e.g. rememberLogin=false cleared
              // the password). Skip the network round-trip and show the login form.
              set({
                isConnecting: false,
                needsCredentials: true,
                connectionError: null,
              });
              return false;
            }
            headers.Authorization = `Basic ${btoa(`${serverConfig.username}:${serverConfig.password}`)}`;
          }
          const response = await fetch(`${url.replace(/\/$/, "")}/health`, {
            method: "GET",
            headers,
          });
          if (response.status === 401) {
            set((state) => ({
              isConnected: false,
              isAuthenticated: false,
              isConnecting: false,
              needsCredentials: true,
              connectionError:
                serverConfig.requiresAuth &&
                serverConfig.username &&
                serverConfig.password
                  ? tClient(WEBUI.storeErrors.invalidCredentials)
                  : null,
              serverConfig: { ...serverConfig, requiresAuth: true },
              endpoints: state.endpoints.map((endpoint) =>
                endpoint.id === state.activeEndpointId
                  ? {
                      ...endpoint,
                      ...serverConfig,
                      requiresAuth: true,
                      status: "online",
                    }
                  : endpoint,
              ),
            }));
            return false;
          }
          if (!response.ok) {
            throw new Error(
              tClient(WEBUI.storeErrors.connectionHttpFailed, {
                status: response.status,
              }),
            );
          }
          set((state) => ({
            serverConfig,
            endpoints: state.endpoints.map((endpoint) =>
              endpoint.id === state.activeEndpointId
                ? { ...endpoint, ...serverConfig, status: "online" }
                : endpoint,
            ),
            isConnected: true,
            isAuthenticated: true,
            isConnecting: false,
            needsCredentials: false,
            connectionEpoch: state.connectionEpoch + 1,
          }));
          return true;
        } catch (error) {
          set((state) => ({
            isConnected: false,
            isAuthenticated: false,
            isConnecting: false,
            needsCredentials: false,
            endpoints: state.endpoints.map((endpoint) =>
              endpoint.id === state.activeEndpointId
                ? { ...endpoint, status: "offline" }
                : endpoint,
            ),
            connectionError:
              error instanceof Error
                ? error.message
                : tClient(WEBUI.storeErrors.connectionFailed),
          }));
          return false;
        }
      },

      attemptAutoConnect: async () => {
        if (get().hasAttemptedAutoConnect) return;
        set({ hasAttemptedAutoConnect: true });
        if (get().isConnecting) return;
        await get().connect();
      },

      markHydrated: () =>
        set((state) => ({
          isHydrated: true,
          endpoints: state.endpoints.map((endpoint) =>
            endpoint.id === state.activeEndpointId
              ? { ...endpoint, ...state.serverConfig, status: "unknown" }
              : { ...endpoint, status: "unknown" },
          ),
        })),
    }),
    {
      name: "oxidns-auth",
      // Don't persist live connection flags: every page load should
      // re-verify the backend before assuming we're online.
      // When rememberLogin is false, strip the password so the next
      // visit forces the user to re-enter it (username is kept for pre-fill).
      partialize: (state) => ({
        rememberLogin: state.rememberLogin,
        activeEndpointId: state.activeEndpointId,
        endpoints: state.endpoints.map((endpoint) => ({
          ...endpoint,
          status: "unknown" as const,
          ...(state.rememberLogin ? {} : { password: "" }),
        })),
        serverConfig: state.rememberLogin
          ? state.serverConfig
          : { ...state.serverConfig, password: "" },
      }),
      onRehydrateStorage: () => (state) => {
        state?.markHydrated();
      },
    },
  ),
);

function isSameServerConfig(left: ServerConfig, right: ServerConfig) {
  return (
    left.url === right.url &&
    left.requiresAuth === right.requiresAuth &&
    left.username === right.username &&
    left.password === right.password
  );
}

function endpointConfig(endpoint: ManagedEndpoint): ServerConfig {
  return {
    url: endpoint.url,
    requiresAuth: endpoint.requiresAuth,
    username: endpoint.username,
    password: endpoint.password,
  };
}

async function probeEndpoint(
  endpoint: ManagedEndpoint,
): Promise<EndpointStatus> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (endpoint.requiresAuth && endpoint.username && endpoint.password) {
    headers.Authorization = `Basic ${btoa(`${endpoint.username}:${endpoint.password}`)}`;
  }
  try {
    const response = await fetch(
      `${endpoint.url.trim().replace(/\/$/, "")}/health`,
      { method: "GET", headers },
    );
    return response.ok || response.status === 401 ? "online" : "offline";
  } catch {
    return "offline";
  }
}
