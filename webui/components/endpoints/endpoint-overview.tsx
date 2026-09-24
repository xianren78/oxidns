"use client";

import { useEffect } from "react";
import { Check, KeyRound, Loader2, Server, WifiOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { WEBUI } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";
import { useAuthStore, type EndpointAvailability } from "@/lib/auth-store";

export function EndpointOverview() {
  const { t } = useI18n();
  const endpoints = useAuthStore((state) => state.endpoints);
  const activeEndpointId = useAuthStore((state) => state.activeEndpointId);
  const statuses = useAuthStore((state) => state.endpointStatuses);
  const setActiveEndpoint = useAuthStore((state) => state.setActiveEndpoint);
  const connect = useAuthStore((state) => state.connect);
  const probeAllEndpoints = useAuthStore((state) => state.probeAllEndpoints);

  useEffect(() => {
    void probeAllEndpoints();
  }, [probeAllEndpoints]);

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold">
        {t(WEBUI.endpoints.overview)}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {endpoints.map((endpoint) => {
          const active = endpoint.id === activeEndpointId;
          const status = statuses[endpoint.id] ?? {
            availability: "unknown" as const,
          };
          return (
            <Card
              key={endpoint.id}
              className={cn(
                "cursor-pointer transition-colors hover:border-primary/40",
                active && "border-primary/60",
              )}
              role="button"
              tabIndex={0}
              onClick={() => {
                if (!active) setActiveEndpoint(endpoint.id);
                void connect();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  if (!active) setActiveEndpoint(endpoint.id);
                  void connect();
                }
              }}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="flex min-w-0 items-center gap-2 text-sm">
                  <Server className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{endpoint.name}</span>
                </CardTitle>
                {active && <Check className="size-4 text-primary" />}
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <StatusIcon status={status.availability} />
                  {t(statusKey(status.availability))}
                </div>
                <p className="mt-2 truncate font-mono text-xs text-muted-foreground">
                  {endpoint.url}
                </p>
                {status.version && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    v{status.version}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function statusKey(status: EndpointAvailability) {
  switch (status) {
    case "online":
      return WEBUI.endpoints.online;
    case "offline":
      return WEBUI.endpoints.offline;
    case "checking":
      return WEBUI.endpoints.checking;
    case "auth-required":
      return WEBUI.endpoints.authRequired;
    default:
      return WEBUI.endpoints.unknown;
  }
}

function StatusIcon({ status }: { status: EndpointAvailability }) {
  if (status === "checking")
    return <Loader2 className="size-4 animate-spin text-amber-500" />;
  if (status === "online")
    return <span className="size-2.5 rounded-full bg-green-500" />;
  if (status === "auth-required")
    return <KeyRound className="size-4 text-destructive" />;
  if (status === "offline")
    return <WifiOff className="size-4 text-destructive" />;
  return <span className="size-2.5 rounded-full bg-muted-foreground/50" />;
}
