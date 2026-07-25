// Research Assistant design tokens — ported verbatim from the desktop app's
// theme.py (neo-brutalist / "Gumroad comic" style). Do not alter these values;
// they must match the desktop app exactly.

export const RADIUS = 14;

export interface EdaPalette {
  mode: 'light' | 'dark';
  bg: string;
  sidebar: string;
  surface: string;
  surface2: string;
  surface3: string;
  border: string;
  line: string;
  text: string;
  muted: string;
  faint: string;
  accent: string;
  accent_text: string;
  yellow: string;
  teal: string;
  purple: string;
  blue: string;
  success: string;
  warn: string;
  danger: string;
  shadow: string;
}

export const EDA_DARK: EdaPalette = {
  mode: 'dark',
  bg: '#15151F',
  sidebar: '#1B1B2A',
  surface: '#232332',
  surface2: '#2C2C40',
  surface3: '#34344E',
  border: '#000000',
  line: '#3C3C58',
  text: '#F2F1FB',
  muted: '#A6A6C8',
  faint: '#71718F',
  accent: '#7C5CFC',
  accent_text: '#FFFFFF',
  yellow: '#FFC93C',
  teal: '#34D8A6',
  purple: '#9E84FF',
  blue: '#5B8CFF',
  success: '#34D8A6',
  warn: '#FFC93C',
  danger: '#FF6B6B',
  shadow: '#7C5CFC',
} as const;

export const EDA_LIGHT: EdaPalette = {
  mode: 'light',
  bg: '#F7F4FF',
  sidebar: '#F0EBFF',
  surface: '#FFFFFF',
  surface2: '#FFFFFF',
  surface3: '#EDE7FF',
  border: '#15131F',
  line: '#1E1B2E',
  text: '#1A1726',
  muted: '#55536A',
  faint: '#8A87A0',
  accent: '#6C4DF6',
  accent_text: '#FFFFFF',
  yellow: '#F5B400',
  teal: '#0FA98B',
  purple: '#8B5CF6',
  blue: '#3B6BF6',
  success: '#129B73',
  warn: '#B07A00',
  danger: '#E5484D',
  shadow: '#15131F',
};

export function textOn(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#161320' : '#FFFFFF';
}
