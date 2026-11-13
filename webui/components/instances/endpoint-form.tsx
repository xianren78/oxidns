/*
 * SPDX-FileCopyrightText: 2026 Sven Shi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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

export function EndpointForm({
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
