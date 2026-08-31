import { afterEach, describe, expect, it } from "vitest";
import { type Endpoint, useAuthStore } from "./auth-store";

const localEndpoint: Endpoint = {
  id: "local",
  name: "Local OxiDNS",
  url: "/api",
  requiresAuth: false,
  username: "",
  password: "",
};

describe("auth store endpoints", () => {
  afterEach(() => {
    useAuthStore.setState({
      endpoints: [localEndpoint],
      activeEndpointId: localEndpoint.id,
    });
  });

  it("adds a basic-auth endpoint without requiring crypto.randomUUID", () => {
    const id = useAuthStore.getState().addEndpoint({
      name: "LAN instance",
      url: "http://192.168.0.1:9199/api",
      requiresAuth: true,
      username: "admin",
      password: "secret",
    });

    expect(id).toMatch(/^endpoint-/);
    expect(useAuthStore.getState().endpoints).toContainEqual({
      id,
      name: "LAN instance",
      url: "http://192.168.0.1:9199/api",
      requiresAuth: true,
      username: "admin",
      password: "secret",
    });
  });
});
