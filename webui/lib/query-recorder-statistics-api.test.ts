/*
 * SPDX-FileCopyrightText: 2026 Sven Shi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchQueryRecords,
  fetchQueryRecorderPluginStats,
  fetchQueryRecorderTopClients,
  fetchQueryRecorderTopQnames,
  fetchQueryRecorderQtypeDistribution,
  fetchQueryRecorderRcodeDistribution,
  fetchQueryRecorderLatency,
  fetchQueryRecorderTimeseries,
} from "./oxidns-api";

const NOW = 1_791_000_000_123;
const HOUR = 3_600_000;
const fetchMock = vi.fn();

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (input: string) => {
    const url = new URL(input, "https://example.test");
    // Mirror the actual backend contract: an unbounded aggregate request fails.
    if (
      url.pathname.includes("/stats/") &&
      (!url.searchParams.has("since_ms") || !url.searchParams.has("until_ms"))
    ) {
      return new Response(
        JSON.stringify({
          message: "since_ms and until_ms are required for statistics",
        }),
        { status: 400 },
      );
    }
    return new Response(
      JSON.stringify({ ok: true, query_total: 0, stats: [], records: [] }),
    );
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

function requestParams() {
  return new URL(fetchMock.mock.calls[0][0], "https://example.test")
    .searchParams;
}

describe("bounded Query Recorder statistics", () => {
  it("loads Matcher hit rates with a one-hour range when no time filters were supplied", async () => {
    await expect(
      fetchQueryRecorderPluginStats("recorder", { kind: "matcher" }),
    ).resolves.toMatchObject({ ok: true, stats: [] });
    const params = requestParams();
    expect(params.get("kind")).toBe("matcher");
    expect(params.get("since_ms")).toBe(String(NOW - HOUR));
    expect(params.get("until_ms")).toBe(String(NOW));
  });

  it("keeps the exact selected range and other filters", async () => {
    await fetchQueryRecorderPluginStats("recorder", {
      kind: "matcher",
      sinceMs: NOW - 600_001,
      untilMs: NOW - 123,
      matcherTag: "ads",
      qname: "example.test",
    });
    const params = requestParams();
    expect(params.get("since_ms")).toBe(String(NOW - 600_001));
    expect(params.get("until_ms")).toBe(String(NOW - 123));
    expect(params.get("matcher_tag")).toBe("ads");
    expect(params.get("qname")).toBe("example.test");
  });

  it("preserves an explicit epoch boundary and a full 24-hour range", async () => {
    await fetchQueryRecorderPluginStats("recorder", {
      sinceMs: 0,
      untilMs: 86_400_000,
    });
    expect(requestParams().get("since_ms")).toBe("0");
    expect(requestParams().get("until_ms")).toBe("86400000");
  });

  it.each([
    ["plugins", fetchQueryRecorderPluginStats],
    ["top_clients", fetchQueryRecorderTopClients],
    ["top_qnames", fetchQueryRecorderTopQnames],
    ["qtype", fetchQueryRecorderQtypeDistribution],
    ["rcode", fetchQueryRecorderRcodeDistribution],
    ["latency", fetchQueryRecorderLatency],
    ["timeseries", fetchQueryRecorderTimeseries],
  ] as const)(
    "supplies both bounds for default %s statistics requests",
    async (_, fetcher) => {
      await expect(fetcher("recorder")).resolves.toMatchObject({ ok: true });
      expect(requestParams().get("since_ms")).toBe(String(NOW - HOUR));
      expect(requestParams().get("until_ms")).toBe(String(NOW));
    },
  );

  it.each([
    { sinceMs: NOW - HOUR },
    { untilMs: NOW },
    { sinceMs: NaN, untilMs: NOW },
    { sinceMs: NOW, untilMs: NOW },
    { sinceMs: NOW, untilMs: NOW - HOUR },
    { sinceMs: NOW - 86_400_001, untilMs: NOW },
  ])("rejects invalid custom ranges locally: %j", async (range) => {
    await expect(
      fetchQueryRecorderPluginStats("recorder", range),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leaves query-record list filters optional", async () => {
    await fetchQueryRecords("recorder");
    expect(requestParams().has("since_ms")).toBe(false);
    expect(requestParams().has("until_ms")).toBe(false);
  });
});
