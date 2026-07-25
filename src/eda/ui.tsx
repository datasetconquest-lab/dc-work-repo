import { createContext, useContext, ReactNode, CSSProperties } from 'react';
import { EdaPalette, RADIUS, textOn } from './theme';

// Palette context so every primitive styles itself from the current theme.
const ThemeCtx = createContext<EdaPalette | null>(null);
export function EdaThemeProvider({ palette, children }: { palette: EdaPalette; children: ReactNode }) {
  return <ThemeCtx.Provider value={palette}>{children}</ThemeCtx.Provider>;
}
export function useC(): EdaPalette {
  const c = useContext(ThemeCtx);
  if (!c) throw new Error('useC must be used within EdaThemeProvider');
  return c;
}

// ---- Pill: bold candy status chip with a thick border --------------------
export function Pill({ text, color, on = false }: { text: string; color?: string; on?: boolean }) {
  const C = useC();
  const fill = color || C.accent;
  const style: CSSProperties = on
    ? { background: fill, color: textOn(fill), border: `2px solid ${C.border}`, borderRadius: 11, padding: '3px 11px', fontSize: 11, fontWeight: 800 }
    : { background: 'transparent', color: C.faint, border: `2px solid ${C.line}`, borderRadius: 11, padding: '3px 11px', fontSize: 11, fontWeight: 700 };
  return <span style={{ ...style, display: 'inline-block', whiteSpace: 'nowrap' }}>{text}</span>;
}

// ---- Tag -----------------------------------------------------------------
export function Tag({ text, accent = false }: { text: string; accent?: boolean }) {
  const C = useC();
  const style: CSSProperties = accent
    ? { background: C.accent, color: textOn(C.accent), border: `2px solid ${C.border}`, borderRadius: 8, padding: '3px 9px', fontSize: 11, fontWeight: 800 }
    : { background: C.surface3, color: C.text, border: `2px solid ${C.line}`, borderRadius: 8, padding: '3px 9px', fontSize: 11, fontWeight: 700 };
  return <span style={{ ...style, display: 'inline-block' }}>{text}</span>;
}

// ---- Card: titled surface panel ------------------------------------------
export function Card({ title, children, style }: { title?: string; children: ReactNode; style?: CSSProperties }) {
  const C = useC();
  return (
    <div style={{ background: C.surface, border: `2px solid ${C.border}`, borderRadius: RADIUS, padding: '14px 16px 16px', ...style }}>
      {title && <div style={sectionLabel(C)}>{title}</div>}
      <div style={{ marginTop: title ? 10 : 0 }}>{children}</div>
    </div>
  );
}

export function sectionLabel(C: EdaPalette): CSSProperties {
  return { color: C.faint, fontSize: 10, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase' };
}

// ---- Buttons -------------------------------------------------------------
export function Btn(
  { children, onClick, disabled, primary = false, title, style }:
  { children: ReactNode; onClick?: () => void; disabled?: boolean; primary?: boolean; title?: string; style?: CSSProperties },
) {
  const C = useC();
  const base: CSSProperties = {
    border: `2px solid ${disabled ? C.line : C.border}`,
    borderRadius: 10, padding: primary ? '10px 16px' : '8px 14px',
    fontWeight: primary ? 900 : 800, cursor: disabled ? 'not-allowed' : 'pointer',
    background: primary ? (disabled ? C.surface3 : C.accent) : C.surface,
    color: primary ? (disabled ? C.faint : C.accent_text) : (disabled ? C.faint : C.text),
  };
  return (
    <button title={title} onClick={onClick} disabled={disabled} style={{ ...base, ...style }}>
      {children}
    </button>
  );
}

// ---- StepCard: clickable pipeline step doubling as a status indicator -----
export type StepState = 'idle' | 'running' | 'done';

export function StepCard(
  { index, title, subtitle, state, enabled, onClick }:
  { index: number; title: string; subtitle: string; state: StepState; enabled: boolean; onClick?: () => void },
) {
  const C = useC();
  const strip = { idle: C.line, running: C.warn, done: C.success }[state];
  const badgeBg = state === 'done' ? C.success : state === 'running' ? C.warn : C.surface3;
  const badgeColor = state === 'idle' ? C.muted : textOn(badgeBg);
  const dotColor = state === 'done' ? C.success : state === 'running' ? C.warn : C.faint;
  const badgeText = state === 'done' ? '✓' : state === 'running' ? '…' : String(index);

  return (
    <div
      onClick={() => enabled && state !== 'running' && onClick?.()}
      style={{
        display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px',
        background: enabled ? C.surface : C.surface3,
        border: `2px solid ${C.border}`, borderLeft: `6px solid ${strip}`,
        borderRadius: RADIUS, cursor: enabled && state !== 'running' ? 'pointer' : 'default',
      }}
    >
      <span style={{
        width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: badgeBg, color: badgeColor, border: `2px solid ${C.border}`,
        borderRadius: 13, fontWeight: 900, fontSize: 13,
      }}>{badgeText}</span>
      <span style={{ flex: 1 }}>
        <span style={{ display: 'block', fontWeight: 800, color: enabled ? C.text : C.faint }}>{title}</span>
        <span style={{ display: 'block', color: C.faint, fontSize: 12, fontWeight: 600 }}>{subtitle}</span>
      </span>
      <span style={{ color: dotColor, fontSize: 14 }}>●</span>
    </div>
  );
}

// ---- Segmented tab bar ---------------------------------------------------
export function SegBar<T extends string>(
  { tabs, active, onChange }: { tabs: { key: T; label: string }[]; active: T; onChange: (k: T) => void },
) {
  const C = useC();
  return (
    <div style={{ display: 'inline-flex', gap: 4, background: C.surface, border: `2px solid ${C.border}`, borderRadius: 12, padding: 4 }}>
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            style={{
              border: on ? `2px solid ${C.border}` : '0', borderRadius: 8, padding: '8px 16px',
              background: on ? C.accent : 'transparent', color: on ? C.accent_text : C.muted,
              fontWeight: 800, cursor: 'pointer',
            }}
          >{t.label}</button>
        );
      })}
    </div>
  );
}
