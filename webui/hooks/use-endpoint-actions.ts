/*
 * SPDX-FileCopyrightText: 2026 Sven Shi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

"use client";

import { useAuthStore } from "@/lib/auth-store";
import { useAppStore } from "@/lib/store";
import { useUpdateStore } from "@/lib/update-store";
import { WEBUI } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";

export function useEndpointActions() {
  const { t } = useI18n();
  const canChangeEndpoint = () => {
    const app = useAppStore.getState();
    if (
      app.isConfigSaving ||
      app.isApplying ||
      app.isRestarting ||
      useUpdateStore.getState().isApplying
    )
      return false;
    const snapshot = app.configHistory.find(
      (entry) => entry.version === app.configVersion,
    );
    if (
      (snapshot && snapshot.content !== app.configText) ||
      app.isOfflineMode
    ) {
      return window.confirm(t(WEBUI.endpoints.discardChanges));
    }
    return true;
  };
  const switchEndpoint = async (id: string) => {
    if (
      useAuthStore.getState().activeEndpointId === id &&
      useAuthStore.getState().isConnected
    )
      return true;
    if (!canChangeEndpoint()) return false;
    return useAuthStore.getState().switchEndpoint(id);
  };
  return { switchEndpoint, canChangeEndpoint };
}
