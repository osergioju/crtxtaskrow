import type { AdvancedSearchPayload, TaskrowTask } from "@/types/taskrow";
import { useDashboardStore } from "@/store/dashboardStore";
import { supabase } from "@/integrations/supabase/client";

const TASKROW_HOST = "https://crtcomunicacao.taskrow.com";

async function taskrowFetch(path: string, options: { method?: string; body?: string; params?: Record<string, any> } = {}): Promise<Response> {
  const apiKey = useDashboardStore.getState().apiKey;
  const method = options.method || "GET";

  const url = new URL(`${window.location.origin}/taskrow-api${path}`);
  if (options.params) {
    Object.entries(options.params).forEach(([k, v]) => {
      if (v != null) url.searchParams.append(k, String(v));
    });
  }
  return fetch(url.toString(), {
    method,
    headers: {
      "__identifier": apiKey,
      "Content-Type": "application/json",
    },
    body: options.body,
  });
}

export async function apiGet<T>(path: string, params?: Record<string, any>): Promise<T> {
  const res = await taskrowFetch(path, { params });
  if (!res.ok) {
    let detail = res.statusText || "";
    try {
      const body = await res.json();
      if (body?.Message) detail = body.Message;
      if (body?.error) detail = body.error;
    } catch { /* ignore parse errors */ }
    throw new Error(`API ${res.status}: ${detail || "Error"}`);
  }
  return res.json();
}

export async function apiPost<T>(path: string, body: object): Promise<T> {
  const res = await taskrowFetch(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = res.statusText || "";
    try {
      const body = await res.json();
      if (body?.Message) detail = body.Message;
      if (body?.error) detail = body.error;
    } catch { /* ignore parse errors */ }
    throw new Error(`API ${res.status}: ${detail || "Error"}`);
  }
  return res.json();
}

export async function fetchAllTasks(payload: AdvancedSearchPayload): Promise<TaskrowTask[]> {
  let all: TaskrowTask[] = [];
  let offset = 0;
  while (true) {
    const res = await apiPost<{ data: TaskrowTask[]; nextOffset: number }>(
      "/api/v2/search/tasks/advancedsearch",
      { ...payload, Offset: offset }
    );
    all = [...all, ...(res.data || [])];
    if (!res.nextOffset || (res.data?.length || 0) < 200) break;
    offset = res.nextOffset;
  }
  return all;
}
