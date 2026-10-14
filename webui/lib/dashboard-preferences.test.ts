/*
 * SPDX-FileCopyrightText: 2026 Sven Shi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadDashboardPreferences,
  saveDashboardOrder,
  savePinnedPluginIds,
} from "./dashboard-preferences";
import { DEFAULT_ENDPOINT } from "./endpoints";
import { useAuthStore } from "./auth-store";
import { useAppStore } from "./store";

function memoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
    key: (index) => [...entries.keys()][index] ?? null,
  };
}

const yaml = `plugins:
  - tag: cache
    type: cache
    args: { size: 1024 }
  - tag: main
    type: sequence
    args: []
`;

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  useAuthStore.setState((state) => ({
    endpoints: [
      { ...DEFAULT_ENDPOINT, id: "a" },
      { ...DEFAULT_ENDPOINT, id: "b" },
    ],
    activeEndpointId: "a",
    connectionEpoch: state.connectionEpoch + 1,
  }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function selectEndpoint(id: string) {
  useAuthStore.setState((state) => ({
    activeEndpointId: id,
    connectionEpoch: state.connectionEpoch + 1,
  }));
  useAppStore.getState().setYamlConfig(yaml);
}

function pinnedIds() {
  return useAppStore
    .getState()
    .plugins.filter((plugin) => plugin.pinned)
    .map((plugin) => plugin.id);
}

describe("endpoint dashboard preferences", () => {
  it("keeps independent pins even for endpoints using the same URL and plugin IDs", () => {
    selectEndpoint("a");
    useAppStore.getState().togglePluginPin("cache");
    expect(pinnedIds()).toEqual(["cache"]);
    selectEndpoint("b");
    expect(pinnedIds()).toEqual([]);
    useAppStore.getState().togglePluginPin("main");
    expect(pinnedIds()).toEqual(["main"]);
    selectEndpoint("a");
    expect(pinnedIds()).toEqual(["cache"]);
    selectEndpoint("b");
    expect(pinnedIds()).toEqual(["main"]);
  });

  it("preserves each endpoint's pins when its configuration is refreshed", () => {
    selectEndpoint("a");
    useAppStore.getState().togglePluginPin("cache");
    useAppStore.getState().setYamlConfig(yaml);
    expect(pinnedIds()).toEqual(["cache"]);
    selectEndpoint("b");
    useAppStore.getState().setYamlConfig(yaml);
    expect(pinnedIds()).toEqual([]);
  });

  it("unpinning one endpoint does not unpin another", () => {
    savePinnedPluginIds("a", ["cache"]);
    savePinnedPluginIds("b", ["cache"]);
    selectEndpoint("a");
    useAppStore.getState().togglePluginPin("cache");
    expect(pinnedIds()).toEqual([]);
    selectEndpoint("b");
    expect(pinnedIds()).toEqual(["cache"]);
  });

  it("keeps drag order independent and does not overwrite pins when saving order", () => {
    savePinnedPluginIds("a", ["cache", "main"]);
    savePinnedPluginIds("b", ["cache", "main"]);
    saveDashboardOrder("a", ["main", "cache"]);
    saveDashboardOrder("b", ["cache", "main"]);
    expect(loadDashboardPreferences("a")).toEqual({
      pinnedPluginIds: ["cache", "main"],
      order: ["main", "cache"],
    });
    expect(loadDashboardPreferences("b")).toEqual({
      pinnedPluginIds: ["cache", "main"],
      order: ["cache", "main"],
    });
    savePinnedPluginIds("a", ["main"]);
    expect(loadDashboardPreferences("a").order).toEqual(["main", "cache"]);
  });

  it("keeps preferences when an endpoint's name or URL is edited", () => {
    savePinnedPluginIds("a", ["cache"]);
    useAuthStore.getState().updateEndpoint("a", {
      ...DEFAULT_ENDPOINT,
      name: "Renamed",
      url: "https://other.example/api",
    });
    useAppStore.getState().setYamlConfig(yaml);
    expect(pinnedIds()).toEqual(["cache"]);
  });

  it("migrates both legacy lists to only the first endpoint", () => {
    localStorage.setItem("oxidns:pinned-plugins", JSON.stringify(["cache"]));
    localStorage.setItem(
      "oxidns:dashboard-order",
      JSON.stringify(["cache", "main"]),
    );
    selectEndpoint("a");
    expect(pinnedIds()).toEqual(["cache"]);
    expect(loadDashboardPreferences("a").order).toEqual(["cache", "main"]);
    expect(localStorage.getItem("oxidns:pinned-plugins")).toBeNull();
    expect(localStorage.getItem("oxidns:dashboard-order")).toBeNull();
    selectEndpoint("b");
    expect(pinnedIds()).toEqual([]);
    expect(loadDashboardPreferences("b").order).toEqual([]);
    selectEndpoint("a");
    expect(pinnedIds()).toEqual(["cache"]);
  });

  it("does not copy legacy data to another endpoint if cleanup failed", () => {
    localStorage.setItem("oxidns:pinned-plugins", '["cache"]');
    vi.spyOn(localStorage, "removeItem").mockImplementation(() => {
      throw new Error("unavailable");
    });
    expect(loadDashboardPreferences("a").pinnedPluginIds).toEqual(["cache"]);
    expect(loadDashboardPreferences("b").pinnedPluginIds).toEqual([]);
  });

  it("leaves legacy preferences untouched when no endpoint is selected", () => {
    localStorage.setItem("oxidns:pinned-plugins", '["cache"]');
    expect(loadDashboardPreferences(null)).toEqual({
      pinnedPluginIds: [],
      order: [],
    });
    savePinnedPluginIds(null, ["main"]);
    expect(localStorage.getItem("oxidns:dashboard-legacy-owner")).toBeNull();
    expect(loadDashboardPreferences("b").pinnedPluginIds).toEqual(["cache"]);
  });

  it("ignores stale pin actions while an endpoint's plugins have not loaded", () => {
    savePinnedPluginIds("b", ["main"]);
    useAuthStore.setState((state) => ({
      activeEndpointId: "b",
      connectionEpoch: state.connectionEpoch + 1,
    }));
    useAppStore.getState().togglePluginPin("cache");
    expect(loadDashboardPreferences("b").pinnedPluginIds).toEqual(["main"]);
  });

  it("handles corrupted or unavailable browser storage without leaking preferences", () => {
    localStorage.setItem("oxidns:dashboard:a", "broken JSON");
    expect(loadDashboardPreferences("a")).toEqual({
      pinnedPluginIds: [],
      order: [],
    });
    expect(loadDashboardPreferences("b")).toEqual({
      pinnedPluginIds: [],
      order: [],
    });
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => savePinnedPluginIds("a", ["cache"])).not.toThrow();
    expect(loadDashboardPreferences("b")).toEqual({
      pinnedPluginIds: [],
      order: [],
    });
  });
});
