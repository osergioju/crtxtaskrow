import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { NpsToken, NpsResponse } from "@/types/nps";

async function npsGet<T>(path: string): Promise<T> {
  const res = await fetch(`/api/nps${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  return res.json();
}

async function npsPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/nps${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  return res.json();
}

async function npsDelete<T>(path: string): Promise<T> {
  const res = await fetch(`/api/nps${path}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  return res.json();
}

export function useNpsTokens() {
  return useQuery<NpsToken[]>({
    queryKey: ["nps-tokens"],
    queryFn: () => npsGet("/tokens"),
    staleTime: 0,
  });
}

export function useNpsTokenInfo(token: string) {
  return useQuery<NpsToken>({
    queryKey: ["nps-token", token],
    queryFn: () => npsGet(`/respond/${token}`),
    enabled: !!token,
    retry: false,
  });
}

export function useNpsResults(clientId: string | undefined) {
  return useQuery<NpsResponse[]>({
    queryKey: ["nps-results", clientId],
    queryFn: () => npsGet(`/results/${clientId}`),
    enabled: !!clientId,
    staleTime: 0,
  });
}

export function useCreateNpsToken() {
  const qc = useQueryClient();
  return useMutation<NpsToken, Error, { clientId: string; clientName: string; label: string }>({
    mutationFn: (data) => npsPost("/token", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nps-tokens"] }),
  });
}

export function useDeleteNpsToken() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, Error, string>({
    mutationFn: (token) => npsDelete(`/token/${token}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nps-tokens"] }),
  });
}

export function useSubmitNps(token: string) {
  return useMutation<{ ok: boolean }, Error, Record<string, number | string>>({
    mutationFn: (answers) => npsPost(`/respond/${token}`, { answers }),
  });
}
