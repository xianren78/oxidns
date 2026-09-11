import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "./auth-store";
import {
  endpointStorageKey,
  loadEndpointPreference,
  saveEndpointPreference,
} from "./endpoint-storage";

const values = new Map<string, string>();
const localStorageMock = {
  getItem: vi.fn((key: string) => values.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => values.set(key, value)),
  removeItem: vi.fn((key: string) => values.delete(key)),
};

function selectEndpoint(id: string) {
  useAuthStore.setState({
    activeEndpointId: id,
    endpoints: [
      {
        id,
        name: id,
        url: `/api-${id}`,
        requiresAuth: false,
        username: "",
        password: "",
      },
    ],
  });
}

describe("endpoint-scoped preferences", () => {
  beforeEach(() => {
    values.clear();
    vi.clearAllMocks();
    vi.stubGlobal("localStorage", localStorageMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("keeps preferences separate for each endpoint", () => {
    selectEndpoint("home");
    saveEndpointPreference("oxidns:pinned-plugins", ["cache-home"]);

    selectEndpoint("office");
    saveEndpointPreference("oxidns:pinned-plugins", ["cache-office"]);

    expect(
      loadEndpointPreference<string[]>("oxidns:pinned-plugins", []),
    ).toEqual(["cache-office"]);
    selectEndpoint("home");
    expect(
      loadEndpointPreference<string[]>("oxidns:pinned-plugins", []),
    ).toEqual(["cache-home"]);
  });

  it("migrates the legacy global value only to the active endpoint", () => {
    values.set("oxidns:pinned-plugins", JSON.stringify(["legacy-cache"]));
    selectEndpoint("home");

    expect(
      loadEndpointPreference<string[]>("oxidns:pinned-plugins", []),
    ).toEqual(["legacy-cache"]);
    expect(values.has("oxidns:pinned-plugins")).toBe(false);
    expect(values.get(endpointStorageKey("oxidns:pinned-plugins"))).toBe(
      JSON.stringify(["legacy-cache"]),
    );

    selectEndpoint("office");
    expect(
      loadEndpointPreference<string[]>("oxidns:pinned-plugins", []),
    ).toEqual([]);
  });
});
