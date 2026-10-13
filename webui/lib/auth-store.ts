/*
 * SPDX-FileCopyrightText: 2026 Sven Shi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { WEBUI, tClient } from "./i18n";
import {
  DEFAULT_ENDPOINT,
  EndpointAuthError,
  normalizeEndpoint,
  probeEndpoint,
  type Endpoint,
  type EndpointDraft,
} from "./endpoints";

export interface AuthState {
  endpoints: Endpoint[];
  activeEndpointId: string | null;
  isAuthenticated: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  isHydrated: boolean;
  /** Changes when the active session is invalidated, before any probe starts. */
  connectionEpoch: number;
  hasAttemptedAutoConnect: boolean;
  connectionError: string | null;
  needsCredentials: boolean;
  rememberLogin: boolean;
  addEndpoint: (draft: EndpointDraft) => Endpoint;
  updateEndpoint: (id: string, draft: EndpointDraft) => void;
  removeEndpoint: (id: string) => Promise<void>;
  switchEndpoint: (id: string) => Promise<boolean>;
  connect: (endpoint?: Endpoint) => Promise<boolean>;
  attemptAutoConnect: () => Promise<void>;
  markHydrated: () => void;
  setRememberLogin: (remember: boolean) => void;
  logout: () => void;
}

export function getActiveEndpoint(
  state: Pick<AuthState, "endpoints" | "activeEndpointId">,
): Endpoint | null {
  return (
    state.endpoints.find(
      (endpoint) => endpoint.id === state.activeEndpointId,
    ) ?? null
  );
}

let connectionController: AbortController | null = null;
const disconnected = {
  isAuthenticated: false,
  isConnected: false,
  isConnecting: false,
  connectionError: null,
  needsCredentials: false,
};

export function migrateEndpoints(
  persisted: unknown,
): Pick<AuthState, "endpoints" | "activeEndpointId" | "rememberLogin"> {
  const state = (persisted ?? {}) as Partial<AuthState> & {
    serverConfig?: Partial<EndpointDraft>;
  };
  const rememberLogin = state.rememberLogin ?? true;
  const endpoints = Array.isArray(state.endpoints)
    ? state.endpoints
    : [
        {
          ...DEFAULT_ENDPOINT,
          ...state.serverConfig,
          id: DEFAULT_ENDPOINT.id,
          name: DEFAULT_ENDPOINT.name,
        },
      ];
  return {
    endpoints: endpoints.map((endpoint) => ({
      ...endpoint,
      password: rememberLogin ? endpoint.password : "",
    })),
    activeEndpointId: endpoints.some(
      (endpoint) => endpoint.id === state.activeEndpointId,
    )
      ? (state.activeEndpointId ?? null)
      : (endpoints[0]?.id ?? null),
    rememberLogin,
  };
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      endpoints: [{ ...DEFAULT_ENDPOINT }],
      activeEndpointId: DEFAULT_ENDPOINT.id,
      ...disconnected,
      isHydrated: false,
      connectionEpoch: 0,
      hasAttemptedAutoConnect: false,
      rememberLogin: true,

      addEndpoint: (draft) => {
        const endpoint = {
          ...normalizeEndpoint(draft),
          id: crypto.randomUUID(),
        };
        set((state) => ({ endpoints: [...state.endpoints, endpoint] }));
        if (!get().activeEndpointId) void get().switchEndpoint(endpoint.id);
        return endpoint;
      },
      updateEndpoint: (id, draft) => {
        const current = get().endpoints.find((endpoint) => endpoint.id === id);
        if (!current) return;
        const endpoint = { ...normalizeEndpoint(draft), id };
        const changed =
          current.url !== endpoint.url ||
          current.requiresAuth !== endpoint.requiresAuth ||
          current.username !== endpoint.username ||
          current.password !== endpoint.password;
        set((state) => ({
          endpoints: state.endpoints.map((item) =>
            item.id === id ? endpoint : item,
          ),
        }));
        if (changed && get().activeEndpointId === id) {
          connectionController?.abort();
          set((state) => ({
            ...disconnected,
            connectionEpoch: state.connectionEpoch + 1,
          }));
        }
      },
      removeEndpoint: async (id) => {
        const wasActive = get().activeEndpointId === id;
        set((state) => ({
          endpoints: state.endpoints.filter((endpoint) => endpoint.id !== id),
        }));
        if (wasActive) {
          const next = get().endpoints[0];
          if (next) await get().switchEndpoint(next.id);
          else {
            connectionController?.abort();
            set((state) => ({
              ...disconnected,
              activeEndpointId: null,
              connectionEpoch: state.connectionEpoch + 1,
            }));
          }
        }
      },
      switchEndpoint: async (id) => {
        if (!get().endpoints.some((endpoint) => endpoint.id === id))
          return false;
        return get().connect(
          get().endpoints.find((endpoint) => endpoint.id === id),
        );
      },
      setRememberLogin: (remember) => set({ rememberLogin: remember }),
      logout: () => {
        connectionController?.abort();
        set((state) => ({
          ...disconnected,
          needsCredentials: true,
          connectionEpoch: state.connectionEpoch + 1,
          endpoints: state.endpoints.map((endpoint) =>
            endpoint.id === state.activeEndpointId
              ? { ...endpoint, password: "" }
              : endpoint,
          ),
        }));
      },
      connect: async (config) => {
        const candidate = config ?? getActiveEndpoint(get());
        if (!candidate) return false;
        let endpoint: Endpoint;
        try {
          endpoint = { ...normalizeEndpoint(candidate), id: candidate.id };
        } catch (error) {
          set({
            connectionError:
              error instanceof Error ? error.message : String(error),
            isConnecting: false,
          });
          return false;
        }
        connectionController?.abort();
        const controller = new AbortController();
        connectionController = controller;
        set((state) => ({
          ...disconnected,
          isConnecting: true,
          hasAttemptedAutoConnect: true,
          activeEndpointId: endpoint.id,
          endpoints: state.endpoints.map((item) =>
            item.id === endpoint.id ? endpoint : item,
          ),
          connectionEpoch: state.connectionEpoch + 1,
        }));
        const epoch = get().connectionEpoch;
        const isCurrent = () =>
          !controller.signal.aborted && get().connectionEpoch === epoch;
        try {
          if (
            endpoint.requiresAuth &&
            (!endpoint.username || !endpoint.password)
          ) {
            set({ isConnecting: false, needsCredentials: true });
            return false;
          }
          await probeEndpoint(endpoint, controller.signal);
          if (!isCurrent()) return false;
          set({
            isConnected: true,
            isAuthenticated: true,
            isConnecting: false,
          });
          return true;
        } catch (error) {
          if (!isCurrent()) return false;
          const needsCredentials = error instanceof EndpointAuthError;
          set((state) => ({
            ...disconnected,
            needsCredentials,
            connectionError:
              error instanceof Error
                ? error.message
                : tClient(WEBUI.storeErrors.connectionFailed),
            endpoints: needsCredentials
              ? state.endpoints.map((item) =>
                  item.id === endpoint.id
                    ? { ...item, requiresAuth: true }
                    : item,
                )
              : state.endpoints,
          }));
          return false;
        }
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
      version: 1,
      migrate: migrateEndpoints,
      partialize: (state) => ({
        rememberLogin: state.rememberLogin,
        activeEndpointId: state.activeEndpointId,
        endpoints: state.endpoints.map((endpoint) =>
          state.rememberLogin ? endpoint : { ...endpoint, password: "" },
        ),
      }),
      onRehydrateStorage: () => (state) => state?.markHydrated(),
    },
  ),
);
