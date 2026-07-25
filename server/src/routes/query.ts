import { Router } from 'express';
import type { Response } from 'express';
import { authMiddleware } from '../middleware.js';
import type { AuthRequest } from '../middleware.js';
import { Task } from '../models/Task.js';
import { User } from '../models/User.js';
import { Group, GroupMember, GroupMessage } from '../models/Group.js';
import { CalendarEvent } from '../models/CalendarEvent.js';
import mongoose from 'mongoose';
import { toObjectId } from '../utils/objectId.js';

type Operation = 'select' | 'insert' | 'update' | 'delete';

const router = Router();


// Map table names to MongoDB models
function getModel(table: string) {
  const models: Record<string, mongoose.Model<any>> = {
    tasks: Task,
    groups: Group,
    group_members: GroupMember,
    group_messages: GroupMessage,
    calendar_events: CalendarEvent,
    profiles: User,
  };
  return models[table];
}

const ALLOWED_TABLES = new Set([
  'tasks',
  'groups',
  'group_members',
  'group_messages',
  'calendar_events',
  'profiles',
]);

const USER_OWNED_TABLES = new Set(['tasks']);

function assertAllowedTable(table: unknown): asserts table is string {
  if (typeof table !== 'string' || !ALLOWED_TABLES.has(table)) {
    throw new Error('Table not allowed');
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

// Convert PostgreSQL-style where to MongoDB filter
function buildMongoFilter(where: Record<string, unknown> | undefined): Record<string, any> {
  if (!where) return {};

  const filter: Record<string, any> = {};
  for (const [key, val] of Object.entries(where)) {
    // Convert id fields to ObjectId
    if (key === 'id' || key.endsWith('_id')) {
      const objectId = toObjectId(val as string);
      if (objectId) {
        filter[key === 'id' ? '_id' : key] = objectId;
      }
    } else {
      filter[key] = val;
    }
  }
  return filter;
}

// Build sort object from order array
function buildSort(order: unknown): Record<string, 1 | -1> {
  if (!Array.isArray(order) || order.length !== 2) return { created_at: -1 };
  const [col, dir] = order;
  if (typeof col !== 'string') return { created_at: -1 };
  const sortDir = String(dir || '').toLowerCase() === 'desc' ? -1 : 1;
  return { [col]: sortDir };
}

// Format document for response (convert ObjectIds to strings)
function formatDoc(doc: any): any {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  obj.id = obj._id?.toString();

  // Convert all ObjectId fields to strings
  for (const key of Object.keys(obj)) {
    if (obj[key] instanceof mongoose.Types.ObjectId) {
      obj[key] = obj[key].toString();
    }
  }
  return obj;
}

// Generic query endpoint for the Vite frontend
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { operation, table, where, values, order, join } = req.body as {
      operation: Operation;
      table: string;
      where?: Record<string, unknown>;
      values?: Record<string, unknown>;
      order?: [string, 'asc' | 'desc' | 'ASC' | 'DESC'];
      join?: Record<string, unknown>;
    };

    if (!operation || !['select', 'insert', 'update', 'delete'].includes(operation)) {
      return res.status(400).json({ error: 'Invalid operation' });
    }

    assertAllowedTable(table);

    const Model = getModel(table);
    if (!Model) {
      return res.status(400).json({ error: 'Table not supported' });
    }

    const isAdmin = req.user?.role === 'admin';
    const userId = req.user?.id;
    const userObjectId = toObjectId(userId);

    // Lock down generic writes for non-admins. The dedicated routes
    // (/api/data, /api/calendar, /api/messages) already enforce membership
    // and ownership; this generic endpoint must not be a way around them.
    if (!isAdmin && operation !== 'select') {
      // Group messages and calendar events must go through their own routes.
      if (table === 'group_messages' || table === 'calendar_events') {
        return res.status(403).json({ error: 'Use the dedicated endpoint for this action' });
      }
      // Only admins can create or modify groups.
      if (table === 'groups') {
        return res.status(403).json({ error: 'Only admins can manage groups' });
      }
      // For group membership, a user may only add or remove themselves.
      if (table === 'group_members') {
        const targetId = operation === 'insert'
          ? (isPlainObject(values) ? values.user_id : undefined)
          : (isPlainObject(where) ? where.user_id : undefined);
        if (!targetId || String(targetId) !== String(userId)) {
          return res.status(403).json({ error: 'You can only change your own group membership' });
        }
      }
    }

    // Build effective filter with ownership enforcement
    const effectiveWhere: Record<string, unknown> = isPlainObject(where) ? { ...where } : {};

    if (!isAdmin) {
      if (table === 'profiles') {
        effectiveWhere.id = userId;
      }
      if (USER_OWNED_TABLES.has(table)) {
        effectiveWhere.user_id = userId;
      }
      if (table === 'tasks' && operation !== 'select') {
        effectiveWhere.created_by = userId;
      }
    }

    const filter = buildMongoFilter(effectiveWhere);

    if (operation === 'select') {
      const sort = buildSort(order);
      let query = Model.find(filter).sort(sort);

      // Handle joins via population
      if (join && isPlainObject(join)) {
        if (table === 'group_messages' && Array.isArray(join.profiles)) {
          query = query.populate('user_id', 'full_name avatar_url');
        }
        if (table === 'group_members' && Array.isArray(join.groups)) {
          query = query.populate('group_id');
        }
      }

      const docs = await query.lean();

      // Format results
      const results = docs.map((doc: any) => {
        const formatted: any = {
          ...doc,
          id: doc._id?.toString()
        };

        // Convert ObjectId fields to strings
        for (const key of Object.keys(formatted)) {
          if (formatted[key] instanceof mongoose.Types.ObjectId) {
            formatted[key] = formatted[key].toString();
          }
        }

        // Handle populated fields for joins
        if (table === 'group_messages' && doc.user_id && typeof doc.user_id === 'object') {
          formatted.author_full_name = doc.user_id.full_name;
          formatted.author_avatar_url = doc.user_id.avatar_url;
          formatted.user_id = doc.user_id._id?.toString();
        }
        if (table === 'group_members' && doc.group_id && typeof doc.group_id === 'object') {
          formatted.group_name = doc.group_id.name;
          formatted.group_description = doc.group_id.description;
          formatted.group_id = doc.group_id._id?.toString();
        }

        return formatted;
      });

      return res.json(results);
    }

    if (operation === 'insert') {
      if (!isPlainObject(values) || Object.keys(values).length === 0) {
        return res.status(400).json({ error: 'Missing values' });
      }

      // Prepare insert data
      const insertData: Record<string, any> = { ...values };

      // Stamp created_by if not provided
      if ((table === 'tasks' || table === 'groups') && !('created_by' in insertData) && userObjectId) {
        insertData.created_by = userObjectId;
      }

      // Stamp added_by for group_members
      if (table === 'group_members' && !('added_by' in insertData) && userObjectId) {
        insertData.added_by = userObjectId;
      }

      // Convert ID fields to ObjectId
      for (const key of Object.keys(insertData)) {
        if (key === 'id' || key.endsWith('_id')) {
          const objId = toObjectId(insertData[key] as string);
          if (objId) {
            insertData[key] = objId;
          }
        }
      }

      // Basic ownership enforcement for inserts
      if (!isAdmin && (table === 'tasks')) {
        if (insertData.user_id?.toString() !== userId) {
          return res.status(403).json({ error: 'Forbidden' });
        }
      }

      const doc = new Model(insertData);
      await doc.save();

      return res.json(formatDoc(doc));
    }

    if (operation === 'update') {
      if (!isPlainObject(values) || Object.keys(values).length === 0) {
        return res.status(400).json({ error: 'Missing values' });
      }

      // Prevent role / admin escalation via generic endpoint
      if (!isAdmin && table === 'profiles') {
        const forbidden = new Set(['role', 'is_active', 'created_by', 'created_at']);
        for (const key of Object.keys(values)) {
          if (forbidden.has(key)) return res.status(403).json({ error: 'Forbidden' });
        }
      }

      // Prepare update data
      const updateData: Record<string, any> = { ...values, updated_at: new Date() };

      // Convert ID fields to ObjectId
      for (const key of Object.keys(updateData)) {
        if (key.endsWith('_id') && typeof updateData[key] === 'string') {
          const objId = toObjectId(updateData[key] as string);
          if (objId) {
            updateData[key] = objId;
          }
        }
      }

      if (Object.keys(filter).length === 0) {
        return res.status(400).json({ error: 'Missing where clause' });
      }

      const doc = await Model.findOneAndUpdate(filter, updateData, { new: true });
      return res.json(formatDoc(doc));
    }

    // delete
    {
      if (Object.keys(filter).length === 0) {
        return res.status(400).json({ error: 'Missing where clause' });
      }

      const doc = await Model.findOneAndDelete(filter);
      return res.json(formatDoc(doc));
    }
  } catch (error: any) {
    console.error('Query route error:', error);
    return res.status(400).json({ error: error.message || 'Query failed' });
  }
});

export default router;
