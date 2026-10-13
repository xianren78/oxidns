/*
 * SPDX-FileCopyrightText: 2026 Sven Shi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInstanceStore } from "./instance-store";
import { useAuthStore } from "./auth-store";
import { DEFAULT_ENDPOINT, type Endpoint } from "./endpoints";

const online: Endpoint = {
  ...DEFAULT_ENDPOINT,
  id: "online",
  name: "Online",
  url: "/online/api",
};
const offline = { ...online, id: "offline", url: "/offline/api" };
const protectedEndpoint = { ...online, id: "protected", url: "/protected/api" };
const health = {
  status: "ok",
  version: "1.6.1",
  uptime_ms: 1000,
  checks: { api: "ok", plugin_init: "ok", server_startup: "ok" },
  plugins: { total: 4, servers: 2 },
};

beforeEach(() => {
  useInstanceStore.setState({ instances: {} });
  useAuthStore.setState({
    endpoints: [online, offline, protectedEndpoint],
    activeEndpointId: "online",
    isConnected: true,
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("independent instance health", () => {
  it("keeps healthy instances online when another fails or needs authentication", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.startsWith("/offline")) throw new Error("offline");
        return new Response(JSON.stringify(health), {
          status: url.startsWith("/protected") ? 401 : 200,
        });
      }),
    );
    await useInstanceStore
      .getState()
      .refreshAll([online, offline, protectedEndpoint]);
    expect(useInstanceStore.getState().instances).toMatchObject({
      online: { status: "online", health },
      offline: { status: "offline", health: null },
      protected: { status: "unauthorized", health: null },
    });
    expect(useAuthStore.getState()).toMatchObject({
      activeEndpointId: "online",
      isConnected: true,
    });
  });
  it("probes all instances even when the active endpoint is disconnected", async () => {
    useAuthStore.setState({ activeEndpointId: "offline", isConnected: false });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(health))),
    );
    await useInstanceStore.getState().refreshAll([online]);
    expect(useInstanceStore.getState().instances.online.status).toBe("online");
  });
  it("ignores stale health when credentials or URL change during a probe", async () => {
    let resolveOld!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockReturnValueOnce(
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ...health, version: "new" })),
        ),
    );
    const old = useInstanceStore.getState().refreshEndpoint(online);
    await useInstanceStore
      .getState()
      .refreshEndpoint({ ...online, url: "/new/api" });
    resolveOld(new Response(JSON.stringify({ ...health, version: "old" })));
    await old;
    expect(useInstanceStore.getState().instances.online.health?.version).toBe(
      "new",
    );
  });
  it("removes deleted instances and ignores their late responses", async () => {
    let resolveDeleted!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValueOnce(
        new Promise((resolve) => {
          resolveDeleted = resolve;
        }),
      ),
    );
    const pending = useInstanceStore.getState().refreshEndpoint(online);
    await useInstanceStore.getState().refreshAll([]);
    resolveDeleted(new Response(JSON.stringify(health)));
    await pending;
    expect(useInstanceStore.getState().instances).toEqual({});
  });
});
