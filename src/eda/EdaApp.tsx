import { useEffect, useState, useCallback } from 'react';
import { usePortal } from '../contexts/PortalContext';
import { useAuth } from '../contexts/AuthContext';
import { EDA_LIGHT, EDA_DARK, EdaPalette } from './theme';
import { EdaThemeProvider, Pill, SegBar, sectionLabel } from './ui';
import { edaApi, pollJob, EdaChat, Stage } from './api';
import {
  ProjectSidebar, NewResearchValues, TabHeader,
  PapersView, ReviewView, GapsView, DatasetsView, EdaFileView, HumanizerView,
} from './panels';
import { ArrowLeft, LogOut, Sun, Moon, Cpu, KeyRound } from 'lucide-react';

type Tab = 'papers' | 'review' | 'gaps' | 'datasets' | 'eda' | 'humanize';
const TABS: { key: Tab; label: string }[] = [
  { key: 'papers', label: 'Papers' },
  { key: 'review', label: 'Lit Review' },
  { key: 'gaps', label: 'Open Problems' },
  { key: 'datasets', label: 'Datasets' },
  { key: 'eda', label: 'EDA' },
  { key: 'humanize', label: 'Humanizer' },
];
const FULL_SEQUENCE: Stage[] = ['ingest', 'index', 'review', 'gaps', 'datasets'];

// ---- Model selection: local Ollama models, or a hosted model via API key ----

// Sentinel values used inside the model <select>.
export const API_OPTION = '__api__';
const CUSTOM_OPTION = '__custom__';

// The desktop build serves the UI from localhost; only there can we talk to a
// local Ollama, so "add your own offline model" is a desktop-only option.
const IS_DESKTOP = typeof window !== 'undefined'
  && ['localhost', '127.0.0.1'].includes(window.location.hostname);

export interface ApiCfg {
  provider: 'anthropic' | 'openai';
  key: string;
  model: string;
  base_url: string;   // optional: any OpenAI-compatible endpoint (Groq, OpenRouter…)
}

const API_CFG_KEY = 'dc_eda_api_cfg';

function loadApiCfg(): ApiCfg {
  const empty: ApiCfg = { provider: 'anthropic', key: '', model: '', base_url: '' };
  try {
    const raw = localStorage.getItem(API_CFG_KEY);
    return raw ? { ...empty, ...JSON.parse(raw) } : empty;
  } catch { return empty; }
}

function saveApiCfg(cfg: ApiCfg) {
  try { localStorage.setItem(API_CFG_KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
}

// Prerequisite stages that must run before `stage` if not already done.
function chainFor(stage: Stage, chat: EdaChat): Stage[] {
  const need: Stage[] = [];
  const needsPapers = stage === 'index' || stage === 'review' || stage === 'gaps' || stage === 'datasets';
  const needsIndex = stage === 'review' || stage === 'gaps';
  if (needsPapers && !chat.has_papers) need.push('ingest');
  if (needsIndex && !chat.has_index) need.push('index');
  need.push(stage);
  return need;
}

export function EdaApp() {
  const { clearPortal } = usePortal();
  const { signOut } = useAuth();
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const C: EdaPalette = mode === 'dark' ? EDA_DARK : EDA_LIGHT;

  const [chats, setChats] = useState<EdaChat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ chat: EdaChat; results: Record<string, any> } | null>(null);
  const [tab, setTab] = useState<Tab>('papers');
  const [running, setRunning] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState('');
  const [edaPrefill, setEdaPrefill] = useState('');
  // Hosted-model config (provider + API key). Kept in the browser only — it is
  // sent with a run and never stored on the server or in the database.
  const [api, setApi] = useState<ApiCfg>(loadApiCfg);
  const [showApi, setShowApi] = useState(false);
  const usingApi = model === API_OPTION;

  const refreshChats = useCallback(async () => {
    try { setChats(await edaApi.listChats()); }
    catch (e: any) { setError(e.message); }
  }, []);

  useEffect(() => { refreshChats(); }, [refreshChats]);

  // Load the local LLM models so the user can switch which one drives the
  // review / gaps / dataset / EDA reasoning.
  useEffect(() => {
    edaApi.listModels()
      .then((r) => {
        setModels(r.models || []);
        setModel((cur) => cur || r.default || (r.models && r.models[0]) || '');
      })
      .catch(() => { /* selector just stays empty if the service is down */ });
  }, []);

  const openChat = useCallback(async (id: string) => {
    setError(''); setActiveId(id); setTab('papers');
    try { setDetail(await edaApi.getChat(id)); }
    catch (e: any) { setError(e.message); }
  }, []);

  const runSequence = useCallback(async (chatId: string, stages: Stage[], finalParams?: Record<string, unknown>) => {
    setError('');
    for (let i = 0; i < stages.length; i++) {
      const s = stages[i];
      setRunning(s);
      try {
        const isLast = i === stages.length - 1;
        // The chosen model applies to every LLM-using stage, so include it in
        // each run's params (the service reads params.llm_* per stage). With a
        // hosted model we also pass the provider + key (browser-held only).
        const llm = model === API_OPTION
          ? {
              llm_model: api.model,
              llm_provider: api.provider,
              llm_api_key: api.key,
              ...(api.base_url ? { llm_base_url: api.base_url } : {}),
            }
          : (model ? { llm_model: model } : {});
        const params = { ...(isLast ? finalParams : {}), ...llm };
        const { job_id } = await edaApi.runStage(chatId, s, params);
        const job = await pollJob(job_id, (lines) => setLog((prev) => [...prev, ...lines]));
        if (job.status === 'error') { setError(job.error || `${s} failed`); break; }
        setDetail(await edaApi.getChat(chatId));
      } catch (e: any) { setError(e.message); break; }
    }
    setRunning(null);
    await refreshChats();
  }, [refreshChats, model, api]);

  const runOne = useCallback((stage: Stage, params?: Record<string, unknown>) => {
    if (!detail) return Promise.resolve();
    return runSequence(detail.chat._id, chainFor(stage, detail.chat), params);
  }, [detail, runSequence]);

  const createAndAutoRun = async (v: NewResearchValues) => {
    setError(''); setLog([]);
    try {
      const chat = await edaApi.createChat(v);
      setChats((prev) => [chat, ...prev]);
      setActiveId(chat._id);
      setDetail({ chat, results: {} });
      setTab('papers');
      await runSequence(chat._id, FULL_SEQUENCE);
    } catch (e: any) { setError(e.message); }
  };

  const removeChat = async (id: string) => {
    if (!window.confirm('Delete this project and all its results? This cannot be undone.')) return;
    try {
      await edaApi.deleteChat(id);
      setChats((prev) => prev.filter((c) => c._id !== id));
      if (activeId === id) { setActiveId(null); setDetail(null); }
    } catch (e: any) { setError(e.message); }
  };

  const barBtn: React.CSSProperties = { background: C.surface, border: `2px solid ${C.border}`, borderRadius: 10, fontWeight: 800, padding: '8px 12px', cursor: 'pointer', color: C.text, display: 'inline-flex', alignItems: 'center', gap: 8 };

  return (
    <EdaThemeProvider palette={C}>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: C.bg, color: C.text, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
        {/* Utility bar: portal switch + theme + sign out (brand lives in the sidebar) */}
        <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: C.sidebar, borderBottom: `2px solid ${C.border}` }}>
          <button onClick={clearPortal} style={barBtn}><ArrowLeft className="w-4 h-4" /> Back to Portals</button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13 }} title="LLM used for review, gaps, datasets and EDA reasoning">
              <Cpu className="w-4 h-4" />
              <select
                value={model}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === CUSTOM_OPTION) {
                    const name = window.prompt(
                      'Offline model name, exactly as "ollama list" shows it\n(e.g. mistral:7b, phi3:mini)');
                    if (name && name.trim()) {
                      const m = name.trim();
                      setModels((prev) => (prev.includes(m) ? prev : [...prev, m]));
                      setModel(m);
                    }
                    return;
                  }
                  setModel(v);
                  if (v === API_OPTION) setShowApi(true);
                }}
                disabled={!!running}
                style={{ ...barBtn, padding: '8px 10px', cursor: running ? 'not-allowed' : 'pointer' }}
              >
                {models.map((m) => <option key={m} value={m}>{m}</option>)}
                {IS_DESKTOP && <option value={CUSTOM_OPTION}>+ Add offline model…</option>}
                <option value={API_OPTION}>
                  {api.model ? `API: ${api.model}` : 'Use API key…'}
                </option>
              </select>
            </label>
            {usingApi && (
              <button onClick={() => setShowApi((v) => !v)} style={{ ...barBtn, padding: '8px 10px' }}
                title="Configure API key">
                <KeyRound className="w-4 h-4" />
              </button>
            )}
            <button onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')} style={{ ...barBtn, padding: '8px 10px' }} aria-label="Toggle theme">
              {mode === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button onClick={() => signOut()} style={barBtn}><LogOut className="w-4 h-4" /> Sign out</button>
          </div>
        </header>

        {showApi && (
          <div style={{ background: C.surface, borderBottom: `2px solid ${C.border}`, padding: '12px 16px' }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <div style={sectionLabel(C)}>Provider</div>
                <select
                  value={api.provider}
                  onChange={(e) => setApi({ ...api, provider: e.target.value as ApiCfg['provider'] })}
                  style={{ ...barBtn, padding: '8px 10px', marginTop: 4 }}
                >
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="openai">OpenAI-compatible</option>
                </select>
              </div>
              <div style={{ flex: '1 1 200px' }}>
                <div style={sectionLabel(C)}>Model</div>
                <input
                  value={api.model}
                  onChange={(e) => setApi({ ...api, model: e.target.value })}
                  placeholder={api.provider === 'anthropic' ? 'claude-sonnet-4-5' : 'gpt-4o-mini'}
                  style={{ ...barBtn, padding: '8px 10px', marginTop: 4, width: '100%', fontWeight: 600 }}
                />
              </div>
              <div style={{ flex: '2 1 260px' }}>
                <div style={sectionLabel(C)}>API key</div>
                <input
                  type="password"
                  value={api.key}
                  onChange={(e) => setApi({ ...api, key: e.target.value })}
                  placeholder={api.provider === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
                  style={{ ...barBtn, padding: '8px 10px', marginTop: 4, width: '100%', fontWeight: 600 }}
                />
              </div>
              {api.provider === 'openai' && (
                <div style={{ flex: '1 1 220px' }}>
                  <div style={sectionLabel(C)}>Base URL (optional)</div>
                  <input
                    value={api.base_url}
                    onChange={(e) => setApi({ ...api, base_url: e.target.value })}
                    placeholder="https://api.groq.com/openai/v1"
                    style={{ ...barBtn, padding: '8px 10px', marginTop: 4, width: '100%', fontWeight: 600 }}
                  />
                </div>
              )}
              <button onClick={() => { saveApiCfg(api); setShowApi(false); }} style={{ ...barBtn, background: C.accent, color: C.accent_text }}>
                Save
              </button>
            </div>
            <div style={{ color: C.muted, fontSize: 11, fontWeight: 600, marginTop: 8 }}>
              The key is stored in this browser only and sent with each run — it is never saved on the server or in the database.
            </div>
          </div>
        )}

        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <ProjectSidebar
            chats={chats} activeId={activeId} onSelect={openChat} onDelete={removeChat}
            onRefresh={refreshChats} onCreate={createAndAutoRun} busy={!!running}
          />

          <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, padding: '20px 22px 16px' }}>
            {error && (
              <div style={{ background: C.danger, color: '#fff', border: `2px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', fontWeight: 700, marginBottom: 14 }}>
                {error}
              </div>
            )}

            {!detail && (
              <div style={{ maxWidth: 560, margin: '80px auto', textAlign: 'center', background: C.surface, border: `2px solid ${C.border}`, borderRadius: 14, padding: 40, boxShadow: `4px 4px 0 ${C.shadow}` }}>
                <div style={{ fontSize: 22, fontWeight: 900 }}>No project selected</div>
                <p style={{ color: C.muted, marginTop: 8 }}>
                  Pick a project on the left, or fill in "New review" to start one —
                  it fetches papers, reviews them, finds open problems, and sources datasets automatically.
                </p>
              </div>
            )}

            {detail && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <div style={{ fontSize: 22, fontWeight: 900 }}>{detail.chat.title}</div>
                  <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
                    <Pill text="papers" color={C.success} on={detail.chat.has_papers} />
                    <Pill text="index" color={C.success} on={detail.chat.has_index} />
                    <Pill text="review" color={C.success} on={detail.chat.has_review} />
                    <Pill text="gaps" color={C.success} on={detail.chat.has_gaps} />
                    <Pill text="datasets" color={C.success} on={detail.chat.has_datasets} />
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}><SegBar tabs={TABS} active={tab} onChange={setTab} /></div>

                <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
                  {tab === 'papers' && (
                    <>
                      <TabHeader title="Papers" done={detail.chat.has_papers} running={!!running}
                        onRun={() => runOne('ingest')} runLabel="Fetch papers" />
                      <PapersView data={detail.results.metadata} />
                    </>
                  )}
                  {tab === 'review' && (
                    <>
                      <TabHeader title="Lit Review" done={detail.chat.has_review} running={!!running}
                        onRun={() => runOne('review')} runLabel="Literature review" />
                      <ReviewView data={detail.results.lit_review} />
                    </>
                  )}
                  {tab === 'gaps' && (
                    <>
                      <TabHeader title="Open Problems" done={detail.chat.has_gaps} running={!!running}
                        onRun={() => runOne('gaps')} runLabel="Find gaps" />
                      <GapsView data={detail.results.gaps} />
                    </>
                  )}
                  {tab === 'datasets' && (
                    <>
                      <TabHeader title="Datasets" done={detail.chat.has_datasets} running={!!running}
                        onRun={() => runOne('datasets')} runLabel="Find datasets" />
                      <DatasetsView data={detail.results.datasets}
                        onAnalyze={(target) => { setEdaPrefill(target); setTab('eda'); }} />
                    </>
                  )}
                  {tab === 'eda' && (
                    <EdaFileView data={detail.results.eda} running={!!running} prefill={edaPrefill}
                      onRun={(dataPath) => runOne('eda', { data_path: dataPath, use_llm: true })} />
                  )}
                  {tab === 'humanize' && (
                    <HumanizerView data={detail.results.humanize} running={!!running}
                      onRun={(text, strength) => runOne('humanize', { text, strength })} />
                  )}
                </div>
              </>
            )}

            {/* Activity log — always visible at the bottom, like the desktop app. */}
            <div style={{ marginTop: 14 }}>
              <div style={sectionLabel(C)}>Activity</div>
              <pre style={{
                marginTop: 8, background: C.surface, border: `2px solid ${C.border}`, borderRadius: 10,
                padding: 10, height: 120, overflowY: 'auto', color: C.muted, fontSize: 12,
                fontFamily: "'Cascadia Code','Consolas',monospace", whiteSpace: 'pre-wrap',
              }}>
                {log.length ? log.join('\n') : 'Ready.'}
              </pre>
            </div>
          </main>
        </div>
      </div>
    </EdaThemeProvider>
  );
}
