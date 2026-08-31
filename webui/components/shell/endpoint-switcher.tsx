"use client";

import { Server, Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WEBUI } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";

export function EndpointSwitcher() {
  const { t } = useI18n();
  const router = useRouter();
  const endpoints = useAuthStore((state) => state.endpoints);
  const activeEndpointId = useAuthStore((state) => state.activeEndpointId);
  const switchEndpoint = useAuthStore((state) => state.switchEndpoint);
  const active = endpoints.find((endpoint) => endpoint.id === activeEndpointId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="max-w-48 gap-2">
          <Server className="size-4 shrink-0" />
          <span className="truncate">{active?.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>{t(WEBUI.endpoints.switcher)}</DropdownMenuLabel>
        {endpoints.map((endpoint) => (
          <DropdownMenuItem
            key={endpoint.id}
            onClick={() => void switchEndpoint(endpoint.id)}
            className="flex flex-col items-start"
          >
            <span
              className={
                endpoint.id === activeEndpointId
                  ? "font-medium text-primary"
                  : ""
              }
            >
              {endpoint.name}
            </span>
            <span className="max-w-full truncate text-xs text-muted-foreground">
              {endpoint.url}
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/endpoints")}>
          <Settings2 className="size-4" />
          {t(WEBUI.endpoints.manage)}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
