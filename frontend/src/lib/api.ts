import { firebaseEnabled, idToken } from "./firebase";
import type {
  AuditEntry, CareRequest, Caregiver, ChangeEvent, Client, Credential, CredentialFields, Dashboard,
  EventType, Health, MatchResult, Message, Reference, Requirements, Sample, SendResult, ShiftView, Thread,
} from "./types";

const BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
  get aiUnavailable() { return this.code === "ai_unavailable"; }
}

function localWorkspace(): string {
  const key = "kaigo.workspace";
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id = `local-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return "local";
  }
}

async function headers(json: boolean): Promise<Record<string, string>> {
  const h: Record<string, string> = json ? { "Content-Type": "application/json" } : {};
  if (firebaseEnabled) {
    let token: string | null = null;
    try {
      token = await idToken();
    } catch {
      throw new ApiError(0, "auth", "Couldn't start a secure session for your demo workspace. Reload the page in a minute; if it keeps happening, sign-in is temporarily unavailable.");
    }
    if (token) h.Authorization = `Bearer ${token}`;
  } else {
    h["X-Workspace-Id"] = localWorkspace();
  }
  return h;
}

async function request<T>(path: string, init: RequestInit = {}, json = true): Promise<T> {
  const auth = await headers(json); // sign-in problems surface as their own error, not as "network"
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers: { ...auth, ...(init.headers ?? {}) } });
  } catch {
    throw new ApiError(0, "network", "Can't reach the Kaigo service. Check your connection and try again.");
  }
  if (!res.ok) {
    let detail: { code?: string; message?: string } & Record<string, unknown> = {};
    try {
      const body = await res.json();
      detail = typeof body.detail === "object" ? body.detail : { message: String(body.detail ?? "") };
    } catch { /* non-JSON error */ }
    throw new ApiError(res.status, detail.code ?? "error", detail.message || `Request failed (${res.status}).`, detail);
  }
  return res.json() as Promise<T>;
}

const get = <T,>(path: string) => request<T>(path);
const post = <T,>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
const put = <T,>(path: string, body: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(body) });

export const api = {
  health: () => get<Health>("/api/health"),
  dashboard: () => get<Dashboard>("/api/dashboard"),
  reset: (scenario: "fresh" | "after_assignment") => post<Record<string, string>>("/api/workspace/reset", { scenario }),
  caregivers: () => get<Caregiver[]>("/api/caregivers"),
  clients: () => get<Client[]>("/api/clients"),
  audit: (limit = 50) => get<AuditEntry[]>(`/api/audit?limit=${limit}`),
  reference: () => get<Reference>("/api/reference"),
  metrics: () => get<{ ai_calls: number; by_task: Record<string, { calls: number; ok: number; median_latency_ms: number | null; input_tokens: number; output_tokens: number }> }>("/api/metrics"),
  shifts: (params: { client_id?: string; assignment_id?: string; caregiver_id?: string }) =>
    get<ShiftView[]>(`/api/shifts?${new URLSearchParams(params as Record<string, string>)}`),

  samples: () => get<Sample[]>("/api/samples"),
  sampleUrl: (file: string) => `${BASE}/api/samples/${encodeURIComponent(file)}`,
  credentials: () => get<Credential[]>("/api/credentials"),
  extractSample: (sample: string, caregiverId?: string) => {
    const form = new FormData();
    form.set("sample", sample);
    if (caregiverId) form.set("caregiver_id", caregiverId);
    return request<Credential>("/api/credentials/extract", { method: "POST", body: form }, false);
  },
  uploadCredential: (file: File, caregiverId?: string) => {
    const form = new FormData();
    form.set("file", file);
    if (caregiverId) form.set("caregiver_id", caregiverId);
    return request<Credential>("/api/credentials/extract", { method: "POST", body: form }, false);
  },
  manualCredential: (caregiver_id: string | undefined, document_name: string, fields: CredentialFields) =>
    post<Credential>("/api/credentials/manual", { caregiver_id, document_name, fields }),
  decideCredential: (id: string, action: "approve" | "reject", note?: string) =>
    post<Credential>(`/api/credentials/${id}/decision`, { action, note }),

  careRequests: () => get<CareRequest[]>("/api/care-requests"),
  careRequest: (id: string) => get<CareRequest>(`/api/care-requests/${id}`),
  extractRequest: (client_id: string, text: string) => post<CareRequest>("/api/care-requests/extract", { client_id, text }),
  createRequest: (client_id: string, requirements: Requirements, text?: string) =>
    post<CareRequest>("/api/care-requests", { client_id, requirements, text }),
  updateRequirements: (id: string, requirements: Requirements, confirmed_fields: string[]) =>
    put<CareRequest>(`/api/care-requests/${id}/requirements`, { requirements, confirmed_fields }),
  confirmRequest: (id: string) => post<CareRequest>(`/api/care-requests/${id}/confirm`),
  matches: (id: string) => get<MatchResult>(`/api/care-requests/${id}/matches`),
  explainMatches: (id: string) => post<{ explanations: Record<string, string> }>(`/api/care-requests/${id}/matches/explain`),
  assign: (id: string, caregiver_id: string) =>
    post<{ summary: string; assignment: { id: string } }>(`/api/care-requests/${id}/assign`, { caregiver_id }),

  events: () => get<ChangeEvent[]>("/api/events"),
  event: (id: string) => get<ChangeEvent>(`/api/events/${id}`),
  interpret: (text: string) => post<ChangeEvent>("/api/events/interpret", { text, source: "sms" }),
  reportEvent: (caregiver_id: string, date: string, event_type: EventType, note?: string) =>
    post<ChangeEvent>("/api/events/manual", { caregiver_id, date, event_type, note }),
  explainEvent: (id: string) => post<ChangeEvent>(`/api/events/${id}/explain`),
  decideEvent: (id: string, action: "approved" | "rejected", option_id?: string, note?: string) =>
    post<ChangeEvent>(`/api/events/${id}/decision`, { action, option_id, note }),
  handover: (id: string) => post<ChangeEvent>(`/api/events/${id}/handover`),
  threads: () => get<Thread[]>("/api/threads"),
  thread: (caregiverId: string) => get<Message[]>(`/api/threads/${caregiverId}/messages`),
  sendMessage: (caregiverId: string, text: string, sender: "caregiver" | "coordinator") =>
    post<SendResult>(`/api/threads/${caregiverId}/messages`, { text, sender }),
  markRead: (caregiverId: string, by: "caregiver" | "coordinator") =>
    post<{ marked: number }>(`/api/threads/${caregiverId}/read`, { by }),
  runChecks: () => post<{ opened: ChangeEvent[]; message: string }>("/api/continuity/scan"),
  credentialDocument: async (id: string): Promise<string> => {
    const res = await fetch(`${BASE}/api/credentials/${id}/document`, { headers: await headers(false) });
    if (!res.ok) throw new ApiError(res.status, "not_found", "The stored document couldn't be loaded.");
    return URL.createObjectURL(await res.blob());
  },
};
