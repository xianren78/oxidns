"use client";

import { useEffect } from "react";
import { Circle, Loader2, Server } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WEBUI } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";
import { useAuthStore, type EndpointStatus } from "@/lib/auth-store";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<EndpointStatus, string> = {
  online: "text-green-500 fill-green-500",
  offline: "text-destructive fill-destructive",
  checking: "text-muted-foreground",
  unknown: "text-muted-foreground fill-muted-foreground",
};

export function EndpointOverview() {
  const { t } = useI18n();
  const endpoints = useAuthStore((state) => state.endpoints);
  const activeEndpointId = useAuthStore((state) => state.activeEndpointId);
  const selectEndpoint = useAuthStore((state) => state.selectEndpoint);
  const connect = useAuthStore((state) => state.connect);
  const probeEndpoints = useAuthStore((state) => state.probeEndpoints);

  useEffect(() => {
    void probeEndpoints();
  }, [probeEndpoints]);

  const activate = async (id: string) => {
    const endpoint = endpoints.find((item) => item.id === id);
    if (!endpoint) return;
    selectEndpoint(id);
    await connect({
      url: endpoint.url,
      requiresAuth: endpoint.requiresAuth,
      username: endpoint.username,
      password: endpoint.password,
    });
  };

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t(WEBUI.endpoints.overview)}</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void probeEndpoints()}
        >
          {t(WEBUI.endpoints.refresh)}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {endpoints.map((endpoint) => (
          <Card
            key={endpoint.id}
            className={cn(
              endpoint.id === activeEndpointId && "border-primary/50",
            )}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle
                className="truncate text-sm font-medium"
                title={endpoint.name}
              >
                {endpoint.name}
              </CardTitle>
              <Server className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                {endpoint.status === "checking" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : (
                  <Circle
                    className={cn("h-2.5 w-2.5", STATUS_CLASS[endpoint.status])}
                  />
                )}
                {t(WEBUI.endpoints[endpoint.status])}
              </div>
              <p
                className="truncate font-mono text-xs text-muted-foreground"
                title={endpoint.url}
              >
                {endpoint.url}
              </p>
              {endpoint.id === activeEndpointId ? (
                <span className="text-xs text-primary">
                  {t(WEBUI.endpoints.active)}
                </span>
              ) : (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => void activate(endpoint.id)}
                >
                  {t(WEBUI.endpoints.switchTo)}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
