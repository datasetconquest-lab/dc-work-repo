import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { authMiddleware } from '../middleware.js';
import type { AuthRequest } from '../middleware.js';
import { FileStore } from '../models/File.js';
import { DirectMessage } from '../models/DirectMessage.js';
import { GroupMember, GroupMessage } from '../models/Group.js';
import { extractUploadFileId } from '../utils/messageAttachments.js';
import { sanitizeFilename } from '../utils/filename.js';
import { getUploadBucket } from '../utils/gridfs.js';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import { pipeline } from 'node:stream/promises';

const router = Router();

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const uploadDir = path.resolve(process.cwd(), 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Source-code and other plain-text developer file formats (Python, notebooks,
// draw.io diagrams, web/markup, config, etc.). These have no reliable binary
// signature, so they are validated as text (looksLikeText) and always served as
// text/plain — they render as source and are never executed by the browser.
const CODE_TEXT_EXTENSIONS = [
  '.py', '.pyw', '.pyi', '.ipynb', '.rpy',
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.vue', '.svelte',
  '.html', '.htm', '.css', '.scss', '.sass', '.less',
  '.yml', '.yaml', '.toml', '.ini', '.cfg', '.conf', '.properties', '.env',
  '.c', '.h', '.cpp', '.cc', '.cxx', '.hpp', '.hh', '.hxx', '.cs',
  '.java', '.kt', '.kts', '.scala', '.groovy', '.gradle',
  '.go', '.rs', '.rb', '.php', '.pl', '.pm',
  '.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd',
  '.swift', '.m', '.mm', '.dart', '.lua', '.r', '.jl',
  '.sql', '.graphql', '.gql', '.proto', '.drawio',
  '.tex', '.rst', '.adoc', '.diff', '.patch', '.log',
];

const ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.csv', '.json', '.xml', '.md',
  '.zip', '.rar', '.7z', '.gz',
  '.mp4', '.mov', '.avi', '.webm',
  '.mp3', '.wav', '.ogg', '.m4a',
  ...CODE_TEXT_EXTENSIONS,
]);

const TEXT_EXTENSIONS = new Set(['.txt', '.csv', '.json', '.xml', '.md', ...CODE_TEXT_EXTENSIONS]);
const OFFICE_OPEN_XML_EXTENSIONS = new Set(['.docx', '.xlsx', '.pptx']);
const OFFICE_LEGACY_EXTENSIONS = new Set(['.doc', '.xls', '.ppt']);

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.md': 'text/markdown',
  '.zip': 'application/zip',
  '.rar': 'application/vnd.rar',
  '.7z': 'application/x-7z-compressed',
  '.gz': 'application/gzip',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
};

// Serve every source-code/text format as text/plain so it renders as source and
// is never interpreted (e.g. an uploaded .html or .svg can't run as markup).
for (const ext of CODE_TEXT_EXTENSIONS) {
  if (!CONTENT_TYPE_BY_EXTENSION[ext]) CONTENT_TYPE_BY_EXTENSION[ext] = 'text/plain';
}

function hasSignature(buffer: Buffer, signature: number[], offset = 0): boolean {
  if (buffer.length < offset + signature.length) return false;
  return signature.every((byte, index) => buffer[offset + index] === byte);
}

function ascii(buffer: Buffer, start: number, end: number): string {
  return buffer.subarray(start, end).toString('ascii');
}

function looksLikeText(buffer: Buffer): boolean {
  if (buffer.length === 0) return true;
  if (buffer.includes(0)) return false;

  let suspicious = 0;
  for (const byte of buffer) {
    const isAllowedControl = byte === 9 || byte === 10 || byte === 13;
    if (byte < 32 && !isAllowedControl) suspicious += 1;
  }
  return suspicious / buffer.length < 0.01;
}

async function detectSafeContentType(filePath: string, originalName: string): Promise<string> {
  const ext = path.extname(originalName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`File type "${ext || 'unknown'}" is not allowed.`);
  }

  const handle = await fs.promises.open(filePath, 'r');
  try {
    const sample = Buffer.alloc(512);
    const { bytesRead } = await handle.read(sample, 0, sample.length, 0);
    const buffer = sample.subarray(0, bytesRead);

    if (TEXT_EXTENSIONS.has(ext)) {
      if (!looksLikeText(buffer)) throw new Error('Text file contents are not valid text.');
      return CONTENT_TYPE_BY_EXTENSION[ext];
    }

    if ((ext === '.jpg' || ext === '.jpeg') && hasSignature(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
    if (ext === '.png' && hasSignature(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
    if (ext === '.gif' && (ascii(buffer, 0, 6) === 'GIF87a' || ascii(buffer, 0, 6) === 'GIF89a')) return 'image/gif';
    if (ext === '.webp' && ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 12) === 'WEBP') return 'image/webp';
    if (ext === '.bmp' && ascii(buffer, 0, 2) === 'BM') return 'image/bmp';
    if (ext === '.pdf' && ascii(buffer, 0, 4) === '%PDF') return 'application/pdf';
    if ((ext === '.zip' || OFFICE_OPEN_XML_EXTENSIONS.has(ext)) && ascii(buffer, 0, 2) === 'PK') return CONTENT_TYPE_BY_EXTENSION[ext];
    if (OFFICE_LEGACY_EXTENSIONS.has(ext) && hasSignature(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
      return CONTENT_TYPE_BY_EXTENSION[ext];
    }
    if (ext === '.rar' && ascii(buffer, 0, 4) === 'Rar!') return 'application/vnd.rar';
    if (ext === '.7z' && hasSignature(buffer, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return 'application/x-7z-compressed';
    if (ext === '.gz' && hasSignature(buffer, [0x1f, 0x8b])) return 'application/gzip';
    if ((ext === '.mp4' || ext === '.mov' || ext === '.m4a') && ascii(buffer, 4, 8) === 'ftyp') return CONTENT_TYPE_BY_EXTENSION[ext];
    if (ext === '.avi' && ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 12) === 'AVI ') return 'video/x-msvideo';
    if (ext === '.webm' && hasSignature(buffer, [0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm';
    if (ext === '.mp3' && (ascii(buffer, 0, 3) === 'ID3' || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0))) return 'audio/mpeg';
    if (ext === '.wav' && ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 12) === 'WAVE') return 'audio/wav';
    if (ext === '.ogg' && ascii(buffer, 0, 4) === 'OggS') return 'audio/ogg';
  } finally {
    await handle.close();
  }

  throw new Error('File contents do not match the file extension.');
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const safeOriginal = sanitizeFilename(file.originalname);
    const ext = path.extname(safeOriginal).toLowerCase();
    cb(null, `${Date.now()}-${randomUUID()}${ext}`);
  }
});

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const safeOriginal = sanitizeFilename(file.originalname);
  const ext = path.extname(safeOriginal).toLowerCase();

  if (ext === '.svg') {
    cb(new Error('SVG uploads are blocked for security. Please share PNG, JPG, WEBP, or PDF instead.'));
    return;
  }

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    cb(new Error(`File type "${ext || 'unknown'}" is not allowed. Permitted: images, documents, archives, audio, and video.`));
    return;
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
});

const uploadRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 40,
  message: { error: 'Too many uploads. Please wait a few minutes and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: AuthRequest) => `user:${req.user?.id || 'unknown'}`,
});

const uploadHandler = upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'image', maxCount: 1 },
]);

function firstUploadedFile(req: AuthRequest): Express.Multer.File | null {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  return files?.file?.[0] || files?.image?.[0] || null;
}

function removeFileQuietly(filePath: string) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (error) {
    console.error('[Upload] Failed to remove rejected upload:', error);
  }
}

router.post('/', authMiddleware, uploadRateLimiter, (req: AuthRequest, res: Response) => {
  uploadHandler(req, res, async (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
        }
        return res.status(400).json({ error: err.message });
      }
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }

    const uploaded = firstUploadedFile(req);
    if (!uploaded) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const safeFilename = sanitizeFilename(uploaded.originalname);
      const detectedContentType = await detectSafeContentType(uploaded.path, safeFilename);
      const rawCategory = String(req.body?.category || '').toLowerCase();
      const category: 'message' | 'avatar' | 'other' =
        rawCategory === 'message' ? 'message'
          : rawCategory === 'avatar' || uploaded.fieldname === 'image' ? 'avatar'
            : 'other';

      // Persist the bytes in GridFS (MongoDB) so they survive server restarts /
      // redeploys — the host's disk is ephemeral, so disk-stored files vanish and
      // become undownloadable for anyone who opens them after a restart.
      const bucket = getUploadBucket();
      const gridStream = bucket.openUploadStream(safeFilename, { metadata: { contentType: detectedContentType } });
      await pipeline(fs.createReadStream(uploaded.path), gridStream);
      const gridfsId = gridStream.id;

      // The temp disk copy is no longer needed once it's in GridFS.
      removeFileQuietly(uploaded.path);

      const newFile = new FileStore({
        filename: safeFilename,
        contentType: detectedContentType,
        size: uploaded.size,
        gridfs_id: gridfsId,
        uploaded_by: new mongoose.Types.ObjectId(userId),
        category
      });

      await newFile.save();

      const protocol = req.protocol;
      const host = req.get('host');
      const fileUrl = `${protocol}://${host}/api/upload/${newFile._id}`;

      return res.json({
        url: fileUrl,
        filename: newFile.filename,
        size: newFile.size,
        mimetype: newFile.contentType,
        id: newFile._id,
        category: newFile.category
      });
    } catch (error: any) {
      removeFileQuietly(uploaded.path);
      console.error('[Upload] Upload validation/save error:', error);
      return res.status(400).json({ error: error.message || 'Upload failed' });
    }
  });
});

function buildContentDisposition(filename: string, mode: 'inline' | 'attachment'): string {
  const safe = sanitizeFilename(filename).replace(/"/g, '');
  const encoded = encodeURIComponent(filename).replace(/['()]/g, escape);
  return `${mode}; filename="${safe}"; filename*=UTF-8''${encoded}`;
}

function canRenderInline(contentType: string): boolean {
  return contentType.startsWith('image/')
    || contentType.startsWith('audio/')
    || contentType.startsWith('video/')
    || contentType === 'application/pdf'
    || contentType.startsWith('text/plain');
}

function attachmentRefFilter(fileId: string) {
  const refRegex = new RegExp(`/api/upload/${fileId}(?:[/?#]|$)`, 'i');
  return [
    { 'attachments.id': fileId },
    { 'attachments.url': refRegex },
    { attachments: refRegex },
  ];
}

async function canAccessMessageFile(file: any, user: AuthRequest['user']): Promise<boolean> {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (file.uploaded_by?.toString() === user.id) return true;

  const userObjectId = new mongoose.Types.ObjectId(user.id);
  const fileId = file._id.toString();

  const directMessage = await DirectMessage.exists({
    $and: [
      {
        $or: [
          { sender_id: userObjectId },
          { receiver_id: userObjectId },
        ],
      },
      { $or: attachmentRefFilter(fileId) },
    ],
  });

  if (directMessage) return true;

  const groupMessages = await GroupMessage.find({ $or: attachmentRefFilter(fileId) }).select('group_id').lean();
  if (groupMessages.length === 0) return false;

  const groupIds = groupMessages.map((message) => message.group_id);
  const membership = await GroupMember.exists({
    group_id: { $in: groupIds },
    user_id: userObjectId,
  });

  return !!membership;
}

async function runAuth(req: AuthRequest, res: Response): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    let settled = false;
    const done = (value: boolean) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    Promise.resolve(authMiddleware(req, res, (err?: any) => {
      if (err) reject(err);
      else done(true);
    }))
      .then(() => {
        if (!settled) done(false);
      })
      .catch(reject);
  }).catch((error) => {
      console.error('[Upload] Auth failed while serving file:', error);
      if (!res.headersSent) res.status(401).json({ error: 'Unauthorized' });
      return false;
    });
}

function assertSafeDiskPath(filePath: string): string | null {
  const resolved = path.resolve(filePath);
  return resolved.startsWith(`${uploadDir}${path.sep}`) || resolved === uploadDir ? resolved : null;
}

async function serveStoredFile(req: Request, res: Response, file: any) {
  const forceDownload = req.query.download === '1' || req.query.download === 'true';
  const contentType = file.contentType || 'application/octet-stream';
  const disposition = forceDownload || !canRenderInline(contentType) ? 'attachment' : 'inline';

  res.set('Content-Type', contentType);
  res.set('Content-Disposition', buildContentDisposition(file.filename, disposition));
  res.set('Cache-Control', 'private, max-age=3600');
  res.set('X-Content-Type-Options', 'nosniff');

  // Current storage: stream the bytes from GridFS.
  if (file.gridfs_id) {
    if (file.size) res.set('Content-Length', String(file.size));
    const stream = getUploadBucket().openDownloadStream(file.gridfs_id);
    stream.on('error', (err: any) => {
      console.error('GridFS read error:', err);
      if (!res.headersSent) res.status(410).json({ error: 'File has been removed' });
      else res.destroy();
    });
    return stream.pipe(res);
  }

  // Legacy: local disk (ephemeral) or an inline buffer.
  if (file.path) {
    const safePath = assertSafeDiskPath(file.path);
    if (safePath && fs.existsSync(safePath)) {
      return res.sendFile(safePath, (err) => {
        if (err && !res.headersSent) {
          console.error('File send error:', err);
          res.status(500).json({ error: 'Failed to read file from disk' });
        }
      });
    }
  }

  if (file.data) {
    return res.send(file.data);
  }

  return res.status(410).json({ error: 'File has been removed' });
}

router.get('/:fileId', async (req: AuthRequest, res: Response) => {
  try {
    const { fileId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(fileId)) {
      return res.status(400).json({ error: 'Invalid file ID' });
    }

    const file = await FileStore.findById(fileId);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Everything except avatars (public profile pictures rendered via plain
    // <img>) is access-controlled: the requester must be authenticated AND be a
    // participant of the message/group that shared it (or the uploader/an admin).
    // This covers 'message', 'other', and legacy uncategorised files so shared
    // documents can never be fetched by an unauthorised party or a bare URL.
    if (file.category !== 'avatar') {
      const authenticated = await runAuth(req, res);
      if (!authenticated || res.headersSent) return;

      const allowed = await canAccessMessageFile(file, req.user);
      if (!allowed) {
        return res.status(403).json({ error: 'You do not have access to this file' });
      }
    }

    const extractedId = extractUploadFileId(`${req.protocol}://${req.get('host')}${req.originalUrl}`);
    if (extractedId !== fileId) {
      return res.status(400).json({ error: 'Invalid file URL' });
    }

    return serveStoredFile(req, res, file);
  } catch (error: any) {
    console.error('File serve error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
