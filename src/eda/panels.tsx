import { useState, useEffect } from 'react';
import { EdaChat } from './api';
import { useC, Card, Pill, Tag, Btn, sectionLabel } from './ui';
import { Plus, Trash2, FileText, ExternalLink, RefreshCw, Copy, Check, PlayCircle } from 'lucide-react';

// ---- Harvard-style citation helpers (client-side, from paper metadata) ----

function _harvardAuthors(authors: string[]): string {
  const fmt = (name: string): string => {
    const n = (name || '').trim();
    if (!n) return '';
    if (n.includes(',')) return n; // already "Surname, Initials"
    const parts = n.split(/\s+/);
    const surname = parts.pop() || n;
    const initials = parts.map((p) => `${p[0].toUpperCase()}.`).join('');
    return initials ? `${surname}, ${initials}` : surname;
  };
  const list = (authors || []).map(fmt).filter(Boolean);
  if (!list.length) return 'Anon.';
  if (list.length === 1) return list[0];
  if (list.length <= 3) return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
  return `${list[0]} et al.`;
}

export function harvardCitation(p: any): string {
  const authors = _harvardAuthors(p.authors || []);
  const year = p.year || 'n.d.';
  const title = (p.title || 'Untitled').replace(/\.$/, '');
  const venue = p.venue || p.source || '';
  const loc = p.doi ? `doi: ${p.doi}` : (p.url ? `Available at: ${p.url}` : '');
  return `${authors} (${year}) '${title}'${venue ? `, ${venue}` : ''}.${loc ? ` ${loc}` : ''}`;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); }
    catch { /* clipboard blocked — fall back to a textarea select */
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
    setDone(true); setTimeout(() => setDone(false), 1600);
  };
  return (
    <Btn onClick={copy}>
      {done ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {done ? 'Copied!' : label}
    </Btn>
  );
}

// ---- Sidebar: brand + persistent project list + new-review form ----------
// Mirrors the desktop app's sidebar (main_window.py _build_sidebar): brand,
// "Projects" list, and an always-visible "New review" form with the same
// fields (name, problem, year range, max, venues, strong-only, Start research).
const ALL_SOURCES = [
  { key: 'semantic_scholar', label: 'Semantic Scholar' },
  { key: 'arxiv', label: 'arXiv' },
  { key: 'openalex', label: 'OpenAlex' },
  { key: 'crossref', label: 'Crossref' },
  { key: 'europepmc', label: 'Europe PMC' },
];

export interface NewResearchValues {
  title: string;
  problem_statement: string;
  keywords: string;
  year_start?: number;
  year_end?: number;
  max_results: number;
  venues: string;
  strong_only: boolean;
  sources: string[];
}

export function ProjectSidebar(
  { chats, activeId, onSelect, onDelete, onRefresh, onCreate, busy }:
  {
    chats: EdaChat[]; activeId: string | null; onSelect: (id: string) => void;
    onDelete: (id: string) => void; onRefresh: () => void;
    onCreate: (v: NewResearchValues) => void; busy: boolean;
  },
) {
  const C = useC();
  const [name, setName] = useState('');
  const [problem, setProblem] = useState('');
  const [keywords, setKeywords] = useState('');
  const [yearStart, setYearStart] = useState('2021');
  const [yearEnd, setYearEnd] = useState('2024');
  const [maxResults, setMaxResults] = useState('20');
  const [venues, setVenues] = useState('');
  const [strongOnly, setStrongOnly] = useState(false);
  const [sources, setSources] = useState<string[]>(ALL_SOURCES.map((s) => s.key));

  const input: React.CSSProperties = {
    background: C.surface, border: `2px solid ${C.border}`, borderRadius: 10,
    padding: '8px 10px', fontWeight: 600, color: C.text, width: '100%',
  };
  const label: React.CSSProperties = { ...sectionLabel(C), display: 'block', marginBottom: 4 };
  const toggleSource = (k: string) =>
    setSources((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  const canStart = !busy && problem.trim().length > 0 && sources.length > 0;
  const submit = () => onCreate({
    title: name.trim(), problem_statement: problem.trim(), keywords,
    year_start: yearStart ? Number(yearStart) : undefined,
    year_end: yearEnd ? Number(yearEnd) : undefined,
    max_results: Number(maxResults) || 20,
    venues, strong_only: strongOnly, sources,
  });

  return (
    <aside style={{
      width: 320, background: C.sidebar, borderRight: `2px solid ${C.border}`,
      padding: 18, display: 'flex', flexDirection: 'column', gap: 14,
      height: '100%', overflowY: 'auto',
    }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '0.3px' }}>
          🔬 <span style={{ color: C.accent }}>Research</span> Assistant
        </div>
        <div style={{ color: C.muted, fontSize: 11, fontWeight: 600, marginTop: 2 }}>
          literature review → data → EDA
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ ...sectionLabel(C), flex: 1 }}>Projects</div>
          <button onClick={onRefresh} title="Refresh"
            style={{ background: 'transparent', border: 0, cursor: 'pointer', color: C.faint, display: 'flex' }}>
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
        <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 7, marginTop: 8 }}>
          {chats.length === 0 && (
            <div style={{ color: C.faint, fontSize: 12, fontWeight: 600 }}>No projects yet.</div>
          )}
          {chats.map((c) => {
            const on = c._id === activeId;
            return (
              <div key={c._id} onClick={() => onSelect(c._id)}
                style={{
                  background: on ? C.accent : C.surface, color: on ? C.accent_text : C.text,
                  border: `2px solid ${C.border}`, borderRadius: 10, padding: '10px 11px',
                  fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                <button onClick={(e) => { e.stopPropagation(); onDelete(c._id); }} title="Delete project"
                  style={{ background: 'transparent', border: 0, cursor: 'pointer', color: on ? C.accent_text : C.faint, display: 'flex' }}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div style={sectionLabel(C)}>New review</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder="project name (e.g. vit-robustness)" style={input} />
          <textarea value={problem} onChange={(e) => setProblem(e.target.value)} rows={3}
            placeholder="Problem statement…" style={{ ...input, resize: 'vertical' }} />
          <input value={keywords} onChange={(e) => setKeywords(e.target.value)}
            placeholder="keywords (comma-separated)" style={input} />
          <div style={{ display: 'flex', gap: 8 }}>
            {[['From', yearStart, setYearStart], ['To', yearEnd, setYearEnd], ['Max', maxResults, setMaxResults]].map(
              ([cap, val, set]: any, i) => (
                <div key={i} style={{ flex: 1 }}>
                  <label style={label}>{cap}</label>
                  <input value={val} onChange={(e) => set(e.target.value)} style={input} />
                </div>
              ))}
          </div>
          <input value={venues} onChange={(e) => setVenues(e.target.value)}
            placeholder="venues (optional): NeurIPS,ICML" style={input} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            <input type="checkbox" checked={strongOnly} onChange={(e) => setStrongOnly(e.target.checked)} />
            Strong journals only (Q1/Q2, high impact)
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ALL_SOURCES.map((s) => {
              const on = sources.includes(s.key);
              return (
                <button key={s.key} onClick={() => toggleSource(s.key)}
                  style={{
                    background: on ? C.accent : 'transparent', color: on ? C.accent_text : C.faint,
                    border: `2px solid ${on ? C.border : C.line}`, borderRadius: 8, padding: '4px 9px',
                    fontSize: 11, fontWeight: 800, cursor: 'pointer',
                  }}>{s.label}</button>
              );
            })}
          </div>
          <Btn primary disabled={!canStart} onClick={submit}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Plus className="w-4 h-4" /> {busy ? 'Working…' : '▶  Start research'}
          </Btn>
          <div style={{ color: C.faint, fontSize: 11, fontWeight: 600 }}>
            runs papers → lit review → open problems → datasets automatically
          </div>
        </div>
      </div>
    </aside>
  );
}

// ---- Shared tab header: title + status pill + run/re-run button ----------
export function TabHeader(
  { title, done, running, onRun, runLabel }:
  { title: string; done: boolean; running: boolean; onRun: () => void; runLabel: string },
) {
  const C = useC();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <div style={{ fontSize: 16, fontWeight: 900, flex: 1 }}>{title}</div>
      {done && <Pill text="done" color={C.success} on />}
      <Btn onClick={onRun} disabled={running}>
        {running ? 'Running…' : done ? `↻  Re-run ${runLabel}` : `▶  ${runLabel}`}
      </Btn>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  const C = useC();
  return <div style={{ color: C.faint, fontWeight: 600, padding: 20 }}>{text}</div>;
}

function asList(v: any): string[] {
  if (Array.isArray(v)) return v.filter((x) => x && x !== 'not stated');
  if (typeof v === 'string' && v.trim() && v !== 'not stated') return [v];
  return [];
}

// ---- Papers --------------------------------------------------------------
export function PapersView({ data }: { data: any }) {
  const C = useC();
  const papers: any[] = data?.papers || [];
  if (!papers.length) return <Empty text="No papers yet — run “Fetch papers”." />;
  const citations = papers.map((p, i) => `${i + 1}. ${harvardCitation(p)}`).join('\n');
  const dois = papers
    .map((p) => (p.doi ? `https://doi.org/${p.doi}` : null))
    .filter(Boolean).join('\n');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontWeight: 800, fontSize: 13, color: C.muted }}>{papers.length} papers</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <CopyButton text={citations} label="Copy citations (Harvard)" />
          <CopyButton text={dois} label="Copy DOIs" />
        </div>
      </div>
      {papers.map((p, i) => (
        <div key={i} style={{ background: C.surface, border: `2px solid ${C.border}`, borderRadius: 14, padding: '12px 14px' }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{p.title}</div>
          <div style={{ color: C.faint, fontSize: 12, fontWeight: 600, marginTop: 3 }}>
            {(p.venue || p.source)} · {p.year || '?'} · {p.citation_count || 0} citations{p.pdf_path ? ' · 📄 PDF' : ''}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {p.quartile && <Pill text={p.quartile} color={p.quartile === 'Q1' ? C.success : p.quartile === 'Q2' ? C.accent : p.quartile === 'Q3' ? C.warn : C.faint} on />}
            {p.impact_factor != null && <Tag text={`IF ${p.impact_factor}`} />}
            {p.h_index ? <Tag text={`h-index ${p.h_index}`} /> : null}
            {p.relevance ? <Pill text={`relevance ${p.relevance}`} color={C.accent} on /> : null}
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8 }}>
            {p.url && (
              <a href={p.url} target="_blank" rel="noreferrer" style={{ color: C.accent, fontWeight: 700, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                open source ↗ <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {p.doi && (
              <a href={`https://doi.org/${p.doi}`} target="_blank" rel="noreferrer" style={{ color: C.accent, fontWeight: 700, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                doi.org/{p.doi} <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- Lit review ------------------------------------------------------------
export function ReviewView({ data }: { data: any }) {
  const C = useC();
  if (!data) return <Empty text="No review yet — run “Literature review”." />;
  const summaries: any[] = data.paper_summaries || [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {data.synthesis && (
        <Card title="Synthesis">
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{data.synthesis}</div>
        </Card>
      )}
      {summaries.map((s, i) => (
        <div key={i} style={{ background: C.surface, border: `2px solid ${C.border}`, borderRadius: 14, padding: '12px 14px' }}>
          <div style={{ fontWeight: 800 }}>{s.title}</div>
          {s.one_liner && <div style={{ color: C.muted, marginTop: 4 }}>{s.one_liner}</div>}
          {asList(s.stated_limitations).length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={sectionLabel(C)}>Limitations</div>
              <ul style={{ margin: '4px 0 0 18px' }}>{asList(s.stated_limitations).map((x, j) => <li key={j}>{x}</li>)}</ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---- Open problems (gaps) --------------------------------------------------
export function GapsView({ data }: { data: any }) {
  const C = useC();
  const gaps: any[] = data?.open_problems || [];
  if (!gaps.length) return <Empty text="No open problems yet — run “Find gaps”." />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {gaps.map((g, i) => (
        <div key={i} style={{ background: C.surface, border: `2px solid ${C.border}`, borderRadius: 14, padding: '12px 14px' }}>
          <div style={{ fontWeight: 800 }}>{g.problem}</div>
          {g.why_it_matters && <div style={{ color: C.muted, marginTop: 4 }}>{g.why_it_matters}</div>}
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {g.recency && <Tag text={g.recency} />}
            {g.kind && <Pill text={g.kind} color={g.kind === 'real-world' ? C.teal : C.accent} on />}
          </div>
          {g.suggested_direction && (
            <div style={{ marginTop: 8 }}>
              <div style={sectionLabel(C)}>Suggested direction</div>
              <div style={{ marginTop: 3 }}>{g.suggested_direction}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---- Datasets ---------------------------------------------------------------
export function DatasetsView({ data, onAnalyze }: { data: any; onAnalyze?: (target: string) => void }) {
  const C = useC();
  const ds: any[] = data?.datasets || [];
  if (!ds.length) return <Empty text="No datasets yet — run “Find datasets”." />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {ds.map((d, i) => (
        <div key={i} style={{ background: C.surface, border: `2px solid ${C.border}`, borderRadius: 14, padding: '12px 14px' }}>
          <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
            <FileText className="w-4 h-4" /> {d.name}
          </div>
          {d.description && <div style={{ color: C.muted, marginTop: 4 }}>{d.description}</div>}
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <Tag text={d.source} />
            {d.availability ? <Pill text={d.availability} color={d.availability === 'public' ? C.success : d.availability === 'on-request' ? C.warn : C.faint} on /> : null}
            {d.registry ? <Tag text={`↪ ${d.registry}`} /> : null}
            {d.downloads ? <Tag text={`${d.downloads} downloads`} /> : null}
            {d.relevance ? <Pill text={`relevance ${d.relevance}`} color={C.accent} on /> : null}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
            {d.url && (
              <a href={d.url} target="_blank" rel="noreferrer" style={{ color: C.accent, fontWeight: 700, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                open dataset ↗ <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {onAnalyze && (
              <Btn onClick={() => onAnalyze(d.local_path || d.url || d.name || '')}>
                <PlayCircle className="w-4 h-4" /> Analyze in EDA
              </Btn>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- EDA (M7): profile a local file or folder ------------------------------
export function AiEdaPlan({ plan }: { plan: any }) {
  const C = useC();
  const Row = ({ label, items, render }: { label: string; items: any[]; render: (x: any) => React.ReactNode }) =>
    Array.isArray(items) && items.length ? (
      <div>
        <div style={sectionLabel(C)}>{label}</div>
        <ul style={{ margin: '4px 0 0 18px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {items.map((x, i) => <li key={i}>{render(x)}</li>)}
        </ul>
      </div>
    ) : null;
  return (
    <Card title="AI-recommended EDA (domain-specific)">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {plan.domain && <Tag text={`domain: ${plan.domain}`} />}
          {plan.data_type && <Tag text={`data: ${plan.data_type}`} />}
          {plan.depth && <Pill text={`depth: ${plan.depth}`} color={C.accent} on />}
          {(plan.focus || []).map((f: string, i: number) => <Tag key={i} text={f} />)}
        </div>
        <Row label="Recommended analyses" items={plan.recommended_analyses}
          render={(a: any) => <><b>{a.name}</b>{a.why ? ` — ${a.why}` : ''}</>} />
        <Row label="Recommended plots" items={plan.recommended_plots}
          render={(p: any) => <><b>{p.plot}</b>{p.on ? ` (${p.on})` : ''}{p.why ? ` — ${p.why}` : ''}</>} />
        <Row label="Preprocessing" items={plan.preprocessing} render={(s: any) => s} />
        <Row label="Cautions" items={plan.cautions} render={(s: any) => s} />
      </div>
    </Card>
  );
}

export function EdaFileView(
  { data, running, onRun, prefill }:
  { data: any; running: boolean; onRun: (dataPath: string) => void; prefill?: string },
) {
  const C = useC();
  const [path, setPath] = useState('');
  // When a dataset is sent here ("Analyze in EDA"), prefill the path box.
  useEffect(() => { if (prefill) setPath(prefill); }, [prefill]);
  const input: React.CSSProperties = {
    background: C.surface, border: `2px solid ${C.border}`, borderRadius: 10,
    padding: '8px 10px', fontWeight: 600, color: C.text, flex: 1,
  };
  const r = data?.report;
  return (
    <div>
      <Card title="Analyze a local file or folder" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={path} onChange={(e) => setPath(e.target.value)}
            placeholder="e.g. C:\\data\\mydata.csv or a folder path" style={input} />
          <Btn primary disabled={running || !path.trim()} onClick={() => onRun(path.trim())}>
            {running ? 'Running…' : '▶  Run EDA'}
          </Btn>
        </div>
        <div style={{ color: C.faint, fontSize: 11, fontWeight: 600, marginTop: 8 }}>
          Runs on the machine the EDA service is installed on — profile, themed plots, and a
          generated preprocessing script.
        </div>
      </Card>

      {!data && <Empty text="No EDA report yet — enter a path and run." />}
      {r && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {data.ai_plan && <AiEdaPlan plan={data.ai_plan} />}
          <Card title="Profile">
            {r.kind === 'folder' ? (
              <div>
                {r.total_files} files · {r.total_size_mb} MB
                {r.by_category && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {Object.entries(r.by_category).map(([k, v]: any) => <Tag key={k} text={`${k}: ${v}`} />)}
                  </div>
                )}
              </div>
            ) : (
              <div>
                {r.rows} rows × {r.cols} cols · {r.duplicate_rows} duplicates · {r.memory_mb} MB
              </div>
            )}
          </Card>
          {Array.isArray(r.columns) && r.columns.some((c: any) => c.missing) && (
            <Card title="Missing values">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {r.columns.filter((c: any) => c.missing).map((c: any, i: number) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{c.name} <span style={{ color: C.faint }}>({c.dtype})</span></span>
                    <span style={{ color: C.warn, fontWeight: 800 }}>{c.missing_pct}%</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {r.by_category && (r.code || r.images || r.text || r.data) && (
            <Card title="Deep analysis">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
                {r.code && (
                  <div>
                    <div style={sectionLabel(C)}>Source code</div>
                    {r.code.total_lines?.toLocaleString?.() ?? r.code.total_lines} lines across {r.code.count} files
                    {typeof r.code.comment_ratio_pct === 'number' && <> · {r.code.comment_ratio_pct}% comments</>}
                    {Array.isArray(r.code.languages) && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                        {r.code.languages.slice(0, 8).map((l: any, i: number) =>
                          <Tag key={i} text={`${l.language}: ${l.code} loc`} />)}
                      </div>
                    )}
                  </div>
                )}
                {r.images && r.images.sampled > 0 && (
                  <div>
                    <div style={sectionLabel(C)}>Images</div>
                    {r.images.count} images{r.images.corrupt ? ` (${r.images.corrupt} unreadable)` : ''}
                    {r.images.width && <> · {r.images.width.min}–{r.images.width.max}px wide</>}
                    {r.images.color_modes && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                        {Object.entries(r.images.color_modes).map(([k, v]: any) => <Tag key={k} text={`${k}: ${v}`} />)}
                      </div>
                    )}
                  </div>
                )}
                {r.text && r.text.sampled > 0 && (
                  <div>
                    <div style={sectionLabel(C)}>Text / documents</div>
                    {r.text.count} docs · {r.text.total_words?.toLocaleString?.() ?? r.text.total_words} words
                    {Array.isArray(r.text.top_terms) && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                        {r.text.top_terms.slice(0, 12).map((t: any, i: number) => <Tag key={i} text={`${t.term} (${t.count})`} />)}
                      </div>
                    )}
                  </div>
                )}
                {r.data && (
                  <div>
                    <div style={sectionLabel(C)}>Structured data</div>
                    {r.data.count} file(s)
                    {r.data.json_depth?.max ? <> · JSON depth up to {r.data.json_depth.max}</> : null}
                  </div>
                )}
              </div>
            </Card>
          )}
          {Array.isArray(data.suggestions) && data.suggestions.length > 0 && (
            <Card title="Preprocessing suggestions">
              <ul style={{ margin: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {data.suggestions.map((s: string, i: number) => <li key={i}>{s}</li>)}
              </ul>
            </Card>
          )}
          {data.plots?.length > 0 && (
            <Card title="Plots">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                {data.plots.map((p: any, i: number) => {
                  const uri = typeof p === 'string' ? null : p?.uri;
                  const name = typeof p === 'string' ? (p.split(/[\\/]/).pop() || p) : p?.name;
                  return uri ? (
                    <figure key={i} style={{ margin: 0 }}>
                      <img src={uri} alt={name} style={{ width: '100%', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff' }} />
                      <figcaption style={{ color: C.faint, fontSize: 11, fontWeight: 600, marginTop: 4 }}>{name}</figcaption>
                    </figure>
                  ) : <Tag key={i} text={name} />;
                })}
              </div>
            </Card>
          )}
          {data.models && (
            <Card title="Model suggestions">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.models.task_type && <div><b>Task:</b> {data.models.task_type}</div>}
                {(['baseline', 'pretrained', 'sota', 'existing'] as const).map((k) => {
                  const items = data.models[k];
                  if (!Array.isArray(items) || !items.length) return null;
                  return (
                    <div key={k}>
                      <div style={sectionLabel(C)}>{k}</div>
                      <ul style={{ margin: '4px 0 0 18px' }}>
                        {items.map((m: any, i: number) => <li key={i}><b>{m.name}</b> — {m.why}</li>)}
                      </ul>
                    </div>
                  );
                })}
                {data.models.notes && <div style={{ color: C.muted }}>{data.models.notes}</div>}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Humanizer (M8) ---------------------------------------------------------
export function HumanizerView(
  { data, running, onRun }:
  { data: any; running: boolean; onRun: (text: string, strength: string) => void },
) {
  const C = useC();
  const [text, setText] = useState('');
  const [strength, setStrength] = useState('balanced');
  const input: React.CSSProperties = {
    background: C.surface, border: `2px solid ${C.border}`, borderRadius: 10,
    padding: '8px 10px', fontWeight: 600, color: C.text, width: '100%',
  };
  return (
    <div>
      <Card title="Analyze + humanize text" style={{ marginBottom: 16 }}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6}
          placeholder="Paste text to humanize — leave blank to use this project's literature review synthesis"
          style={{ ...input, resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
          <select value={strength} onChange={(e) => setStrength(e.target.value)}
            style={{ ...input, width: 160 }}>
            <option value="light">light</option>
            <option value="balanced">balanced</option>
            <option value="strong">strong</option>
          </select>
          <Btn primary disabled={running} onClick={() => onRun(text.trim(), strength)}>
            {running ? 'Running…' : '▶  Analyze & Humanize'}
          </Btn>
        </div>
      </Card>

      {!data && <Empty text="No humanized text yet." />}
      {data && !data.error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card title="AI-pattern score">
            <div style={{ display: 'flex', gap: 24 }}>
              <div><span style={{ color: C.faint }}>before:</span> <b>{data.before?.score}</b>/100</div>
              <div><span style={{ color: C.faint }}>after:</span> <b style={{ color: C.success }}>{data.after?.score}</b>/100</div>
            </div>
            {data.preservation && (
              <div style={{ color: C.faint, fontSize: 12, marginTop: 8 }}>
                preservation: {data.preservation.ok ? 'OK' : 'check needed'} · citations {data.preservation.citations_in}→{data.preservation.citations_out}
                {data.preservation.missing_numbers?.length ? ` · missing numbers: ${data.preservation.missing_numbers.join(', ')}` : ''}
              </div>
            )}
          </Card>
          <Card title="Rewritten text">
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{data.output}</div>
          </Card>
        </div>
      )}
    </div>
  );
}
