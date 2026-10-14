import { Router } from 'express';
import type { Response, NextFunction } from 'express';
import multer from 'multer';
import { Octokit } from '@octokit/rest';
import { authMiddleware } from '../middleware.js';
import type { AuthRequest } from '../middleware.js';
import { Task } from '../models/Task.js';
import type { ITask } from '../models/Task.js';
import { User } from '../models/User.js';
import { toObjectId } from '../utils/objectId.js';

const router = Router();

// ==========================================
// Config & Octokit Client
// ==========================================

const OWNER = process.env.GITHUB_COMPANY_OWNER || 'datasetconquest-lab';

let cachedOctokit: Octokit | null = null;
let cachedToken: string | null = null;

function getOctokit(): { octokit: Octokit; owner: string } {
  const token = process.env.GITHUB_COMPANY_TOKEN;
  if (!token) {
    const err: any = new Error('GitHub integration is not configured');
    err.status = 503;
    throw err;
  }
  if (!cachedOctokit || cachedToken !== token) {
    cachedOctokit = new Octokit({ auth: token });
    cachedToken = token;
  }
  return { octokit: cachedOctokit, owner: OWNER };
}

// Multer storage for uploads: 25 MB max per file, up to 20 files
const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 20,
  },
});

function handleMulter(req: AuthRequest, res: Response, next: NextFunction) {
  multerUpload.array('files', 20)(req, res, (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File size exceeds maximum allowed limit of 25 MB' });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ error: 'Too many files uploaded. Maximum is 20 files at once' });
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ error: 'Unexpected file upload field name. Must be "files"' });
      }
      return res.status(400).json({ error: err.message || 'File upload error' });
    }
    next();
  });
}

// ==========================================
// Helpers
// ==========================================

/**
 * NFKD-normalize, strip accents, lowercase, non [a-z0-9] -> "-", trim dashes, max 80 chars
 */
export function toRepoName(title: string): string {
  if (!title) return 'task-repo';
  let name = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (name.length > 80) {
    name = name.substring(0, 80).replace(/-+$/, '');
  }
  return name || 'task-repo';
}

function isValidRepoName(name: string): boolean {
  if (!name || name === '.' || name === '..') return false;
  return /^[A-Za-z0-9._-]{1,100}$/.test(name);
}

function sanitizePath(rawPath: string | undefined, requireNonEmpty = false): string {
  if (!rawPath) {
    if (requireNonEmpty) {
      const err: any = new Error('File path is required');
      err.status = 400;
      throw err;
    }
    return '';
  }

  const normalized = rawPath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);

  for (const seg of segments) {
    if (seg === '.' || seg === '..' || seg === '.git' || /[\x00-\x1f\x7f]/.test(seg)) {
      const err: any = new Error(`Invalid path segment: "${seg}"`);
      err.status = 400;
      throw err;
    }
  }

  const clean = segments.join('/');
  if (clean.length > 1000) {
    const err: any = new Error('Path length exceeds maximum limit of 1000 characters');
    err.status = 400;
    throw err;
  }

  if (requireNonEmpty && !clean) {
    const err: any = new Error('File path cannot be empty');
    err.status = 400;
    throw err;
  }

  return clean;
}

function sanitizeFilename(originalName: string): string {
  const decoded = Buffer.from(originalName, 'latin1').toString('utf8');
  const base = decoded.replace(/\\/g, '/').split('/').pop() || '';
  const clean = base.replace(/[\x00-\x1f\x7f]/g, '').trim();

  if (!clean || clean === '.' || clean === '..' || clean === '.git') {
    const err: any = new Error(`Invalid filename: "${originalName}"`);
    err.status = 400;
    throw err;
  }

  if (clean.length > 200) {
    const err: any = new Error(`Filename too long (max 200 chars): "${clean}"`);
    err.status = 400;
    throw err;
  }

  return clean;
}

function handleGitHubError(error: any, res: Response) {
  console.error('[GitHub Error]', error?.message || error);
  const status = error.status || error.statusCode || 500;

  if (status === 503) {
    return res.status(503).json({ error: error.message || 'GitHub integration is not configured' });
  }
  if (status === 400) {
    return res.status(400).json({ error: error.message || 'Bad request' });
  }
  if (status === 401) {
    return res.status(502).json({ error: 'GitHub rejected the company token' });
  }
  if (status === 403) {
    return res.status(502).json({ error: 'GitHub rejected the request (rate limit or forbidden)' });
  }
  if (status === 404) {
    return res.status(404).json({ error: error.message || 'Not found on GitHub' });
  }
  if (status === 409) {
    return res.status(409).json({ error: 'File changed by someone else, reload and try again' });
  }
  if (status === 422) {
    return res.status(422).json({ error: error.message || 'GitHub could not process this request' });
  }

  return res.status(502).json({ error: error.message || 'GitHub service error' });
}

// ==========================================
// Access Control
// ==========================================

function canViewTask(task: ITask, user: { id: string; role: string }): boolean {
  if (task.is_deleted) return false;
  if (user.role === 'admin') return true;
  if (task.task_type === 'company') return true;
  if (
    task.task_type === 'personal' &&
    ((task.created_by && task.created_by.toString() === user.id) ||
      (task.user_id && task.user_id.toString() === user.id))
  ) {
    return true;
  }
  return false;
}

async function canWriteTask(task: ITask, user: { id: string; role: string }): Promise<boolean> {
  if (!canViewTask(task, user)) return false;
  if (user.role === 'admin') return true;
  if (task.assigned_to && task.assigned_to.toString() === user.id) return true;
  if (task.created_by && task.created_by.toString() === user.id) return true;
  if (task.user_id && task.user_id.toString() === user.id) return true;

  // Team lead check: user is team lead of the assignee
  if (task.assigned_to) {
    const assignee = await User.findById(task.assigned_to).select('team_lead_id');
    if (assignee?.team_lead_id && assignee.team_lead_id.toString() === user.id) {
      return true;
    }
  }

  return false;
}

async function authorizeRepo(repo: string, user: { id: string; role: string }, needWrite: boolean) {
  if (!isValidRepoName(repo)) {
    const err: any = new Error('Invalid repository name');
    err.status = 400;
    throw err;
  }

  // Find all non-deleted tasks whose github_repo matches repo (case-insensitive)
  const escapedRepo = repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tasks = await Task.find({
    is_deleted: false,
    github_repo: { $regex: new RegExp(`^${escapedRepo}$`, 'i') },
  });

  const viewableTasks = tasks.filter((t) => canViewTask(t, user));
  if (viewableTasks.length === 0) {
    const err: any = new Error('Repository not found or not linked to a task you can access');
    err.status = 404;
    throw err;
  }

  let canWrite = false;
  for (const t of viewableTasks) {
    if (await canWriteTask(t, user)) {
      canWrite = true;
      break;
    }
  }

  if (needWrite && !canWrite) {
    const err: any = new Error('You do not have permission to modify files in this repository');
    err.status = 403;
    throw err;
  }

  return { repo, canWrite, tasks: viewableTasks };
}

async function getCommitIdentity(userId: string) {
  const dbUser = await User.findById(userId).select('full_name email');
  return {
    name: dbUser?.full_name?.trim() || 'Team Member',
    email: dbUser?.email?.trim() || 'noreply@dataconquest.com',
  };
}

// All endpoints require standard auth
router.use(authMiddleware);

// ==========================================
// 1. POST /task/:taskId/create-repo
// ==========================================
router.post('/task/:taskId/create-repo', async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const taskObjId = toObjectId(req.params.taskId);
    if (!taskObjId) {
      return res.status(400).json({ error: 'Invalid task ID format' });
    }

    const task = await Task.findOne({ _id: taskObjId, is_deleted: false });
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (!(await canWriteTask(task, user))) {
      return res.status(403).json({ error: 'You do not have permission to create a repository for this task' });
    }

    if (task.github_repo) {
      return res.status(409).json({ error: `Task already has a linked repository: ${task.github_repo}` });
    }

    const { octokit, owner } = getOctokit();
    const baseName = toRepoName(req.body?.name || task.title);

    let targetName = baseName;
    let exists = false;
    try {
      await octokit.repos.get({ owner, repo: targetName });
      exists = true;
    } catch (e: any) {
      if (e.status !== 404) throw e;
    }

    if (exists) {
      const suffix = task._id.toString().slice(-6);
      targetName = `${baseName}-${suffix}`;
      try {
        await octokit.repos.get({ owner, repo: targetName });
        return res.status(409).json({ error: `Repository ${targetName} already exists under ${owner}` });
      } catch (e: any) {
        if (e.status !== 404) throw e;
      }
    }

    let repoData: any;
    try {
      const createdRes = await octokit.repos.createInOrg({
        org: owner,
        name: targetName,
        private: true,
        description: `DC Teams task: ${task.title}`,
        auto_init: false,
      });
      repoData = createdRes.data;
    } catch (createErr: any) {
      if (createErr.status === 404) {
        // Fallback: check if owner is authenticated user account instead of an org
        const authUser = await octokit.users.getAuthenticated();
        if (authUser.data.login.toLowerCase() === owner.toLowerCase()) {
          const userRepoRes = await octokit.repos.createForAuthenticatedUser({
            name: targetName,
            private: true,
            description: `DC Teams task: ${task.title}`,
            auto_init: false,
          });
          repoData = userRepoRes.data;
        } else {
          throw createErr;
        }
      } else {
        throw createErr;
      }
    }

    if (!repoData.private) {
      try {
        await octokit.repos.delete({ owner, repo: targetName });
      } catch {
        // ignore delete failure
      }
      return res.status(500).json({ error: 'Repository was not created as private. Deleted for safety.' });
    }

    // Save repo on task FIRST
    task.github_repo = targetName;
    await task.save();

    // Commit initial README.md with employee as author/committer
    const commitIdentity = await getCommitIdentity(user.id);
    const assignedUser = task.assigned_to ? await User.findById(task.assigned_to).select('full_name email') : null;
    const createdUser = task.created_by ? await User.findById(task.created_by).select('full_name email') : null;

    const assignedStr = assignedUser ? `${assignedUser.full_name} (${assignedUser.email})` : 'Unassigned';
    const createdStr = createdUser ? `${createdUser.full_name} (${createdUser.email})` : 'Unknown';
    const dueDateStr = task.due_date ? new Date(task.due_date).toLocaleDateString() : 'None';

    const readmeContent = `# ${task.title}

${task.description || '_No description provided._'}

## Task Details
- **Task ID:** ${task._id}
- **Type:** ${task.task_type}
- **Status:** ${task.status}
- **Assigned to:** ${assignedStr}
- **Created by:** ${createdStr}
- **Due Date:** ${dueDateStr}

---
*This repository is managed through DC Teams.*
`;

    try {
      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo: targetName,
        path: 'README.md',
        message: `Initial commit: README for ${task.title}`,
        content: Buffer.from(readmeContent, 'utf8').toString('base64'),
        author: commitIdentity,
        committer: commitIdentity,
      });
    } catch (readmeErr) {
      console.error('[GitHub] Failed to commit initial README.md:', readmeErr);
    }

    return res.status(201).json({
      github_repo: targetName,
      html_url: repoData.html_url,
      owner,
    });
  } catch (error: any) {
    return handleGitHubError(error, res);
  }
});

// ==========================================
// 2. POST /task/:taskId/link-repo (Admin only)
// ==========================================
router.post('/task/:taskId/link-repo', async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can link an existing repository' });
    }

    const taskObjId = toObjectId(req.params.taskId);
    if (!taskObjId) {
      return res.status(400).json({ error: 'Invalid task ID format' });
    }

    const task = await Task.findOne({ _id: taskObjId, is_deleted: false });
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const repo = (req.body?.repo || '').trim();
    if (!isValidRepoName(repo)) {
      return res.status(400).json({ error: 'Invalid repository name' });
    }

    const { octokit, owner } = getOctokit();
    let repoData: any;
    try {
      const getRes = await octokit.repos.get({ owner, repo });
      repoData = getRes.data;
    } catch (getErr: any) {
      if (getErr.status === 404) {
        return res.status(404).json({ error: `Repository "${repo}" not found under ${owner}` });
      }
      throw getErr;
    }

    if (!repoData.private) {
      return res.status(400).json({ error: 'Only private repositories can be linked to DC Teams tasks' });
    }

    task.github_repo = repo;
    await task.save();

    return res.json({
      github_repo: repo,
      html_url: repoData.html_url,
      owner,
    });
  } catch (error: any) {
    return handleGitHubError(error, res);
  }
});

// ==========================================
// 3. GET /repo/:repo/tree?path=
// ==========================================
router.get('/repo/:repo/tree', async (req: AuthRequest, res: Response) => {
  try {
    const repo = req.params.repo;
    const authResult = await authorizeRepo(repo, req.user!, false);
    const sanitizedPath = sanitizePath(req.query.path as string | undefined, false);

    const { octokit, owner } = getOctokit();

    let contentData: any;
    try {
      const response = await octokit.repos.getContent({
        owner,
        repo,
        path: sanitizedPath,
      });
      contentData = response.data;
    } catch (contentErr: any) {
      if (contentErr.status === 404) {
        // If root path is 404, repo is empty
        if (!sanitizedPath) {
          return res.json({
            repo,
            owner,
            path: '',
            entries: [],
            empty: true,
            can_write: authResult.canWrite,
            html_url: `https://github.com/${owner}/${repo}`,
          });
        }
        return res.status(404).json({ error: `Directory "${sanitizedPath}" not found` });
      }
      throw contentErr;
    }

    if (!Array.isArray(contentData)) {
      return res.status(400).json({ error: 'Target path is a file, not a directory' });
    }

    const entries = contentData
      .map((item: any) => ({
        name: item.name,
        path: item.path,
        type: item.type === 'dir' ? 'dir' : 'file',
        size: item.size || 0,
        sha: item.sha,
      }))
      .sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'dir' ? -1 : 1;
        }
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });

    return res.json({
      repo,
      owner,
      path: sanitizedPath,
      entries,
      empty: entries.length === 0,
      can_write: authResult.canWrite,
      html_url: `https://github.com/${owner}/${repo}`,
    });
  } catch (error: any) {
    return handleGitHubError(error, res);
  }
});

// ==========================================
// 4. GET /repo/:repo/content?path=
// ==========================================
router.get('/repo/:repo/content', async (req: AuthRequest, res: Response) => {
  try {
    const repo = req.params.repo;
    const authResult = await authorizeRepo(repo, req.user!, false);
    const sanitizedPath = sanitizePath(req.query.path as string | undefined, true);

    const { octokit, owner } = getOctokit();

    const response = await octokit.repos.getContent({
      owner,
      repo,
      path: sanitizedPath,
    });

    const fileData: any = response.data;
    if (Array.isArray(fileData)) {
      return res.status(400).json({ error: 'Path points to a directory, not a file' });
    }

    const baseResult = {
      repo,
      path: sanitizedPath,
      name: fileData.name,
      sha: fileData.sha,
      size: fileData.size,
      can_write: authResult.canWrite,
      html_url: fileData.html_url,
    };

    // If size > 2 MB, return too_large
    if (fileData.size > 2 * 1024 * 1024) {
      return res.json({
        ...baseResult,
        content: null,
        too_large: true,
        is_binary: false,
      });
    }

    let buffer: Buffer;
    if (!fileData.content || fileData.encoding === 'none') {
      // File over 1 MB or empty encoding -> fetch via git blob
      const blobRes = await octokit.git.getBlob({
        owner,
        repo,
        file_sha: fileData.sha,
      });
      buffer = Buffer.from(blobRes.data.content, 'base64');
    } else {
      buffer = Buffer.from(fileData.content, 'base64');
    }

    // Check if binary: inspect first 8000 bytes for null character
    const sample = buffer.subarray(0, 8000);
    const isBinary = sample.includes(0);

    if (isBinary) {
      return res.json({
        ...baseResult,
        content: null,
        too_large: false,
        is_binary: true,
      });
    }

    return res.json({
      ...baseResult,
      content: buffer.toString('utf8'),
      too_large: false,
      is_binary: false,
    });
  } catch (error: any) {
    return handleGitHubError(error, res);
  }
});

// ==========================================
// 5. POST /repo/:repo/upload
// ==========================================
router.post('/repo/:repo/upload', handleMulter, async (req: AuthRequest, res: Response) => {
  try {
    const repo = req.params.repo;
    await authorizeRepo(repo, req.user!, true);

    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files provided for upload' });
    }

    const targetFolder = sanitizePath(req.body.path, false);
    const rawMessage = (req.body.message || '').trim().slice(0, 500);

    // Validate all filenames first
    const sanitizedFiles = files.map((f) => {
      const cleanName = sanitizeFilename(f.originalname);
      const fullPath = targetFolder ? `${targetFolder}/${cleanName}` : cleanName;
      return {
        file: f,
        cleanName,
        fullPath,
      };
    });

    const { octokit, owner } = getOctokit();
    const commitIdentity = await getCommitIdentity(req.user!.id);

    const results: Array<{ path: string; status: 'created' | 'updated' | 'failed'; error?: string }> = [];

    // Commit SEQUENTIALLY to avoid Git tree write conflicts
    for (const item of sanitizedFiles) {
      try {
        let existingSha: string | undefined;
        try {
          const checkRes = await octokit.repos.getContent({
            owner,
            repo,
            path: item.fullPath,
          });
          if (Array.isArray(checkRes.data)) {
            throw new Error(`Path ${item.fullPath} is a directory`);
          }
          existingSha = (checkRes.data as any).sha;
        } catch (e: any) {
          if (e.status !== 404) throw e;
        }

        const commitMsg = rawMessage || (existingSha ? `Update ${item.fullPath}` : `Upload ${item.fullPath}`);

        await octokit.repos.createOrUpdateFileContents({
          owner,
          repo,
          path: item.fullPath,
          message: commitMsg,
          content: item.file.buffer.toString('base64'),
          sha: existingSha,
          author: commitIdentity,
          committer: commitIdentity,
        });

        results.push({
          path: item.fullPath,
          status: existingSha ? 'updated' : 'created',
        });
      } catch (err: any) {
        console.error(`[GitHub Upload] Failed to commit ${item.fullPath}:`, err?.message || err);
        results.push({
          path: item.fullPath,
          status: 'failed',
          error: err?.message || 'Commit failed',
        });
      }
    }

    const allFailed = results.length > 0 && results.every((r) => r.status === 'failed');
    if (allFailed) {
      return res.status(502).json({
        error: 'Failed to upload and commit files to GitHub',
        results,
      });
    }

    return res.json({ results });
  } catch (error: any) {
    return handleGitHubError(error, res);
  }
});

// ==========================================
// 6. PUT /repo/:repo/file
// ==========================================
router.put('/repo/:repo/file', async (req: AuthRequest, res: Response) => {
  try {
    const repo = req.params.repo;
    await authorizeRepo(repo, req.user!, true);

    const sanitizedPath = sanitizePath(req.body.path, true);
    const content = typeof req.body.content === 'string' ? req.body.content : '';
    const sha = typeof req.body.sha === 'string' && req.body.sha.trim() ? req.body.sha.trim() : undefined;
    const message = (req.body.message || '').trim().slice(0, 500) || (sha ? `Update ${sanitizedPath}` : `Create ${sanitizedPath}`);

    const { octokit, owner } = getOctokit();
    const commitIdentity = await getCommitIdentity(req.user!.id);

    const result = await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: sanitizedPath,
      message,
      content: Buffer.from(content, 'utf8').toString('base64'),
      sha,
      author: commitIdentity,
      committer: commitIdentity,
    });

    return res.json({
      path: sanitizedPath,
      sha: result.data.content?.sha,
      commit_sha: result.data.commit?.sha,
    });
  } catch (error: any) {
    return handleGitHubError(error, res);
  }
});

// ==========================================
// 7. DELETE /repo/:repo/file
// ==========================================
router.delete('/repo/:repo/file', async (req: AuthRequest, res: Response) => {
  try {
    const repo = req.params.repo;
    await authorizeRepo(repo, req.user!, true);

    const rawPath = (req.body?.path || req.query.path) as string | undefined;
    const sanitizedPath = sanitizePath(rawPath, true);

    const sha = (req.body?.sha || req.query.sha) as string | undefined;
    if (!sha || typeof sha !== 'string' || !sha.trim()) {
      return res.status(400).json({ error: 'File sha is required to delete a file' });
    }

    const message = ((req.body?.message || req.query.message || '') as string).trim().slice(0, 500) || `Delete ${sanitizedPath}`;

    const { octokit, owner } = getOctokit();
    const commitIdentity = await getCommitIdentity(req.user!.id);

    const result = await octokit.repos.deleteFile({
      owner,
      repo,
      path: sanitizedPath,
      sha: sha.trim(),
      message,
      author: commitIdentity,
      committer: commitIdentity,
    });

    return res.json({
      path: sanitizedPath,
      commit_sha: result.data.commit?.sha,
    });
  } catch (error: any) {
    return handleGitHubError(error, res);
  }
});

export default router;
