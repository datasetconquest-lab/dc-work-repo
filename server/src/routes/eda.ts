import { Router } from 'express';
import type { Response } from 'express';
import { authMiddleware } from '../middleware.js';
import type { AuthRequest } from '../middleware.js';
import { EdaChat } from '../models/EdaChat.js';
import { EdaResult } from '../models/EdaResult.js';
import { toObjectId } from '../utils/objectId.js';

const router = Router();

// The Research Assistant Python service (FastAPI) that runs the heavy pipeline.
const EDA_SERVICE_URL = (process.env.EDA_SERVICE_URL || 'http://127.0.0.1:8765').replace(/\/$/, '');

const RUNNABLE_STAGES = new Set([
  'ingest', 'index', 'review', 'gaps', 'datasets', 'eda', 'humanize',
]);

// Every route requires a logged-in Teams user.
router.use(authMiddleware);

// Load a chat that belongs to the current user, or return null.
async function ownedChat(userId: string, chatId: string) {
  const _id = toObjectId(chatId);
  if (!_id) return null;
  return EdaChat.findOne({ _id, user_id: toObjectId(userId) });
}

// ---- Chat CRUD -----------------------------------------------------------

// List the current user's chats (most recently updated first).
router.get('/chats', async (req: AuthRequest, res: Response) => {
  try {
    const chats = await EdaChat.find({ user_id: toObjectId(req.user!.id) })
      .sort({ updated_at: -1 })
      .lean();
    res.json(chats);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list chats' });
  }
});

// Create a new chat (research project).
router.post('/chats', async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body || {};
    const problem = String(b.problem_statement || '').trim();
    const title = String(b.title || '').trim() || (problem ? problem.slice(0, 60) : 'Untitled research');
    const chat = await EdaChat.create({
      user_id: toObjectId(req.user!.id)!,
      title,
      problem_statement: problem,
      keywords: Array.isArray(b.keywords)
        ? b.keywords
        : String(b.keywords || '').split(',').map((s: string) => s.trim()).filter(Boolean),
      year_start: b.year_start ? Number(b.year_start) : undefined,
      year_end: b.year_end ? Number(b.year_end) : undefined,
      venues: Array.isArray(b.venues)
        ? b.venues
        : String(b.venues || '').split(',').map((s: string) => s.trim()).filter(Boolean),
      strong_only: Boolean(b.strong_only),
      sources: Array.isArray(b.sources) && b.sources.length ? b.sources : undefined,
      max_results: b.max_results ? Number(b.max_results) : undefined,
    });
    res.status(201).json(chat.toObject());
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create chat' });
  }
});

// Get one chat plus all its stored results.
router.get('/chats/:id', async (req: AuthRequest, res: Response) => {
  try {
    const chat = await ownedChat(req.user!.id, req.params.id);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    const results = await EdaResult.find({ chat_id: chat._id }).lean();
    const byKind: Record<string, unknown> = {};
    for (const r of results) byKind[r.kind] = r.data;
    res.json({ chat: chat.toObject(), results: byKind });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load chat' });
  }
});

// Rename / edit a chat's query fields.
router.patch('/chats/:id', async (req: AuthRequest, res: Response) => {
  try {
    const chat = await ownedChat(req.user!.id, req.params.id);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    const b = req.body || {};
    for (const f of ['title', 'problem_statement', 'max_results', 'year_start', 'year_end', 'strong_only'] as const) {
      if (b[f] !== undefined) (chat as any)[f] = b[f];
    }
    if (b.keywords !== undefined) {
      chat.keywords = Array.isArray(b.keywords)
        ? b.keywords
        : String(b.keywords).split(',').map((s: string) => s.trim()).filter(Boolean);
    }
    if (b.venues !== undefined) {
      chat.venues = Array.isArray(b.venues)
        ? b.venues
        : String(b.venues).split(',').map((s: string) => s.trim()).filter(Boolean);
    }
    if (Array.isArray(b.sources)) chat.sources = b.sources;
    await chat.save();
    res.json(chat.toObject());
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update chat' });
  }
});

// Delete a chat and all its results.
router.delete('/chats/:id', async (req: AuthRequest, res: Response) => {
  try {
    const chat = await ownedChat(req.user!.id, req.params.id);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    await EdaResult.deleteMany({ chat_id: chat._id });
    await chat.deleteOne();
    // Best-effort: ask the Python service to drop any on-disk artifacts.
    fetch(`${EDA_SERVICE_URL}/eda/purge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: req.user!.id, chat_id: String(chat._id) }),
    }).catch(() => {});
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete chat' });
  }
});

// ---- Pipeline (proxied to the Python service) ----------------------------

// Kick off a pipeline stage for a chat. Node enforces ownership; the Python
// service runs the job and persists results to MongoDB scoped to this chat.
router.post('/chats/:id/run', async (req: AuthRequest, res: Response) => {
  try {
    const chat = await ownedChat(req.user!.id, req.params.id);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    const stage = String(req.body?.stage || '');
    if (!RUNNABLE_STAGES.has(stage)) return res.status(400).json({ error: `Unknown stage: ${stage}` });

    const payload = {
      user_id: req.user!.id,
      chat_id: String(chat._id),
      stage,
      query: {
        problem_statement: chat.problem_statement,
        keywords: chat.keywords,
        year_start: chat.year_start,
        year_end: chat.year_end,
        venues: chat.venues,
        strong_only: chat.strong_only,
        sources: chat.sources,
        max_results: chat.max_results,
      },
      params: req.body?.params || {},
    };

    const upstream = await fetch(`${EDA_SERVICE_URL}/eda/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(502).json({ error: (data as any)?.error || 'EDA service error', detail: data });
    }
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ error: `EDA service unreachable: ${err.message}` });
  }
});

// Poll a running job (proxied). When a job finishes, the Python service has
// already written results + flags to MongoDB, so the UI re-reads /chats/:id.
router.get('/jobs/:jid', async (req: AuthRequest, res: Response) => {
  try {
    const upstream = await fetch(`${EDA_SERVICE_URL}/eda/jobs/${encodeURIComponent(req.params.jid)}`);
    const data = await upstream.json().catch(() => ({}));
    res.status(upstream.ok ? 200 : upstream.status).json(data);
  } catch (err: any) {
    res.status(502).json({ error: `EDA service unreachable: ${err.message}` });
  }
});

// Available LLM models for the portal's model picker (proxied).
router.get('/models', async (_req: AuthRequest, res: Response) => {
  try {
    const upstream = await fetch(`${EDA_SERVICE_URL}/eda/models`);
    const data = await upstream.json().catch(() => ({}));
    res.status(upstream.ok ? 200 : upstream.status).json(data);
  } catch (err: any) {
    res.status(502).json({ error: `EDA service unreachable: ${err.message}` });
  }
});

export default router;
