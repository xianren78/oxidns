/*
 * SPDX-FileCopyrightText: 2026 Sven Shi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getActiveEndpoint,
  migrateEndpoints,
  useAuthStore,
} from "./auth-store";
import {
  DEFAULT_ENDPOINT,
  endpointHeaders,
  normalizeEndpoint,
  probeEndpoint,
  type Endpoint,
} from "./endpoints";

const a: Endpoint = {
  ...DEFAULT_ENDPOINT,
  id: "a",
  name: "A",
  url: "https://a.example/api",
};
const b: Endpoint = {
  ...DEFAULT_ENDPOINT,
  id: "b",
  name: "B",
  url: "https://b.example/api",
};
const health = {
  status: "ok",
  version: "1.6.1",
  uptime_ms: 1000,
  checks: { api: "ok", plugin_init: "ok", server_startup: "ok" },
  plugins: { total: 4, servers: 2 },
};
const response = (status = 200) =>
  new Response(JSON.stringify(health), { status });

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response()));
  useAuthStore.setState((state) => ({
    endpoints: [a, b],
    activeEndpointId: "a",
    isConnected: true,
    isAuthenticated: true,
    isConnecting: false,
    connectionError: null,
    needsCredentials: false,
    connectionEpoch: state.connectionEpoch + 1,
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("endpoint persistence and validation", () => {
  it("migrates the legacy connection and credentials", () => {
    expect(
      migrateEndpoints({
        serverConfig: {
          url: "https://old.example/api",
          requiresAuth: true,
          username: "alice",
          password: "secret",
        },
        rememberLogin: true,
      }),
    ).toMatchObject({
      activeEndpointId: "default",
      endpoints: [
        {
          id: "default",
          url: "https://old.example/api",
          username: "alice",
          password: "secret",
        },
      ],
    });
  });
  it("preserves every endpoint and clears all persisted passwords when remember login is off", () => {
    const saved = {
      endpoints: [
        { ...a, password: "a-secret" },
        { ...b, password: "b-secret" },
      ],
      activeEndpointId: "b",
      rememberLogin: false,
    };
    expect(migrateEndpoints(saved)).toMatchObject({
      activeEndpointId: "b",
      endpoints: [{ password: "" }, { password: "" }],
    });
  });
  it("preserves an empty endpoint list", () => {
    expect(migrateEndpoints({ endpoints: [] })).toMatchObject({
      endpoints: [],
      activeEndpointId: null,
    });
  });
  it("normalizes host URLs and preserves reverse-proxy API paths", () => {
    expect(normalizeEndpoint({ ...a, url: " https://dns.example/ " }).url).toBe(
      "https://dns.example/api",
    );
    expect(normalizeEndpoint({ ...a, url: "/proxy/oxidns/api/" }).url).toBe(
      "/proxy/oxidns/api",
    );
    expect(() =>
      normalizeEndpoint({ ...a, url: "javascript:alert(1)" }),
    ).toThrow();
    expect(() =>
      normalizeEndpoint({ ...a, url: "https://user:password@dns.example/api" }),
    ).toThrow();
    expect(() =>
      normalizeEndpoint({ ...a, url: "//dns.example/api" }),
    ).toThrow();
  });
  it("encodes Unicode Basic credentials", () => {
    expect(
      endpointHeaders({
        ...a,
        requiresAuth: true,
        username: "用户",
        password: "密码",
      }).Authorization,
    ).toBe(`Basic ${Buffer.from("用户:密码").toString("base64")}`);
  });
  it("rejects invalid health payloads before they can break the instances overview", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "ok",
          version: "1",
          uptime_ms: 1,
          checks: {},
          plugins: null,
        }),
      ),
    );
    await expect(probeEndpoint(a)).rejects.toThrow();
  });
});

describe("active endpoint lifecycle", () => {
  it("switches without reloading and uses the selected credentials", async () => {
    const authenticated = {
      ...b,
      requiresAuth: true,
      username: "bob",
      password: "b-secret",
    };
    useAuthStore.setState({ endpoints: [a, authenticated] });
    const epoch = useAuthStore.getState().connectionEpoch;
    await expect(useAuthStore.getState().switchEndpoint("b")).resolves.toBe(
      true,
    );
    expect(getActiveEndpoint(useAuthStore.getState())).toEqual(authenticated);
    expect(useAuthStore.getState()).toMatchObject({
      isConnected: true,
      connectionEpoch: epoch + 1,
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://b.example/api/health",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Basic ${btoa("bob:b-secret")}`,
        }),
      }),
    );
  });
  it("ignores a late successful connection to a previously selected endpoint", async () => {
    let resolveA!: (value: Response) => void;
    vi.mocked(fetch)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveA = resolve;
        }),
      )
      .mockResolvedValueOnce(response());
    const first = useAuthStore.getState().switchEndpoint("a");
    await useAuthStore.getState().switchEndpoint("b");
    resolveA(response());
    await expect(first).resolves.toBe(false);
    expect(useAuthStore.getState()).toMatchObject({
      activeEndpointId: "b",
      isConnected: true,
      connectionError: null,
    });
  });
  it("ignores a late failed connection instead of marking the new endpoint offline", async () => {
    let rejectA!: (reason: Error) => void;
    vi.mocked(fetch)
      .mockReturnValueOnce(
        new Promise((_, reject) => {
          rejectA = reject;
        }),
      )
      .mockResolvedValueOnce(response());
    const first = useAuthStore.getState().switchEndpoint("a");
    await useAuthStore.getState().switchEndpoint("b");
    rejectA(new Error("A is offline"));
    await first;
    expect(useAuthStore.getState()).toMatchObject({
      activeEndpointId: "b",
      isConnected: true,
      connectionError: null,
    });
  });
  it("does not mutate the active connection when testing another endpoint returns 401", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(401));
    await expect(probeEndpoint(b)).rejects.toThrow();
    expect(useAuthStore.getState()).toMatchObject({
      activeEndpointId: "a",
      isConnected: true,
      needsCredentials: false,
    });
  });
  it("deletes an inactive endpoint without disconnecting the current one", async () => {
    await useAuthStore.getState().removeEndpoint("b");
    expect(useAuthStore.getState()).toMatchObject({
      endpoints: [a],
      activeEndpointId: "a",
      isConnected: true,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("selects a remaining endpoint when the active endpoint is deleted and handles deleting the last", async () => {
    await useAuthStore.getState().removeEndpoint("a");
    expect(useAuthStore.getState()).toMatchObject({
      activeEndpointId: "b",
      isConnected: true,
    });
    await useAuthStore.getState().removeEndpoint("b");
    expect(useAuthStore.getState()).toMatchObject({
      endpoints: [],
      activeEndpointId: null,
      isConnected: false,
    });
  });
  it("logs out only the active endpoint", () => {
    useAuthStore.setState({
      endpoints: [
        { ...a, password: "a-secret" },
        { ...b, password: "b-secret" },
      ],
    });
    useAuthStore.getState().logout();
    expect(
      useAuthStore.getState().endpoints.map((endpoint) => endpoint.password),
    ).toEqual(["", "b-secret"]);
  });
});
