import { API_BASE_URL } from './api';
import { getStoredAuth } from './authStorage';

const UPLOAD_PATH_RE = /\/api\/upload\/[a-f\d]{24}(?:[/?#]|$)/i;

export function isProtectedUploadUrl(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    return UPLOAD_PATH_RE.test(parsed.pathname);
  } catch {
    return UPLOAD_PATH_RE.test(url);
  }
}

function withDownloadFlag(url: string): string {
  if (!url) return url;
  return url.includes('?') ? `${url}&download=1` : `${url}?download=1`;
}

export async function fetchProtectedBlob(url: string, forceDownload = false): Promise<Blob> {
  const token = getStoredAuth()?.token;
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(forceDownload ? withDownloadFlag(url) : url, { headers });
  if (!res.ok) throw new Error(`File request failed (${res.status})`);
  return res.blob();
}

export async function createProtectedObjectUrl(url: string): Promise<string> {
  if (!isProtectedUploadUrl(url)) return url;
  const blob = await fetchProtectedBlob(url);
  return URL.createObjectURL(blob);
}

export async function downloadFile(url: string, filename: string) {
  if (!isProtectedUploadUrl(url)) {
    const a = document.createElement('a');
    a.href = withDownloadFlag(url);
    a.download = filename;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return;
  }

  const blob = await fetchProtectedBlob(url, true);
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
}

export async function openFile(url: string) {
  if (!isProtectedUploadUrl(url)) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  const objectUrl = await createProtectedObjectUrl(url);
  window.open(objectUrl, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export function buildUploadUrl(fileId: string): string {
  return `${API_BASE_URL}/upload/${fileId}`;
}

