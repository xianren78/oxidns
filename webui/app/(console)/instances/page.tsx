"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, CircleAlert, RefreshCw, Server } from "lucide-react";
import { AppHeader } from "@/components/shell/app-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { type Endpoint, useAuthStore } from "@/lib/auth-store";
import { WEBUI } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";
import type { HealthResponse } from "@/lib/oxidns-api";

type InstanceState = { health?: HealthResponse; error?: string };
async function fetchEndpointHealth(
  endpoint: Endpoint,
): Promise<HealthResponse> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (endpoint.requiresAuth)
    headers.Authorization = `Basic ${btoa(`${endpoint.username}:${endpoint.password}`)}`;
  const response = await fetch(`${endpoint.url.replace(/\/$/, "")}/health`, {
    headers,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<HealthResponse>;
}

export default function InstancesPage() {
  const { t, formatNumber } = useI18n();
  const endpoints = useAuthStore((state) => state.endpoints);
  const switchEndpoint = useAuthStore((state) => state.switchEndpoint);
  const [states, setStates] = useState<Record<string, InstanceState>>({});
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    const entries = await Promise.all(
      endpoints.map(async (endpoint) => {
        try {
          return [
            endpoint.id,
            { health: await fetchEndpointHealth(endpoint) },
          ] as const;
        } catch (error) {
          return [
            endpoint.id,
            { error: error instanceof Error ? error.message : "Unknown error" },
          ] as const;
        }
      }),
    );
    setStates(Object.fromEntries(entries));
    setLoading(false);
  }, [endpoints]);
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppHeader title={t(WEBUI.endpoints.overviewTitle)} />
      <main className="oxidns-dialog-scrollbar min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {t(WEBUI.endpoints.overviewDescription)}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
            {t(WEBUI.common.refresh)}
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {endpoints.map((endpoint) => {
            const state = states[endpoint.id];
            const health = state?.health;
            return (
              <Card key={endpoint.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2 text-base">
                    <span className="flex items-center gap-2">
                      <Server className="size-4" />
                      {endpoint.name}
                    </span>
                    <Badge
                      variant={
                        health?.status === "ok" ? "default" : "destructive"
                      }
                    >
                      {health?.status ?? t(WEBUI.endpoints.unreachable)}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="truncate font-mono">
                    {endpoint.url}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {health ? (
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <span className="block text-xs text-muted-foreground">
                          {t(WEBUI.endpoints.version)}
                        </span>
                        {health.version}
                      </div>
                      <div>
                        <span className="block text-xs text-muted-foreground">
                          {t(WEBUI.endpoints.uptime)}
                        </span>
                        {formatNumber(Math.floor(health.uptime_ms / 60000))} min
                      </div>
                      <div>
                        <span className="block text-xs text-muted-foreground">
                          {t(WEBUI.endpoints.plugins)}
                        </span>
                        {formatNumber(health.plugins.total)}
                      </div>
                    </div>
                  ) : (
                    <p className="flex items-center gap-2 text-sm text-destructive">
                      <CircleAlert className="size-4" />
                      {state?.error}
                    </p>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void switchEndpoint(endpoint.id)}
                  >
                    <Activity className="size-4" />
                    {t(WEBUI.endpoints.switcher)}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
