import { Router } from 'express';
import type { Response } from 'express';
import { authMiddleware, adminMiddleware } from '../middleware.js';
import type { AuthRequest } from '../middleware.js';
import { Todo } from '../models/Todo.js';
import { User } from '../models/User.js';
import { toObjectId } from '../utils/objectId.js';

const router = Router();

const MAX_TODO_LENGTH = 500;

function serializeTodo(todo: any, struckByName?: string | null) {
    return {
        id: todo._id.toString(),
        user_id: todo.user_id?.toString(),
        text: todo.text,
        is_done: !!todo.is_done,
        struck_by: todo.struck_by?.toString() || null,
        struck_by_name: struckByName ?? null,
        struck_at: todo.struck_at || null,
        created_at: todo.created_at,
        updated_at: todo.updated_at,
    };
}

// GET /api/todos - the current user's own to-do list
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const userObjectId = toObjectId(req.user!.id);
        if (!userObjectId) return res.status(400).json({ error: 'Invalid user ID' });

        const todos = await Todo.find({ user_id: userObjectId }).sort({ is_done: 1, created_at: -1 }).lean();
        res.json(todos.map((t) => serializeTodo(t)));
    } catch (error: any) {
        console.error('Get todos error:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch to-do list' });
    }
});

// POST /api/todos - admin only: add an item to a user's list. The target owner
// is `user_id` in the body; when omitted it defaults to the admin's own list.
router.post('/', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const text = String(req.body?.text ?? '').trim();
        if (!text) return res.status(400).json({ error: 'To-do text is required' });
        if (text.length > MAX_TODO_LENGTH) {
            return res.status(400).json({ error: `To-do text must be ${MAX_TODO_LENGTH} characters or fewer` });
        }

        const targetId = req.body?.user_id ? toObjectId(req.body.user_id) : toObjectId(req.user!.id);
        if (!targetId) return res.status(400).json({ error: 'Invalid user ID' });
        const exists = await User.exists({ _id: targetId });
        if (!exists) return res.status(404).json({ error: 'Target user not found' });

        const todo = new Todo({ user_id: targetId, text });
        await todo.save();
        res.status(201).json(serializeTodo(todo));
    } catch (error: any) {
        console.error('Create todo error:', error);
        res.status(500).json({ error: error.message || 'Failed to add to-do item' });
    }
});

// PUT /api/todos/:id - admin only: edit an item's text
router.put('/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const todoId = toObjectId(req.params.id);
        if (!todoId) return res.status(400).json({ error: 'Invalid to-do ID' });

        const text = String(req.body?.text ?? '').trim();
        if (!text) return res.status(400).json({ error: 'To-do text is required' });
        if (text.length > MAX_TODO_LENGTH) {
            return res.status(400).json({ error: `To-do text must be ${MAX_TODO_LENGTH} characters or fewer` });
        }

        const todo = await Todo.findByIdAndUpdate(
            todoId,
            { text, updated_at: new Date() },
            { new: true }
        );
        if (!todo) return res.status(404).json({ error: 'To-do item not found' });
        res.json(serializeTodo(todo));
    } catch (error: any) {
        console.error('Update todo error:', error);
        res.status(500).json({ error: error.message || 'Failed to update to-do item' });
    }
});

// GET /api/todos/user/:userId - admin views a specific user's list
router.get('/user/:userId', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const targetId = toObjectId(req.params.userId);
        if (!targetId) return res.status(400).json({ error: 'Invalid user ID' });

        const todos = await Todo.find({ user_id: targetId }).sort({ is_done: 1, created_at: -1 }).lean();

        // Resolve the names of the admins who struck items off.
        const strikerIds = [...new Set(todos.filter((t) => t.struck_by).map((t) => t.struck_by!.toString()))];
        const strikers = strikerIds.length
            ? await User.find({ _id: { $in: strikerIds } }).select('full_name email').lean()
            : [];
        const nameById: Record<string, string> = {};
        strikers.forEach((u) => { nameById[u._id.toString()] = u.full_name || u.email; });

        res.json(todos.map((t) => serializeTodo(t, t.struck_by ? nameById[t.struck_by.toString()] : null)));
    } catch (error: any) {
        console.error('Get user todos error:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch to-do list' });
    }
});

// PATCH /api/todos/:id/strike - admin only: strike an item off (or restore it)
router.patch('/:id/strike', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const todoId = toObjectId(req.params.id);
        if (!todoId) return res.status(400).json({ error: 'Invalid to-do ID' });

        const todo = await Todo.findById(todoId);
        if (!todo) return res.status(404).json({ error: 'To-do item not found' });

        // Explicit is_done in the body sets the state; otherwise toggle.
        const nextDone = typeof req.body?.is_done === 'boolean' ? req.body.is_done : !todo.is_done;
        todo.is_done = nextDone;
        if (nextDone) {
            todo.struck_by = toObjectId(req.user!.id) || undefined;
            todo.struck_at = new Date();
        } else {
            todo.struck_by = undefined;
            todo.struck_at = undefined;
        }
        todo.updated_at = new Date();
        await todo.save();

        res.json(serializeTodo(todo, nextDone ? req.user!.email : null));
    } catch (error: any) {
        console.error('Strike todo error:', error);
        res.status(500).json({ error: error.message || 'Failed to update to-do item' });
    }
});

// DELETE /api/todos/:id - admin only
router.delete('/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const todoId = toObjectId(req.params.id);
        if (!todoId) return res.status(400).json({ error: 'Invalid to-do ID' });

        const result = await Todo.deleteOne({ _id: todoId });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'To-do item not found' });
        res.json({ success: true });
    } catch (error: any) {
        console.error('Delete todo error:', error);
        res.status(500).json({ error: error.message || 'Failed to remove to-do item' });
    }
});

export default router;
