import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore, type ManagedEndpoint } from "./auth-store";

const primary: ManagedEndpoint = {
  id: "primary",
  name: "Primary",
  url: "https://primary.example/api",
  requiresAuth: false,
  username: "",
  password: "",
  status: "online",
};

const secondary: ManagedEndpoint = {
  ...primary,
  id: "secondary",
  name: "Secondary",
  url: "https://secondary.example/api",
};

describe("managed endpoint health", () => {
  beforeEach(() => {
    useAuthStore.setState({
      endpoints: [primary, secondary],
      activeEndpointId: "primary",
      serverConfig: primary,
      isConnected: true,
      isAuthenticated: true,
      isConnecting: false,
      connectionError: null,
    });
    vi.restoreAllMocks();
  });

  it("marks only the endpoint whose connection failed as offline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await useAuthStore.getState().connect();

    expect(useAuthStore.getState().endpoints).toMatchObject([
      { id: "primary", status: "offline" },
      { id: "secondary", status: "online" },
    ]);
  });

  it("records independent results when probing all endpoints", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        Promise.resolve({ ok: url.includes("primary"), status: 503 }),
      ),
    );

    await useAuthStore.getState().probeEndpoints();

    expect(useAuthStore.getState().endpoints).toMatchObject([
      { id: "primary", status: "online" },
      { id: "secondary", status: "offline" },
    ]);
  });
});
