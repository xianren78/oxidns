/*
 * SPDX-FileCopyrightText: 2026 Sven Shi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Pencil, Trash2, PlugZap, Server, Loader2 } from "lucide-react";
import { AppHeader } from "@/components/shell/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import { useAuthStore } from "@/lib/auth-store";
import {
  DEFAULT_ENDPOINT,
  probeEndpoint,
  type Endpoint,
  type EndpointDraft,
} from "@/lib/endpoints";
import { useEndpointActions } from "@/hooks/use-endpoint-actions";
import { useI18n } from "@/lib/i18n/provider";
import { WEBUI } from "@/lib/i18n";

export default function EndpointsPage() {
  const { t } = useI18n();
  const endpoints = useAuthStore((s) => s.endpoints);
  const activeEndpointId = useAuthStore((s) => s.activeEndpointId);
  const rememberLogin = useAuthStore((s) => s.rememberLogin);
  const setRememberLogin = useAuthStore((s) => s.setRememberLogin);
  const { switchEndpoint, canChangeEndpoint } = useEndpointActions();
  const [editing, setEditing] = useState<Endpoint | "new" | null>(null);
  const [deleting, setDeleting] = useState<Endpoint | null>(null);

  const removeEndpoint = () => {
    if (!deleting) return;
    if (deleting.id === activeEndpointId && !canChangeEndpoint()) return;
    void useAuthStore.getState().removeEndpoint(deleting.id);
    setDeleting(null);
  };

  return (
    <>
      <AppHeader title={t(WEBUI.endpoints.manage)} />
      <main className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-5xl space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-medium">
                {t(WEBUI.endpoints.manage)}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t(WEBUI.endpoints.description)}
              </p>
            </div>
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" />
              {t(WEBUI.endpoints.add)}
            </Button>
          </div>
          <Card>
            <CardContent className="divide-y p-0">
              {!endpoints.length && (
                <p className="p-6 text-sm text-muted-foreground">
                  {t(WEBUI.endpoints.empty)}
                </p>
              )}
              {endpoints.map((endpoint) => (
                <div
                  key={endpoint.id}
                  className="flex flex-wrap items-center gap-3 p-4"
                >
                  <Server className="size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {endpoint.name}
                      </span>
                      {endpoint.id === activeEndpointId && (
                        <Badge variant="secondary">
                          {t(WEBUI.endpoints.active)}
                        </Badge>
                      )}
                    </div>
                    <p
                      className="truncate text-xs text-muted-foreground"
                      title={endpoint.url}
                    >
                      {endpoint.url}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void switchEndpoint(endpoint.id)}
                    >
                      <PlugZap className="size-3.5" />
                      {t(WEBUI.endpoints.activate)}
                    </Button>
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
              ))}
            </CardContent>
          </Card>
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

function EndpointForm({
  endpoint,
  onClose,
}: {
  endpoint: Endpoint | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { canChangeEndpoint } = useEndpointActions();
  const [draft, setDraft] = useState<EndpointDraft>(
    endpoint ?? { ...DEFAULT_ENDPOINT, name: "", url: "" },
  );
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const probe = useRef<AbortController | null>(null);
  useEffect(() => () => probe.current?.abort(), []);

  const change = (patch: Partial<EndpointDraft>) => {
    probe.current?.abort();
    setTesting(false);
    setResult(null);
    setError(null);
    setDraft((current) => ({ ...current, ...patch }));
  };
  const test = async () => {
    probe.current?.abort();
    const controller = new AbortController();
    probe.current = controller;
    setTesting(true);
    setResult(null);
    setError(null);
    try {
      const health = await probeEndpoint(draft, controller.signal);
      if (!controller.signal.aborted)
        setResult(t(WEBUI.endpoints.testSuccess, { version: health.version }));
    } catch (err) {
      if (!controller.signal.aborted)
        setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (probe.current === controller && !controller.signal.aborted)
        setTesting(false);
    }
  };
  const save = () => {
    const auth = useAuthStore.getState();
    if (endpoint?.id === auth.activeEndpointId && !canChangeEndpoint()) return;
    try {
      if (endpoint) {
        auth.updateEndpoint(endpoint.id, draft);
        if (endpoint.id === auth.activeEndpointId) void auth.connect();
      } else auth.addEndpoint(draft);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="endpoint-name">{t(WEBUI.endpoints.name)}</Label>
        <Input
          id="endpoint-name"
          value={draft.name}
          onChange={(event) => change({ name: event.target.value })}
          autoComplete="off"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="endpoint-url">{t(WEBUI.endpoints.url)}</Label>
        <Input
          id="endpoint-url"
          value={draft.url}
          onChange={(event) => change({ url: event.target.value })}
          placeholder="https://dns.example.com/api"
          autoComplete="url"
          required
        />
        <p className="text-xs text-muted-foreground">
          {t(WEBUI.endpoints.urlHelp)}
        </p>
      </div>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="endpoint-auth">{t(WEBUI.endpoints.auth)}</Label>
        <Switch
          id="endpoint-auth"
          checked={draft.requiresAuth}
          onCheckedChange={(requiresAuth) => change({ requiresAuth })}
        />
      </div>
      {draft.requiresAuth && (
        <>
          <div className="space-y-2">
            <Label htmlFor="endpoint-username">
              {t(WEBUI.endpoints.username)}
            </Label>
            <Input
              id="endpoint-username"
              value={draft.username}
              onChange={(event) => change({ username: event.target.value })}
              autoComplete="username"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="endpoint-password">
              {t(WEBUI.endpoints.password)}
            </Label>
            <Input
              id="endpoint-password"
              type="password"
              value={draft.password}
              onChange={(event) => change({ password: event.target.value })}
              autoComplete="current-password"
            />
          </div>
        </>
      )}
      {result && (
        <p role="status" className="text-sm text-primary">
          {result}
        </p>
      )}
      {error && (
        <p role="alert" className="break-words text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => void test()}
          disabled={testing}
        >
          {testing && <Loader2 className="size-4 animate-spin" />}
          {t(testing ? WEBUI.endpoints.testing : WEBUI.endpoints.test)}
        </Button>
        <Button type="submit">{t(WEBUI.endpoints.save)}</Button>
      </div>
    </form>
  );
}
