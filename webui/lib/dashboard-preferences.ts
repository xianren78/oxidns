/*
 * SPDX-FileCopyrightText: 2026 Sven Shi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

interface DashboardPreferences {
  pinnedPluginIds: string[];
  order: string[];
}

const LEGACY_PINS_KEY = "oxidns:pinned-plugins";
const LEGACY_ORDER_KEY = "oxidns:dashboard-order";
const LEGACY_OWNER_KEY = "oxidns:dashboard-legacy-owner";

function storageKey(endpointId: string) {
  return `oxidns:dashboard:${encodeURIComponent(endpointId)}`;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter((item): item is string => typeof item === "string"),
        ),
      ]
    : [];
}

function readList(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    return stringList(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function loadDashboardPreferences(
  endpointId: string | null,
): DashboardPreferences {
  const empty = { pinnedPluginIds: [], order: [] };
  if (!endpointId) return empty;
  try {
    const stored = localStorage.getItem(storageKey(endpointId));
    if (stored !== null) {
      const parsed: unknown = JSON.parse(stored);
      if (!parsed || typeof parsed !== "object") return empty;
      return {
        pinnedPluginIds: stringList(
          "pinnedPluginIds" in parsed ? parsed.pinnedPluginIds : undefined,
        ),
        order: stringList("order" in parsed ? parsed.order : undefined),
      };
    }
    // A global legacy list cannot tell us which endpoint originally owned it.
    // Preserve it for the first active endpoint only, never for every endpoint.
    const owner = localStorage.getItem(LEGACY_OWNER_KEY);
    if (owner !== null && owner !== endpointId) return empty;
    const pins = localStorage.getItem(LEGACY_PINS_KEY);
    const order = localStorage.getItem(LEGACY_ORDER_KEY);
    if (pins === null && order === null) return empty;
    const preferences = {
      pinnedPluginIds: readList(pins),
      order: readList(order),
    };
    localStorage.setItem(LEGACY_OWNER_KEY, endpointId);
    localStorage.setItem(storageKey(endpointId), JSON.stringify(preferences));
    try {
      localStorage.removeItem(LEGACY_PINS_KEY);
      localStorage.removeItem(LEGACY_ORDER_KEY);
    } catch {
      // The owner marker still prevents migration into a second endpoint.
    }
    return preferences;
  } catch {
    return empty;
  }
}

function savePreferences(
  endpointId: string | null,
  patch: Partial<DashboardPreferences>,
): void {
  if (!endpointId) return;
  const preferences = { ...loadDashboardPreferences(endpointId), ...patch };
  try {
    localStorage.setItem(storageKey(endpointId), JSON.stringify(preferences));
  } catch {
    // Browser storage may be unavailable; keep the current UI interaction usable.
  }
}

export function savePinnedPluginIds(
  endpointId: string | null,
  ids: string[],
): void {
  savePreferences(endpointId, { pinnedPluginIds: stringList(ids) });
}

export function saveDashboardOrder(
  endpointId: string | null,
  ids: string[],
): void {
  savePreferences(endpointId, { order: stringList(ids) });
}
