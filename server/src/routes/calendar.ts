import { Router } from 'express';
import type { Response } from 'express';
import { authMiddleware } from '../middleware.js';
import type { AuthRequest } from '../middleware.js';
import { CalendarEvent } from '../models/CalendarEvent.js';
import { Task } from '../models/Task.js';
import { User } from '../models/User.js';
import { toObjectId } from '../utils/objectId.js';

const router = Router();


function monthRange(month: string) {
  const [y, m] = month.split('-').map((x) => parseInt(x, 10));
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0));
  return { start, end };
}

// GET /api/calendar/month - Get calendar data for a month
router.get('/month', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const month = String(req.query.month || '');
    const scope = String(req.query.scope || 'all');

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'month must be YYYY-MM' });
    }

    const { start, end } = monthRange(month);
    const isAdmin = req.user.role === 'admin';
    const userId = req.user.id;
    const userObjectId = toObjectId(userId);

    // Fetch events
    let eventFilter: any = {
      start_time: { $gte: start, $lt: end }
    };

    if (scope === 'personal') {
      eventFilter.created_by = userObjectId;
      eventFilter.is_company_wide = false;
    } else if (scope === 'company') {
      eventFilter.is_company_wide = true;
    } else {
      // All visible events
      if (!isAdmin) {
        eventFilter.$or = [
          { is_company_wide: true },
          { created_by: userObjectId },
          { participants: userObjectId }
        ];
      }
    }

    const events = await CalendarEvent.aggregate([
      { $match: eventFilter },
      {
        $lookup: {
          from: 'users',
          localField: 'created_by',
          foreignField: '_id',
          as: 'creator'
        }
      },
      { $unwind: { path: '$creator', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          id: { $toString: '$_id' },
          created_by_name: '$creator.full_name',
          created_by: { $toString: '$created_by' },
          event_scope: { $cond: [{ $eq: ['$is_company_wide', true] }, 'company', 'personal'] },
          is_global: '$is_company_wide'
        }
      },
      { $project: { creator: 0 } },
      { $sort: { start_time: 1 } }
    ]);

    // Fetch tasks with due dates in the month
    let taskFilter: any = {
      due_date: { $gte: start, $lt: end },
      status: { $nin: ['completed', 'cancelled'] },
      is_deleted: false
    };

    if (scope === 'personal') {
      taskFilter.task_type = 'personal';
      taskFilter.created_by = userObjectId;
    } else if (scope === 'company') {
      taskFilter.task_type = 'company';
    } else {
      taskFilter.$or = [
        { task_type: 'company' },
        { task_type: 'personal', created_by: userObjectId }
      ];
    }

    const tasks = await Task.aggregate([
      { $match: taskFilter },
      {
        $lookup: {
          from: 'users',
          localField: 'assigned_to',
          foreignField: '_id',
          as: 'assignee'
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'created_by',
          foreignField: '_id',
          as: 'taskCreator'
        }
      },
      { $unwind: { path: '$assignee', preserveNullAndEmptyArrays: true } },
      { $unwind: { path: '$taskCreator', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          id: { $toString: '$_id' },
          assigned_to_name: '$assignee.full_name',
          created_by_name: '$taskCreator.full_name',
          assigned_to: { $toString: '$assigned_to' },
          created_by: { $toString: '$created_by' },
          user_id: { $toString: '$user_id' }
        }
      },
      { $project: { assignee: 0, taskCreator: 0 } },
      { $sort: { due_date: 1 } }
    ]);

    return res.json({
      events,
      tasks
    });
  } catch (error: any) {
    console.error('Calendar month error:', error);
    return res.status(500).json({ error: error.message || 'Failed to load calendar' });
  }
});

// POST /api/calendar/events - Create calendar event
router.post('/events', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const {
      title,
      description,
      start_time,
      end_time,
      is_all_day,
      event_type,
      event_scope,
    } = req.body as any;

    if (!title || !start_time) {
      return res.status(400).json({ error: 'title and start_time are required' });
    }

    const isAdmin = req.user.role === 'admin';
    const userObjectId = toObjectId(req.user.id);
    let finalScope = event_scope || 'personal';

    // Only admin can create company events
    if (finalScope === 'company' && !isAdmin) {
      return res.status(403).json({ error: 'Only admins can create company events' });
    }

    const event = new CalendarEvent({
      title: String(title),
      description: description || null,
      start_time: new Date(start_time),
      end_time: end_time ? new Date(end_time) : null,
      all_day: Boolean(is_all_day),
      event_type: event_type || 'meeting',
      is_company_wide: finalScope === 'company',
      created_by: userObjectId,
      user_id: userObjectId,
      participants: finalScope === 'personal' ? [userObjectId] : []
    });

    await event.save();

    // Get creator name
    const creator = await User.findById(userObjectId).select('full_name');

    const responseEvent = {
      id: event._id.toString(),
      ...event.toObject(),
      created_by: event.created_by?.toString(),
      created_by_name: creator?.full_name,
      event_scope: finalScope,
      is_global: finalScope === 'company'
    };

    return res.status(201).json({
      message: `${finalScope === 'company' ? 'Company' : 'Personal'} event created successfully`,
      event: responseEvent
    });
  } catch (error: any) {
    console.error('Create event error:', error);
    return res.status(500).json({ error: error.message || 'Failed to create event' });
  }
});

// PUT /api/calendar/events/:id - Update calendar event
router.put('/events/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const isAdmin = req.user.role === 'admin';
    const updates = req.body;

    const eventObjectId = toObjectId(id);
    if (!eventObjectId) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    const event = await CalendarEvent.findById(eventObjectId);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Permission checks
    if (event.is_company_wide) {
      if (!isAdmin) {
        return res.status(403).json({
          error: 'Only admins can update company events'
        });
      }
    } else {
      if (event.created_by?.toString() !== req.user.id) {
        return res.status(403).json({
          error: 'You can only update your own personal events'
        });
      }
    }

    // Apply updates
    const allowedFields = [
      'title', 'description', 'start_time', 'end_time',
      'all_day', 'event_type'
    ];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        if (field === 'start_time' || field === 'end_time') {
          (event as any)[field] = updates[field] ? new Date(updates[field]) : null;
        } else {
          (event as any)[field] = updates[field];
        }
      }
    }

    event.updated_at = new Date();
    await event.save();

    // Get creator name
    const creator = await User.findById(event.created_by).select('full_name');

    const responseEvent = {
      id: event._id.toString(),
      ...event.toObject(),
      created_by: event.created_by?.toString(),
      created_by_name: creator?.full_name,
      event_scope: event.is_company_wide ? 'company' : 'personal',
      is_global: event.is_company_wide
    };

    return res.json({
      message: 'Event updated successfully',
      event: responseEvent
    });
  } catch (error: any) {
    console.error('Update event error:', error);
    return res.status(500).json({ error: error.message || 'Failed to update event' });
  }
});

// DELETE /api/calendar/events/:id - Delete calendar event
router.delete('/events/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const isAdmin = req.user.role === 'admin';

    const eventObjectId = toObjectId(id);
    if (!eventObjectId) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    const event = await CalendarEvent.findById(eventObjectId);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Permission checks
    if (event.is_company_wide) {
      if (!isAdmin) {
        return res.status(403).json({
          error: 'Only admins can delete company events'
        });
      }
    } else {
      if (event.created_by?.toString() !== req.user.id) {
        return res.status(403).json({
          error: 'You can only delete your own personal events'
        });
      }
    }

    await CalendarEvent.findByIdAndDelete(eventObjectId);

    return res.json({
      message: 'Event deleted successfully',
      eventId: id
    });
  } catch (error: any) {
    console.error('Delete event error:', error);
    return res.status(500).json({ error: 'Failed to delete event' });
  }
});

export default router;
