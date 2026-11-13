/*
 * SPDX-FileCopyrightText: 2026 Sven Shi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

"use client";

import { Server } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuthStore } from "@/lib/auth-store";
import { useAppStore } from "@/lib/store";
import { useUpdateStore } from "@/lib/update-store";
import { WEBUI } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";
import { useEndpointActions } from "@/hooks/use-endpoint-actions";

export function EndpointSwitcher() {
  const { t } = useI18n();
  const endpoints = useAuthStore((s) => s.endpoints);
  const activeEndpointId = useAuthStore((s) => s.activeEndpointId);
  const isConnecting = useAuthStore((s) => s.isConnecting);
  const busy = useAppStore(
    (s) => s.isConfigSaving || s.isApplying || s.isRestarting,
  );
  const upgrading = useUpdateStore((s) => s.isApplying);
  const { switchEndpoint } = useEndpointActions();
  return (
    <Select
      value={activeEndpointId ?? ""}
      onValueChange={(id) => void switchEndpoint(id)}
      disabled={!endpoints.length || busy || upgrading}
    >
      <SelectTrigger
        className="h-8 w-[130px] min-w-0 sm:w-[180px]"
        aria-label={t(WEBUI.endpoints.switch)}
      >
        <Server
          className={`size-3.5 shrink-0 ${isConnecting ? "animate-pulse" : ""}`}
        />
        <SelectValue placeholder={t(WEBUI.endpoints.none)} />
      </SelectTrigger>
      <SelectContent>
        {endpoints.map((endpoint) => (
          <SelectItem key={endpoint.id} value={endpoint.id}>
            {endpoint.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
