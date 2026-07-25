import path from 'path';

export function sanitizeFilename(input: unknown, fallback = 'file'): string {
  const raw = String(input || '').replace(/\\/g, '/').split('/').pop() || fallback;
  const normalized = raw
    .normalize('NFKC')
    .replace(/[\x00-\x1f\x7f<>:"/\\|?*]+/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim();

  const safe = normalized || fallback;
  const ext = path.extname(safe);
  const name = path.basename(safe, ext).slice(0, 140).trim() || fallback;
  return `${name}${ext.slice(0, 20)}`;
}

