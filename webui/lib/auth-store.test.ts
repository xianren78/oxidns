import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "./auth-store";

const baseEndpoint = {
  requiresAuth: false,
  username: "",
  password: "",
};

describe("multi-endpoint authentication state", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({
      endpoints: [
        { id: "one", name: "One", url: "/one", ...baseEndpoint },
        { id: "two", name: "Two", url: "/two", ...baseEndpoint },
      ],
      activeEndpointId: "one",
      serverConfig: { url: "/one", ...baseEndpoint },
      endpointStatuses: {},
      isConnected: false,
      isAuthenticated: false,
      isConnecting: false,
      hasAttemptedAutoConnect: false,
    });
  });

  it("keeps probe results isolated when one endpoint is offline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/one/health") {
          return new Response(
            JSON.stringify({ status: "ok", version: "1.6.0", uptime_ms: 10 }),
            { status: 200 },
          );
        }
        throw new Error("unreachable");
      }),
    );

    await useAuthStore.getState().probeAllEndpoints();

    expect(useAuthStore.getState().endpointStatuses).toMatchObject({
      one: { availability: "online", version: "1.6.0" },
      two: { availability: "offline", error: "unreachable" },
    });
  });

  it("switches the active projection without changing another endpoint", () => {
    useAuthStore.getState().setActiveEndpoint("two");

    expect(useAuthStore.getState()).toMatchObject({
      activeEndpointId: "two",
      serverConfig: { url: "/two" },
      isConnected: false,
    });
    expect(useAuthStore.getState().endpoints[0]).toMatchObject({
      id: "one",
      url: "/one",
    });
  });

  it("falls back to a remaining endpoint when the active one is removed", () => {
    useAuthStore.getState().removeEndpoint("one");

    expect(useAuthStore.getState()).toMatchObject({
      activeEndpointId: "two",
      serverConfig: { url: "/two" },
    });
  });
});
