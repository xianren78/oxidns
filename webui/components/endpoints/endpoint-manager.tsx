"use client";

import { useEffect, useState } from "react";
import { Check, CirclePlus, Pencil, Server, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { WEBUI } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";
import { useAuthStore, type Endpoint } from "@/lib/auth-store";

const EMPTY_ENDPOINT: Omit<Endpoint, "id"> = {
  name: "",
  url: "/api",
  requiresAuth: false,
  username: "",
  password: "",
};

export function EndpointManager() {
  const { t } = useI18n();
  const endpoints = useAuthStore((state) => state.endpoints);
  const activeEndpointId = useAuthStore((state) => state.activeEndpointId);
  const statuses = useAuthStore((state) => state.endpointStatuses);
  const addEndpoint = useAuthStore((state) => state.addEndpoint);
  const updateEndpoint = useAuthStore((state) => state.updateEndpoint);
  const removeEndpoint = useAuthStore((state) => state.removeEndpoint);
  const setActiveEndpoint = useAuthStore((state) => state.setActiveEndpoint);
  const connect = useAuthStore((state) => state.connect);
  const probeAllEndpoints = useAuthStore((state) => state.probeAllEndpoints);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(EMPTY_ENDPOINT);

  useEffect(() => {
    if (open) void probeAllEndpoints();
  }, [open, probeAllEndpoints]);

  const beginAdd = () => {
    setEditingId("");
    setDraft(EMPTY_ENDPOINT);
  };
  const beginEdit = (endpoint: Endpoint) => {
    setEditingId(endpoint.id);
    setDraft({
      name: endpoint.name,
      url: endpoint.url,
      requiresAuth: endpoint.requiresAuth,
      username: endpoint.username,
      password: endpoint.password,
    });
  };
  const save = () => {
    const value = { ...draft, name: draft.name.trim(), url: draft.url.trim() };
    if (!value.name || !value.url) return;
    if (editingId) updateEndpoint(editingId, value);
    else addEndpoint(value);
    setEditingId(null);
  };
  const activate = async (id: string) => {
    setActiveEndpoint(id);
    setOpen(false);
    await connect();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-start px-2">
          <Server className="size-4" />
          <span className="truncate">{t(WEBUI.endpoints.manage)}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t(WEBUI.endpoints.title)}</DialogTitle>
          <DialogDescription>
            {t(WEBUI.endpoints.description)}
          </DialogDescription>
        </DialogHeader>

        {editingId !== null ? (
          <div className="space-y-4 py-2">
            <label className="grid gap-1.5 text-sm">
              <span>{t(WEBUI.endpoints.name)}</span>
              <Input
                value={draft.name}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
                autoFocus
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span>{t(WEBUI.endpoints.url)}</span>
              <Input
                value={draft.url}
                onChange={(event) =>
                  setDraft({ ...draft, url: event.target.value })
                }
                placeholder="https://dns.example.com/api"
              />
            </label>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-sm font-medium">
                {t(WEBUI.endpoints.auth)}
              </span>
              <Switch
                checked={draft.requiresAuth}
                onCheckedChange={(requiresAuth) =>
                  setDraft({ ...draft, requiresAuth })
                }
              />
            </div>
            {draft.requiresAuth && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm">
                  <span>{t(WEBUI.endpoints.username)}</span>
                  <Input
                    value={draft.username}
                    onChange={(event) =>
                      setDraft({ ...draft, username: event.target.value })
                    }
                    autoComplete="username"
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span>{t(WEBUI.endpoints.password)}</span>
                  <Input
                    type="password"
                    value={draft.password}
                    onChange={(event) =>
                      setDraft({ ...draft, password: event.target.value })
                    }
                    autoComplete="current-password"
                  />
                </label>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingId(null)}>
                {t(WEBUI.common.cancel)}
              </Button>
              <Button
                onClick={save}
                disabled={!draft.name.trim() || !draft.url.trim()}
              >
                {t(WEBUI.endpoints.save)}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            {endpoints.map((endpoint) => {
              const active = endpoint.id === activeEndpointId;
              const status = statuses[endpoint.id]?.availability ?? "unknown";
              return (
                <div
                  key={endpoint.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3",
                    active && "border-primary/50 bg-primary/5",
                  )}
                >
                  <span
                    className={cn(
                      "size-2.5 shrink-0 rounded-full bg-muted-foreground/50",
                      status === "online" && "bg-green-500",
                      (status === "offline" || status === "auth-required") &&
                        "bg-destructive",
                      status === "checking" && "animate-pulse bg-amber-500",
                    )}
                  />
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => void activate(endpoint.id)}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <span className="truncate">{endpoint.name}</span>
                      {active && <Check className="size-3.5 text-primary" />}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {endpoint.url}
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => beginEdit(endpoint)}
                  >
                    <Pencil className="size-4" />
                    <span className="sr-only">{t(WEBUI.endpoints.edit)}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={endpoints.length === 1}
                    onClick={() => {
                      if (
                        window.confirm(
                          t(WEBUI.endpoints.removeDescription, {
                            name: endpoint.name,
                          }),
                        )
                      ) {
                        removeEndpoint(endpoint.id);
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                    <span className="sr-only">{t(WEBUI.common.delete)}</span>
                  </Button>
                </div>
              );
            })}
            <Button variant="outline" className="w-full" onClick={beginAdd}>
              <CirclePlus className="size-4" />
              {t(WEBUI.endpoints.add)}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
