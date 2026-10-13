/*
 * SPDX-FileCopyrightText: 2026 Sven Shi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BuildInfo, HealthResponse, SystemResponse } from "./oxidns-api";

const apiMocks = vi.hoisted(() => ({
  fetchBuildInfo: vi.fn(),
  fetchConfigFile: vi.fn(),
  validateConfigText: vi.fn(),
  saveConfigFile: vi.fn(),
  requestRestart: vi.fn(),
  requestProviderReload: vi.fn(),
  fetchControl: vi.fn(),
  fetchHealth: vi.fn(),
  fetchReloadStatus: vi.fn(),
  fetchSystem: vi.fn(),
}));

vi.mock("./oxidns-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./oxidns-api")>();
  return { ...actual, ...apiMocks };
});

import { useAppStore } from "./store";
import { DEFAULT_ENDPOINT } from "./endpoints";
import { useAuthStore } from "./auth-store";

const build: BuildInfo = {
  version: "0.9.0",
  bundle: "full",
  enabled_bundles: ["full"],
  enabled_features: ["plugin-upgrade"],
  supported_plugins: {
    servers: [],
    executors: [],
    matchers: [],
    providers: [],
  },
};

const health: HealthResponse = {
  status: "ok",
  version: build.version,
  uptime_ms: 10_000,
  checks: { api: "ok", plugin_init: "ok", server_startup: "ok" },
  plugins: { total: 4, servers: 1 },
};

const system: SystemResponse = {
  ok: true,
  version: build.version,
  build,
  os: "linux",
  arch: "x86_64",
  uptime_ms: 10_000,
  config_path: "/etc/oxidns/config.yaml",
  api_enabled: true,
  reload: {
    status: "success",
    pending: false,
    in_progress: false,
    running_version: "running-v2",
  },
};

afterEach(() => vi.unstubAllGlobals());

describe("runtime state refresh", () => {
  let connectionEpoch = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    connectionEpoch += 1;
    useAuthStore.setState({
      isConnected: true,
      connectionEpoch,
      activeEndpointId: DEFAULT_ENDPOINT.id,
      endpoints: [
        {
          ...DEFAULT_ENDPOINT,
          url: `/api-${connectionEpoch}`,
          requiresAuth: false,
          username: "",
          password: "",
        },
      ],
    });
    useAppStore.setState({
      health: null,
      system: null,
      buildInfo: null,
      reloadStatus: null,
      runningVersion: "running-v1",
      dependencyGraph: null,
      runningDependencyGraph: null,
    });
    apiMocks.validateConfigText.mockResolvedValue({
      ok: true,
      dependency_graph: { nodes: [], edges: [], init_order: [] },
    });
    apiMocks.fetchHealth.mockResolvedValue(health);
    apiMocks.fetchSystem.mockResolvedValue(system);
    apiMocks.fetchBuildInfo.mockResolvedValue({ ok: true, build });
  });

  it("refreshes health and system without redundant control/build/reload calls", async () => {
    await useAppStore.getState().refreshRuntimeState();

    expect(apiMocks.fetchHealth).toHaveBeenCalledTimes(1);
    expect(apiMocks.fetchSystem).toHaveBeenCalledTimes(1);
    expect(apiMocks.fetchControl).not.toHaveBeenCalled();
    expect(apiMocks.fetchReloadStatus).not.toHaveBeenCalled();
    expect(apiMocks.fetchBuildInfo).not.toHaveBeenCalled();
    expect(useAppStore.getState()).toMatchObject({
      health,
      system,
      buildInfo: build,
      reloadStatus: system.reload,
      runningVersion: "running-v2",
    });
  });

  it("fetches build metadata once when an older system response omits it", async () => {
    apiMocks.fetchSystem.mockResolvedValue({ ...system, build: undefined });

    await useAppStore.getState().refreshRuntimeState();

    expect(apiMocks.fetchBuildInfo).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().buildInfo).toEqual(build);
  });

  it("does not reuse build metadata from a previous backend", async () => {
    const previousBuild = { ...build, version: "0.8.0", bundle: "minimal" };
    useAppStore.setState({ buildInfo: previousBuild });
    apiMocks.fetchSystem.mockResolvedValue({ ...system, build: undefined });

    await useAppStore.getState().refreshRuntimeState();

    expect(apiMocks.fetchBuildInfo).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().buildInfo).toEqual(build);
  });

  it("deduplicates overlapping system refreshes", async () => {
    let resolveSystem: ((value: SystemResponse) => void) | undefined;
    apiMocks.fetchSystem.mockReturnValue(
      new Promise<SystemResponse>((resolve) => {
        resolveSystem = resolve;
      }),
    );

    const first = useAppStore.getState().refreshSystemState();
    const second = useAppStore.getState().refreshSystemState();
    resolveSystem?.(system);
    await Promise.all([first, second]);

    expect(first).toBe(second);
    expect(apiMocks.fetchSystem).toHaveBeenCalledTimes(1);
  });

  it("discards an in-flight response after switching backends", async () => {
    let resolvePrevious: ((value: SystemResponse) => void) | undefined;
    const previousResponse = { ...system, version: "old-backend" };
    const currentResponse = { ...system, version: "new-backend" };
    apiMocks.fetchSystem
      .mockReturnValueOnce(
        new Promise<SystemResponse>((resolve) => {
          resolvePrevious = resolve;
        }),
      )
      .mockResolvedValueOnce(currentResponse);

    const previousRefresh = useAppStore.getState().refreshSystemState();
    connectionEpoch += 1;
    useAuthStore.setState({
      connectionEpoch,
      activeEndpointId: DEFAULT_ENDPOINT.id,
      endpoints: [
        {
          ...DEFAULT_ENDPOINT,
          url: "/api-new",
          requiresAuth: false,
          username: "",
          password: "",
        },
      ],
    });
    const currentRefresh = useAppStore.getState().refreshSystemState();
    await currentRefresh;
    resolvePrevious?.(previousResponse);
    await previousRefresh;

    expect(apiMocks.fetchSystem).toHaveBeenCalledTimes(2);
    expect(useAppStore.getState().system?.version).toBe("new-backend");
  });
  it("clears stale system configuration on a session change and loads the newly selected instance", async () => {
    useAppStore.setState({
      configModel: { runtime: { worker_threads: 2 }, plugins: [] },
      configText: "old config",
      configVersion: "old-version",
      system,
    });
    apiMocks.fetchConfigFile.mockResolvedValue({
      ok: true,
      path: "/instance-b/config.yaml",
      format: "yaml",
      content:
        "runtime:\n  worker_threads: 3\nlog:\n  level: debug\nplugins: []\n",
      version: "new-version",
    });
    useAuthStore.setState((state) => ({
      connectionEpoch: state.connectionEpoch + 1,
      endpoints: [
        { ...DEFAULT_ENDPOINT, id: "instance-b", url: "/instance-b/api" },
      ],
      activeEndpointId: "instance-b",
    }));
    expect(useAppStore.getState()).toMatchObject({
      system: null,
      configVersion: null,
      configText: "",
    });
    await Promise.all([
      useAppStore.getState().loadConfig(),
      useAppStore.getState().refreshRuntimeState(),
    ]);
    expect(useAppStore.getState()).toMatchObject({
      configModel: { runtime: { worker_threads: 3 }, log: { level: "debug" } },
      configPath: "/instance-b/config.yaml",
      configVersion: "new-version",
      system,
    });
  });

  it("ignores a late config response from the previous endpoint", async () => {
    let resolvePrevious!: (value: unknown) => void;
    apiMocks.fetchConfigFile
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePrevious = resolve;
        }),
      )
      .mockResolvedValueOnce({
        ok: true,
        path: "/new/config.yaml",
        format: "yaml",
        content: "runtime:\n  worker_threads: 3\nplugins: []\n",
        version: "new",
      });
    const previous = useAppStore.getState().loadConfig();
    useAuthStore.setState((state) => ({
      connectionEpoch: state.connectionEpoch + 1,
    }));
    await useAppStore.getState().loadConfig();
    resolvePrevious({
      ok: true,
      path: "/old/config.yaml",
      content: "runtime:\n  worker_threads: 2\nplugins: []\n",
      version: "old",
    });
    await previous;
    expect(useAppStore.getState()).toMatchObject({
      configVersion: "new",
      configPath: "/new/config.yaml",
      configModel: { runtime: { worker_threads: 3 } },
    });
  });

  it("cancels a save waiting for validation instead of posting the old config to the new endpoint", async () => {
    let resolveValidation!: (value: unknown) => void;
    apiMocks.validateConfigText.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveValidation = resolve;
      }),
    );
    useAppStore.setState({ configText: "plugins: []", configError: null });
    const save = useAppStore.getState().saveConfig();
    const rejected = expect(save).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() =>
      expect(apiMocks.validateConfigText).toHaveBeenCalled(),
    );
    useAuthStore.setState((state) => ({
      connectionEpoch: state.connectionEpoch + 1,
    }));
    resolveValidation({ ok: true });
    await rejected;
    expect(apiMocks.saveConfigFile).not.toHaveBeenCalled();
    expect(useAppStore.getState().configError).toBeNull();
  });
  it("does not report a provider reload from another endpoint with the same plugin tag", async () => {
    let resolveReload!: () => void;
    apiMocks.requestProviderReload.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveReload = resolve;
      }),
    );
    const yaml =
      "plugins:\n  - tag: domains\n    type: domain_set\n    args:\n      exps: [domain:example.test]\n";
    useAppStore.getState().setYamlConfig(yaml);
    const previous = useAppStore.getState().reloadProvider("domains");
    useAuthStore.setState((state) => ({
      connectionEpoch: state.connectionEpoch + 1,
    }));
    useAppStore.getState().setYamlConfig(yaml);
    resolveReload();
    await previous;
    expect(useAppStore.getState().providerReloads.domains).toMatchObject({
      outcome: "idle",
      pending: false,
    });
  });

  it("saves and restarts with current credentials before activating rotated credentials", async () => {
    const oldEndpoint = {
      ...DEFAULT_ENDPOINT,
      requiresAuth: true,
      username: "admin",
      password: "old-password",
    };
    const nextEndpoint = { ...oldEndpoint, password: "new-password" };
    useAuthStore.setState({
      endpoints: [oldEndpoint],
      activeEndpointId: oldEndpoint.id,
    });
    useAppStore.getState().setYamlConfig("plugins: []\n");
    apiMocks.fetchHealth.mockResolvedValue({
      ...health,
      instance_id: "old-process",
    });
    apiMocks.saveConfigFile.mockImplementation(async () => {
      expect(useAuthStore.getState().endpoints[0].password).toBe(
        "old-password",
      );
      return {
        ok: true,
        path: "/config.yaml",
        format: "yaml",
        version: "saved",
      };
    });
    apiMocks.requestRestart.mockImplementation(async () => {
      expect(useAuthStore.getState().endpoints[0].password).toBe(
        "old-password",
      );
    });
    apiMocks.fetchConfigFile.mockResolvedValue({
      ok: true,
      path: "/config.yaml",
      format: "yaml",
      content: "plugins: []\n",
      version: "saved",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ ...health, instance_id: "new-process" }),
          ),
      ),
    );
    await useAppStore.getState().restartApp(nextEndpoint);
    expect(apiMocks.requestRestart).toHaveBeenCalledOnce();
    expect(useAuthStore.getState()).toMatchObject({
      endpoints: [nextEndpoint],
      isConnected: true,
    });
    expect(useAppStore.getState()).toMatchObject({
      configVersion: "saved",
      isRestarting: false,
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/health",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Basic ${btoa("admin:new-password")}`,
        }),
      }),
    );
  });
});
