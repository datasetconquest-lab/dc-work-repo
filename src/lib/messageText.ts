// Shared helpers for preserving message text structure and offloading very long
// messages to a document so the original formatting (line breaks, spacing,
// indentation) is never flattened into a chat bubble.
import { API_BASE_URL } from './api';
import { getStoredAuth } from './authStorage';

// Messages longer than this many characters are shared as a .txt document
// instead of inline text. Tune here to change the threshold app-wide.
export const MESSAGE_TEXT_LIMIT = 2000;

export function isLongMessage(text: string): boolean {
  return text.length > MESSAGE_TEXT_LIMIT;
}

export interface UploadedAttachment {
  id?: string;
  url: string;
  filename?: string;
  size?: number;
  mimetype?: string;
}

// Uploads the given text as a plain-text (.txt) document and returns the
// attachment metadata to attach to a message. Storing it as a file keeps the
// exact structure intact (the recipient views/downloads it unchanged).
export async function uploadTextAsDocument(text: string): Promise<UploadedAttachment> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = new File([text], `message-${stamp}.txt`, { type: 'text/plain' });
  const form = new FormData();
  form.append('file', file);
  form.append('category', 'message');

  const token = getStoredAuth()?.token;
  const res = await fetch(`${API_BASE_URL}/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to share the long message as a document');
  }
  const data = await res.json();
  return {
    id: data.id,
    url: data.url,
    filename: data.filename,
    size: data.size,
    mimetype: data.mimetype,
  };
}
