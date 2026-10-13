/*
 * SPDX-FileCopyrightText: 2026 Sven Shi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useAuthStore } from "./auth-store";

let controller = new AbortController();
const responseEpochs = new WeakMap<Response, number>();

useAuthStore.subscribe((state, previous) => {
  if (state.connectionEpoch !== previous.connectionEpoch) {
    controller.abort();
    controller = new AbortController();
  }
});

export function assertCurrentResponse(response: Response): void {
  const epoch = responseEpochs.get(response);
  if (
    epoch !== undefined &&
    epoch !== useAuthStore.getState().connectionEpoch
  ) {
    throw new DOMException("Endpoint session changed", "AbortError");
  }
}

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const epoch = useAuthStore.getState().connectionEpoch;
  const signal = init?.signal
    ? AbortSignal.any([controller.signal, init.signal])
    : controller.signal;
  const response = await fetch(input, { ...init, signal });
  responseEpochs.set(response, epoch);
  assertCurrentResponse(response);
  return response;
}
