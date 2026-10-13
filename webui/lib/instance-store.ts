/*
 * SPDX-FileCopyrightText: 2026 Sven Shi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { create } from "zustand";
import { EndpointAuthError, probeEndpoint, type Endpoint } from "./endpoints";
import type { HealthResponse } from "./oxidns-api";

export interface InstanceStatus {
  status: "online" | "unready" | "offline" | "unauthorized" | "checking";
  health: HealthResponse | null;
  latencyMs: number | null;
  error: string | null;
}

interface InstanceState {
  instances: Record<string, InstanceStatus>;
  refreshEndpoint: (endpoint: Endpoint, signal?: AbortSignal) => Promise<void>;
  refreshAll: (endpoints: Endpoint[], signal?: AbortSignal) => Promise<void>;
}

const probes = new Map<string, AbortController>();

export const useInstanceStore = create<InstanceState>((set, get) => ({
  instances: {},
  refreshEndpoint: async (endpoint, signal) => {
    probes.get(endpoint.id)?.abort();
    const controller = new AbortController();
    probes.set(endpoint.id, controller);
    const combined = signal
      ? AbortSignal.any([controller.signal, signal])
      : controller.signal;
    set((state) => ({
      instances: {
        ...state.instances,
        [endpoint.id]: {
          status: "checking",
          health: null,
          latencyMs: null,
          error: null,
        },
      },
    }));
    const started = performance.now();
    try {
      const health = await probeEndpoint(endpoint, combined);
      if (combined.aborted) return;
      set((state) => ({
        instances: {
          ...state.instances,
          [endpoint.id]: {
            status: health.status === "ok" ? "online" : "unready",
            health,
            latencyMs: Math.round(performance.now() - started),
            error: null,
          },
        },
      }));
    } catch (error) {
      if (combined.aborted) return;
      set((state) => ({
        instances: {
          ...state.instances,
          [endpoint.id]: {
            status:
              error instanceof EndpointAuthError ? "unauthorized" : "offline",
            health: null,
            latencyMs: null,
            error: error instanceof Error ? error.message : String(error),
          },
        },
      }));
    } finally {
      if (probes.get(endpoint.id) === controller) probes.delete(endpoint.id);
    }
  },
  refreshAll: async (endpoints, signal) => {
    const ids = new Set(endpoints.map((endpoint) => endpoint.id));
    for (const [id, controller] of probes)
      if (!ids.has(id)) {
        controller.abort();
        probes.delete(id);
      }
    set((state) => ({
      instances: Object.fromEntries(
        Object.entries(state.instances).filter(([id]) => ids.has(id)),
      ),
    }));
    await Promise.allSettled(
      endpoints.map((endpoint) => get().refreshEndpoint(endpoint, signal)),
    );
  },
}));
