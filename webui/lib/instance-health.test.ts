import { afterEach, describe, expect, it, vi } from "vitest";
import type { Endpoint } from "./auth-store";
import {
  refreshEndpointHealth,
  type InstanceHealthState,
} from "./instance-health";
import type { HealthResponse } from "./oxidns-api";

const endpoints: Endpoint[] = [
  {
    id: "online",
    name: "Online",
    url: "http://online.test/api",
    requiresAuth: false,
    username: "",
    password: "",
  },
  {
    id: "offline",
    name: "Offline",
    url: "http://offline.test/api",
    requiresAuth: false,
    username: "",
    password: "",
  },
];

const health: HealthResponse = {
  status: "ok",
  version: "1.6.0",
  uptime_ms: 60_000,
  checks: { api: "ok", plugin_init: "ok", server_startup: "ok" },
  plugins: { total: 4, servers: 1 },
};

describe("instance health refresh", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("publishes a healthy endpoint without waiting for an offline endpoint", async () => {
    let rejectOffline: (reason: Error) => void = () => {};
    const offlineRequest = new Promise<Response>((_resolve, reject) => {
      rejectOffline = reject;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string | URL | Request) =>
        String(url).includes("online.test")
          ? Promise.resolve(
              new Response(JSON.stringify(health), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              }),
            )
          : offlineRequest,
      ),
    );

    const results = new Map<string, InstanceHealthState>();
    const refresh = refreshEndpointHealth(endpoints, (id, state) => {
      results.set(id, state);
    });

    await vi.waitFor(() =>
      expect(results.get("online")).toEqual({ status: "online", health }),
    );
    expect(results.has("offline")).toBe(false);

    rejectOffline(new Error("network unavailable"));
    await refresh;
    expect(results.get("offline")).toEqual({
      status: "offline",
      error: "network unavailable",
    });
    expect(results.get("online")).toEqual({ status: "online", health });
  });
});
