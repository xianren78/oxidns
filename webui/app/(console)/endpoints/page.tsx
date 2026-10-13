"use client";

import { useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  Pencil,
  Plus,
  Server,
  Trash2,
} from "lucide-react";
import { AppHeader } from "@/components/shell/app-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { type Endpoint, useAuthStore } from "@/lib/auth-store";
import { WEBUI } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";

type EndpointDraft = Omit<Endpoint, "id">;
const emptyDraft: EndpointDraft = {
  name: "",
  url: "",
  requiresAuth: false,
  username: "",
  password: "",
};

export default function EndpointsPage() {
  const { t } = useI18n();
  const endpoints = useAuthStore((state) => state.endpoints);
  const activeEndpointId = useAuthStore((state) => state.activeEndpointId);
  const addEndpoint = useAuthStore((state) => state.addEndpoint);
  const updateEndpoint = useAuthStore((state) => state.updateEndpoint);
  const deleteEndpoint = useAuthStore((state) => state.deleteEndpoint);
  const switchEndpoint = useAuthStore((state) => state.switchEndpoint);
  const testEndpoint = useAuthStore((state) => state.testEndpoint);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EndpointDraft>(emptyDraft);
  const [open, setOpen] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, boolean>>({});

  const edit = (endpoint?: Endpoint) => {
    setEditingId(endpoint?.id ?? null);
    setDraft(
      endpoint
        ? {
            name: endpoint.name,
            url: endpoint.url,
            requiresAuth: endpoint.requiresAuth,
            username: endpoint.username,
            password: endpoint.password,
          }
        : emptyDraft,
    );
    setOpen(true);
  };
  const save = () => {
    if (!draft.name.trim() || !draft.url.trim()) return;
    const normalized = {
      ...draft,
      name: draft.name.trim(),
      url: draft.url.trim(),
    };
    if (editingId) updateEndpoint(editingId, normalized);
    else addEndpoint(normalized);
    setOpen(false);
  };
  const test = async (endpoint: Endpoint) => {
    setTestingId(endpoint.id);
    const result = await testEndpoint(endpoint);
    setResults((current) => ({ ...current, [endpoint.id]: result.ok }));
    setTestingId(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppHeader title={t(WEBUI.endpoints.title)} />
      <main className="oxidns-dialog-scrollbar min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {t(WEBUI.endpoints.description)}
          </p>
          <Button size="sm" onClick={() => edit()}>
            <Plus className="size-4" />
            {t(WEBUI.endpoints.add)}
          </Button>
        </div>
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {endpoints.map((endpoint) => (
            <Card
              key={endpoint.id}
              className={
                endpoint.id === activeEndpointId ? "border-primary/60" : ""
              }
            >
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Server className="size-4" />
                  {endpoint.name}
                </CardTitle>
                <CardDescription className="truncate font-mono">
                  {endpoint.url}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex h-5 items-center gap-2 text-xs">
                  {endpoint.id === activeEndpointId && (
                    <span className="text-primary">
                      {t(WEBUI.endpoints.active)}
                    </span>
                  )}
                  {results[endpoint.id] === true && (
                    <span className="flex items-center gap-1 text-primary">
                      <CheckCircle2 className="size-3.5" />
                      {t(WEBUI.endpoints.connected)}
                    </span>
                  )}
                  {results[endpoint.id] === false && (
                    <span className="flex items-center gap-1 text-destructive">
                      <CircleAlert className="size-3.5" />
                      {t(WEBUI.endpoints.unreachable)}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void test(endpoint)}
                    disabled={testingId === endpoint.id}
                  >
                    {testingId === endpoint.id
                      ? t(WEBUI.endpoints.testing)
                      : t(WEBUI.endpoints.test)}
                  </Button>
                  {endpoint.id !== activeEndpointId && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void switchEndpoint(endpoint.id)}
                    >
                      {t(WEBUI.endpoints.switcher)}
                    </Button>
                  )}
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => edit(endpoint)}
                    aria-label={t(WEBUI.endpoints.edit)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => {
                      if (window.confirm(t(WEBUI.endpoints.deleteConfirm)))
                        deleteEndpoint(endpoint.id);
                    }}
                    aria-label={t(WEBUI.common.delete)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? t(WEBUI.endpoints.edit) : t(WEBUI.endpoints.add)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Field>
              <FieldLabel>{t(WEBUI.common.name)}</FieldLabel>
              <Input
                value={draft.name}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
              />
            </Field>
            <Field>
              <FieldLabel>{t(WEBUI.endpoints.url)}</FieldLabel>
              <Input
                value={draft.url}
                onChange={(event) =>
                  setDraft({ ...draft, url: event.target.value })
                }
                placeholder="https://dns.example/api"
              />
            </Field>
            <label className="flex items-center justify-between gap-3 text-sm">
              {t(WEBUI.endpoints.auth)}
              <Switch
                checked={draft.requiresAuth}
                onCheckedChange={(requiresAuth) =>
                  setDraft({ ...draft, requiresAuth })
                }
              />
            </label>
            {draft.requiresAuth && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>{t(WEBUI.endpoints.username)}</FieldLabel>
                  <Input
                    value={draft.username}
                    onChange={(event) =>
                      setDraft({ ...draft, username: event.target.value })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel>{t(WEBUI.endpoints.password)}</FieldLabel>
                  <Input
                    type="password"
                    value={draft.password}
                    onChange={(event) =>
                      setDraft({ ...draft, password: event.target.value })
                    }
                  />
                </Field>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={save}>{t(WEBUI.endpoints.save)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
