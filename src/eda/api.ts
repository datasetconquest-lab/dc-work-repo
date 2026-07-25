import { API_BASE_URL } from '../lib/api';
import { getStoredAuth } from '../lib/authStorage';

// EDA portal API client — talks to the Teams Node server's /api/eda/* routes,
// which enforce auth + per-user ownership and proxy pipeline runs to the
// Research Assistant Python service.

export interface EdaChat {
  _id: string;
  user_id: string;
  title: string;
  problem_statement: string;
  keywords: string[];
  year_start?: number;
  year_end?: number;
  venues: string[];
  strong_only: boolean;
  sources: string[];
  max_results: number;
  has_papers: boolean;
  has_index: boolean;
  has_review: boolean;
  has_gaps: boolean;
  has_datasets: boolean;
  created_at: string;
  updated_at: string;
}

export type Stage = 'ingest' | 'index' | 'review' | 'gaps' | 'datasets' | 'eda' | 'humanize';

export interface JobView {
  id: string;
  kind: string;
  status: 'running' | 'done' | 'error';
  log: string[];
  error: string | null;
  result: unknown;
}

async function edaFetch(path: string, options: { method?: string; body?: unknown } = {}) {
  const token = getStoredAuth()?.token;
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const init: RequestInit = { method: options.method || 'GET', headers };
  if (options.body && init.method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }
  const res = await fetch(`${API_BASE_URL}/eda${path}`, init);
  const text = await res.text();
  let parsed: any = null;
  if (text) {
    try { parsed = JSON.parse(text); } catch { parsed = { message: text }; }
  }
  if (!res.ok) {
    throw new Error(parsed?.error || parsed?.message || `EDA API error: ${res.statusText}`);
  }
  return parsed;
}

export const edaApi = {
  listChats: (): Promise<EdaChat[]> => edaFetch('/chats'),

  // keywords may be a comma-separated string or an array — the server accepts both.
  createChat: (payload: object): Promise<EdaChat> =>
    edaFetch('/chats', { method: 'POST', body: payload }),

  getChat: (id: string): Promise<{ chat: EdaChat; results: Record<string, any> }> =>
    edaFetch(`/chats/${id}`),

  patchChat: (id: string, payload: Partial<EdaChat>): Promise<EdaChat> =>
    edaFetch(`/chats/${id}`, { method: 'PATCH', body: payload }),

  deleteChat: (id: string): Promise<{ ok: boolean }> =>
    edaFetch(`/chats/${id}`, { method: 'DELETE' }),

  runStage: (id: string, stage: Stage, params?: Record<string, unknown>): Promise<{ job_id: string }> =>
    edaFetch(`/chats/${id}/run`, { method: 'POST', body: { stage, params: params || {} } }),

  getJob: (jid: string): Promise<JobView> => edaFetch(`/jobs/${jid}`),

  listModels: (): Promise<{ models: string[]; default: string | null }> =>
    edaFetch('/models'),
};

// Poll a job to completion, streaming log lines via onLog.
export async function pollJob(
  jid: string,
  onLog: (lines: string[]) => void,
  intervalMs = 1200,
): Promise<JobView> {
  let seen = 0;
  for (;;) {
    const job = await edaApi.getJob(jid);
    if (job.log && job.log.length > seen) {
      onLog(job.log.slice(seen));
      seen = job.log.length;
    }
    if (job.status === 'done' || job.status === 'error') return job;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
