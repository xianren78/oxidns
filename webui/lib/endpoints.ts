/*
 * SPDX-FileCopyrightText: 2026 Sven Shi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { WEBUI, tClient } from "./i18n";
import type { HealthResponse } from "./oxidns-api";

export interface Endpoint {
  id: string;
  name: string;
  url: string;
  requiresAuth: boolean;
  username: string;
  password: string;
}

export type EndpointDraft = Omit<Endpoint, "id">;

export const DEFAULT_ENDPOINT: Endpoint = {
  id: "default",
  name: "OxiDNS",
  url: "/api",
  requiresAuth: false,
  username: "",
  password: "",
};

export function normalizeEndpoint(draft: EndpointDraft): EndpointDraft {
  const name = draft.name.trim();
  if (!name) throw new Error(tClient(WEBUI.endpoints.nameRequired));
  let url = draft.url.trim().replace(/\/+$/, "");
  if (!url) throw new Error(tClient(WEBUI.storeErrors.serviceUrlRequired));
  if (url.startsWith("/") && !url.startsWith("//")) {
    if (/[?#]/.test(url)) throw new Error(tClient(WEBUI.endpoints.invalidUrl));
  } else {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(tClient(WEBUI.endpoints.invalidUrl));
    }
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    )
      throw new Error(tClient(WEBUI.endpoints.invalidUrl));
    if (parsed.pathname === "/") parsed.pathname = "/api";
    url = parsed.toString().replace(/\/+$/, "");
  }
  return { ...draft, name, url, username: draft.username.trim() };
}

export function endpointHeaders(
  endpoint: EndpointDraft,
): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (endpoint.requiresAuth && endpoint.username) {
    const bytes = new TextEncoder().encode(
      `${endpoint.username}:${endpoint.password}`,
    );
    headers.Authorization = `Basic ${btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))}`;
  }
  return headers;
}

export class EndpointAuthError extends Error {}

// This probe deliberately has no dependency on active-session state: a failed
// overview probe must never disconnect another endpoint or alter its credentials.
export async function probeEndpoint(
  draft: EndpointDraft,
  signal?: AbortSignal,
): Promise<HealthResponse> {
  const endpoint = normalizeEndpoint(draft);
  const response = await fetch(`${endpoint.url}/health`, {
    headers: endpointHeaders(endpoint),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(8000)])
      : AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (response.status === 401)
    throw new EndpointAuthError(tClient(WEBUI.storeErrors.invalidCredentials));
  if (!response.ok)
    throw new Error(
      tClient(WEBUI.storeErrors.connectionHttpFailed, {
        status: response.status,
      }),
    );
  const body: unknown = await response.json();
  if (!isHealthResponse(body))
    throw new Error(tClient(WEBUI.endpoints.invalidHealth));
  return body;
}

function isHealthResponse(body: unknown): body is HealthResponse {
  return (
    isRecord(body) &&
    typeof body.version === "string" &&
    typeof body.status === "string" &&
    typeof body.uptime_ms === "number" &&
    isRecord(body.checks) &&
    [
      body.checks.api,
      body.checks.plugin_init,
      body.checks.server_startup,
    ].every((value) => typeof value === "string") &&
    isRecord(body.plugins) &&
    typeof body.plugins.total === "number" &&
    typeof body.plugins.servers === "number"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
