/*
 * SPDX-FileCopyrightText: 2026 Sven Shi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

"use client";

import { useCallback, useState } from "react";
import {
  RefreshCw,
  Server,
  PlugZap,
  Plus,
  Pencil,
  Trash2,
  Activity,
} from "lucide-react";
import { AppHeader } from "@/components/shell/app-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EndpointForm } from "@/components/instances/endpoint-form";
import type { Endpoint } from "@/lib/endpoints";
import { useAuthStore } from "@/lib/auth-store";
import { useInstanceStore } from "@/lib/instance-store";
import { useEndpointActions } from "@/hooks/use-endpoint-actions";
import { useVisiblePolling } from "@/hooks/use-visible-polling";
import { useI18n } from "@/lib/i18n/provider";
import { WEBUI } from "@/lib/i18n";

export default function InstancesPage() {
  const { t, formatNumber } = useI18n();
  const endpoints = useAuthStore((s) => s.endpoints);
  const activeEndpointId = useAuthStore((s) => s.activeEndpointId);
  const instances = useInstanceStore((s) => s.instances);
  const refreshAll = useInstanceStore((s) => s.refreshAll);
  const { switchEndpoint, canChangeEndpoint } = useEndpointActions();
  const refreshEndpoint = useInstanceStore((s) => s.refreshEndpoint);
  const rememberLogin = useAuthStore((s) => s.rememberLogin);
  const setRememberLogin = useAuthStore((s) => s.setRememberLogin);
  const [editing, setEditing] = useState<Endpoint | "new" | null>(null);
  const [deleting, setDeleting] = useState<Endpoint | null>(null);

  const removeEndpoint = () => {
    if (!deleting) return;
    if (deleting.id === activeEndpointId && !canChangeEndpoint()) return;
    void useAuthStore.getState().removeEndpoint(deleting.id);
    setDeleting(null);
  };
  const refresh = useCallback(
    (signal?: AbortSignal) => refreshAll(endpoints, signal),
    [endpoints, refreshAll],
  );
  useVisiblePolling(refresh, 15000);
  return (
    <>
      <AppHeader title={t(WEBUI.endpoints.overview)} />
      <main className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-medium">
                {t(WEBUI.endpoints.overview)}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t(WEBUI.endpoints.overviewDescription)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void refresh()}>
                <RefreshCw className="size-4" />
                {t(WEBUI.endpoints.refresh)}
              </Button>
              <Button onClick={() => setEditing("new")}>
                <Plus className="size-4" />
                {t(WEBUI.endpoints.add)}
              </Button>
            </div>
          </div>
          {!endpoints.length && (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                {t(WEBUI.endpoints.empty)}
              </CardContent>
            </Card>
          )}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {endpoints.map((endpoint) => {
              const instance = instances[endpoint.id];
              const status = instance?.status ?? "idle";
              const online = status === "online";
              return (
                <Card key={endpoint.id} data-endpoint-id={endpoint.id}>
                  <CardHeader className="gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Server className="size-4 shrink-0 text-muted-foreground" />
                      <CardTitle className="min-w-0 flex-1 truncate text-sm">
                        {endpoint.name}
                      </CardTitle>
                      <Badge
                        variant={
                          online
                            ? "secondary"
                            : status === "checking" || !instance
                              ? "outline"
                              : "destructive"
                        }
                      >
                        {t(WEBUI.endpoints[status])}
                      </Badge>
                    </div>
                    <p
                      className="truncate text-xs text-muted-foreground"
                      title={endpoint.url}
                    >
                      {endpoint.url}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                      <div>
                        <dt className="text-muted-foreground">
                          {t(WEBUI.endpoints.version)}
                        </dt>
                        <dd className="mt-1 font-mono">
                          {instance?.health?.version ?? "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">
                          {t(WEBUI.endpoints.uptime)}
                        </dt>
                        <dd className="mt-1">
                          {instance?.health
                            ? t(WEBUI.endpoints.seconds, {
                                count: formatNumber(
                                  Math.floor(instance.health.uptime_ms / 1000),
                                ),
                              })
                            : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">
                          {t(WEBUI.endpoints.plugins)}
                        </dt>
                        <dd className="mt-1">
                          {instance?.health
                            ? formatNumber(instance.health.plugins.total)
                            : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">
                          {t(WEBUI.endpoints.latency)}
                        </dt>
                        <dd className="mt-1">
                          {instance?.latencyMs != null
                            ? t(WEBUI.endpoints.milliseconds, {
                                count: formatNumber(instance.latencyMs),
                              })
                            : "—"}
                        </dd>
                      </div>
                    </dl>
                    {instance?.error && (
                      <p className="break-words text-xs text-destructive">
                        {instance.error}
                      </p>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      {endpoint.id === activeEndpointId ? (
                        <Badge variant="secondary">
                          {t(WEBUI.endpoints.active)}
                        </Badge>
                      ) : (
                        <span />
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void switchEndpoint(endpoint.id)}
                      >
                        <PlugZap className="size-3.5" />
                        {t(WEBUI.endpoints.activate)}
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void refreshEndpoint(endpoint)}
                        disabled={status === "checking"}
                      >
                        <Activity className="size-3.5" />
                        {t(
                          status === "checking"
                            ? WEBUI.endpoints.testing
                            : WEBUI.endpoints.test,
                        )}
                      </Button>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t(WEBUI.endpoints.edit)}
                          onClick={() => setEditing(endpoint)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t(WEBUI.endpoints.delete)}
                          onClick={() => setDeleting(endpoint)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                {t(WEBUI.endpoints.remember)}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                {t(WEBUI.endpoints.rememberDescription)}
              </p>
              <Switch
                checked={rememberLogin}
                onCheckedChange={setRememberLogin}
                aria-label={t(WEBUI.endpoints.remember)}
              />
            </CardContent>
          </Card>
        </div>
      </main>
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[90svh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t(
                editing === "new" ? WEBUI.endpoints.add : WEBUI.endpoints.edit,
              )}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <EndpointForm
              key={editing === "new" ? "new" : editing.id}
              endpoint={editing === "new" ? null : editing}
              onClose={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(WEBUI.endpoints.delete)}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(WEBUI.endpoints.deleteDescription, {
                name: deleting?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t(WEBUI.common.cancel)}</AlertDialogCancel>
            <AlertDialogAction onClick={removeEndpoint}>
              {t(WEBUI.common.delete)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
