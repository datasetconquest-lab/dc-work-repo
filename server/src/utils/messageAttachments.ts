import mongoose from 'mongoose';
import { FileStore } from '../models/File.js';
import { sanitizeFilename } from './filename.js';

export interface NormalizedMessageAttachment {
  id?: string;
  url: string;
  filename?: string;
  size?: number;
  mimetype?: string;
}

const MAX_ATTACHMENTS_PER_MESSAGE = 5;
const UPLOAD_ID_RE = /\/api\/upload\/([a-f\d]{24})(?:[/?#]|$)/i;

function parseExternalUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function extractUploadFileId(att: unknown): string | null {
  if (!att) return null;

  if (typeof att === 'string') {
    const direct = mongoose.Types.ObjectId.isValid(att) ? att : null;
    const fromUrl = att.match(UPLOAD_ID_RE)?.[1] || null;
    return direct || fromUrl;
  }

  if (typeof att === 'object') {
    const obj = att as Record<string, unknown>;
    const id = typeof obj.id === 'string' && mongoose.Types.ObjectId.isValid(obj.id) ? obj.id : null;
    const url = typeof obj.url === 'string' ? obj.url.match(UPLOAD_ID_RE)?.[1] || null : null;
    return id || url;
  }

  return null;
}

function externalAttachment(att: unknown): NormalizedMessageAttachment | null {
  const url = typeof att === 'string'
    ? parseExternalUrl(att)
    : typeof att === 'object' && att
      ? parseExternalUrl(String((att as Record<string, unknown>).url || ''))
      : null;

  if (!url) return null;

  const obj = typeof att === 'object' && att ? att as Record<string, unknown> : {};
  const rawFilename = typeof obj.filename === 'string' ? obj.filename : typeof obj.name === 'string' ? obj.name : '';

  return {
    url,
    filename: rawFilename ? sanitizeFilename(rawFilename) : undefined,
  };
}

export async function normalizeMessageAttachments(
  attachments: unknown,
  uploaderId: mongoose.Types.ObjectId,
  apiBaseUrl: string
): Promise<NormalizedMessageAttachment[]> {
  if (!attachments) return [];
  if (!Array.isArray(attachments)) throw new Error('Attachments must be a list');
  if (attachments.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    throw new Error(`Maximum ${MAX_ATTACHMENTS_PER_MESSAGE} files allowed per message`);
  }

  const normalized: NormalizedMessageAttachment[] = [];

  for (const att of attachments) {
    const fileId = extractUploadFileId(att);

    if (fileId) {
      const file = await FileStore.findById(fileId).select('filename contentType size uploaded_by').lean();
      if (!file) throw new Error('Attachment file not found');
      if (file.uploaded_by?.toString() !== uploaderId.toString()) {
        throw new Error('You can only send files uploaded by your account');
      }

      normalized.push({
        id: file._id.toString(),
        url: `${apiBaseUrl}/upload/${file._id.toString()}`,
        filename: sanitizeFilename(file.filename),
        size: file.size,
        mimetype: file.contentType,
      });
      continue;
    }

    const external = externalAttachment(att);
    if (!external) throw new Error('Invalid attachment URL');
    normalized.push(external);
  }

  return normalized;
}

