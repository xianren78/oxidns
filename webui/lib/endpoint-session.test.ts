/*
 * SPDX-FileCopyrightText: 2026 Sven Shi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "./auth-store";
import { DEFAULT_ENDPOINT } from "./endpoints";
import { apiFetch } from "./endpoint-session";
import { fetchConfigFile, streamLogs } from "./oxidns-api";

const changeSession = () =>
  useAuthStore.setState((state) => ({
    connectionEpoch: state.connectionEpoch + 1,
  }));
beforeEach(() => {
  useAuthStore.setState({
    endpoints: [DEFAULT_ENDPOINT],
    activeEndpointId: DEFAULT_ENDPOINT.id,
    isConnected: true,
  });
  changeSession();
});
afterEach(() => vi.unstubAllGlobals());

describe("endpoint session cancellation", () => {
  it("aborts the previous request and SSE connection immediately on switching", async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_: unknown, init: RequestInit) =>
          new Promise((_, reject) => {
            const signal = init.signal!;
            signals.push(signal);
            signal.addEventListener(
              "abort",
              () => reject(new DOMException("aborted", "AbortError")),
              { once: true },
            );
          }),
      ),
    );
    const request = apiFetch("/api/system");
    const stream = streamLogs({}, vi.fn(), new AbortController().signal);
    const requestResult = expect(request).rejects.toMatchObject({
      name: "AbortError",
    });
    const streamResult = expect(stream).rejects.toMatchObject({
      name: "AbortError",
    });
    changeSession();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    await Promise.all([requestResult, streamResult]);
  });
  it("rejects a stale body that finishes reading after a switch", async () => {
    let resolveText!: (value: string) => void;
    const response = new Response();
    vi.spyOn(response, "text").mockReturnValue(
      new Promise((resolve) => {
        resolveText = resolve;
      }),
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const request = fetchConfigFile();
    await vi.waitFor(() => expect(response.text).toHaveBeenCalled());
    changeSession();
    resolveText(JSON.stringify({ content: "old config" }));
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });
  it("does not log out the active endpoint when an old request returns 401", async () => {
    let resolveOld!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
      ),
    );
    const pending = fetchConfigFile();
    changeSession();
    resolveOld(new Response("{}", { status: 401 }));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(useAuthStore.getState().isConnected).toBe(true);
  });
});
