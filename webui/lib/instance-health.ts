import type { Endpoint } from "./auth-store";
import type { HealthResponse } from "./oxidns-api";

export type InstanceHealthState =
  | { status: "loading" }
  | { status: "online"; health: HealthResponse }
  | { status: "offline"; error: string };

const HEALTH_TIMEOUT_MS = 10_000;

export async function fetchEndpointHealth(
  endpoint: Endpoint,
): Promise<HealthResponse> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (endpoint.requiresAuth) {
    headers.Authorization = `Basic ${btoa(`${endpoint.username}:${endpoint.password}`)}`;
  }
  const response = await fetch(`${endpoint.url.replace(/\/$/, "")}/health`, {
    headers,
    signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<HealthResponse>;
}

export async function refreshEndpointHealth(
  endpoints: Endpoint[],
  onResult: (endpointId: string, state: InstanceHealthState) => void,
): Promise<void> {
  await Promise.all(
    endpoints.map(async (endpoint) => {
      let state: InstanceHealthState;
      try {
        state = {
          status: "online",
          health: await fetchEndpointHealth(endpoint),
        };
      } catch (error) {
        state = {
          status: "offline",
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
      // Publish each result as soon as its own request settles. A slow or
      // offline endpoint must not hold healthy instances in a loading state.
      onResult(endpoint.id, state);
    }),
  );
}
