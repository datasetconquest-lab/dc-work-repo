import { Router } from 'express';
import type { Response } from 'express';
import { authMiddleware } from '../middleware.js';
import type { AuthRequest } from '../middleware.js';
import { Task } from '../models/Task.js';
import { User } from '../models/User.js';
import mongoose from 'mongoose';
import { toObjectId } from '../utils/objectId.js';

const router = Router();

const TASK_STATUSES = new Set(['pending', 'started', 'processing', 'review', 'completed', 'cancelled']);
const PROCESSING_DETAIL_FIELDS = ['dataset_name', 'dataset_links', 'dataset_size', 'limitations', 'novelty'] as const;
const COMPLETION_DETAIL_FIELDS = ['completion_results', 'completion_values', 'completion_summary'] as const;
const CORE_UPDATE_FIELDS = ['title', 'description', 'due_date'] as const;

function cleanString(value: any): string | undefined {
  if (value === undefined || value === null) return undefined;
  const clean = String(value).trim();
  return clean || undefined;
}

function hasValue(value: any): boolean {
  return typeof value === 'string' ? value.trim().length > 0 : value !== undefined && value !== null;
}

function isTaskCreator(user: any, task: any): boolean {
  return task.created_by?.toString() === user.id;
}

function isTaskAssignee(user: any, task: any): boolean {
  return task.assigned_to?.toString() === user.id;
}

// Approve / move a task to the final "completed" state: admins for any task,
// team leads only for tasks assigned to their own team members.
async function canCompleteTask(user: any, task: any): Promise<boolean> {
  if (user.role === 'admin') return true;
  return await isLeadOfAssignee(user, task);
}

// True when a team lead owns the assignee of this task (their direct report).
async function isLeadOfAssignee(user: any, task: any): Promise<boolean> {
  if (user.role !== 'tl' || !task.assigned_to) return false;
  const leadObjectId = toObjectId(user.id);
  if (!leadObjectId) return false;
  const teamIds = await getTeamMemberIdsForLead(leadObjectId);
  return teamIds.includes(task.assigned_to.toString());
}

// "Workers" drive a task forward and enter its details: the assignee, the
// assignee's team lead, the owner of a personal task, or an admin.
async function canManageAsWorker(user: any, task: any): Promise<boolean> {
  if (user.role === 'admin') return true;
  if (isTaskAssignee(user, task)) return true;
  if (task.task_type === 'personal' && isTaskCreator(user, task)) return true;
  if (await isLeadOfAssignee(user, task)) return true;
  return false;
}

// Helper to check if user can update task status (async: needs team lookup).
// Flow: pending -> started -> processing -> review -> completed.
// Workers move it up to "review" (submit for approval); only admins complete.
async function canUpdateTaskStatus(user: any, task: any, newStatus: string): Promise<boolean> {
  if (!TASK_STATUSES.has(newStatus)) return false;
  if (user.role === 'admin') return true; // admin can perform any transition

  switch (newStatus) {
    case 'started':
    case 'processing':
    case 'review':
      return canManageAsWorker(user, task);
    case 'completed':
      // Admin handled above; a team lead may approve their teammates' tasks.
      return await isLeadOfAssignee(user, task);
    case 'pending':
    case 'cancelled':
      return isTaskCreator(user, task);
    default:
      return false;
  }
}

// Helper to get all team member IDs for a given team lead
async function getTeamMemberIdsForLead(leadId: mongoose.Types.ObjectId, includeLead = false): Promise<string[]> {
  const teamMembers = await User.find({ team_lead_id: leadId }).select('_id').lean();
  const ids = teamMembers.map(m => m._id.toString());
  if (includeLead) ids.push(leadId.toString());
  return ids;
}

async function canAssignCompanyTask(user: any, assignedTo: mongoose.Types.ObjectId, userObjectId: mongoose.Types.ObjectId): Promise<boolean> {
  const assigneeExists = await User.exists({ _id: assignedTo, is_active: true });
  if (!assigneeExists) return false;

  if (user.role === 'admin') return true;
  if (assignedTo.toString() === user.id) return true;
  if (user.role === 'tl') {
    const teamIds = await getTeamMemberIdsForLead(userObjectId);
    return teamIds.includes(assignedTo.toString());
  }

  return false;
}

function missingProcessingDetails(task: any, updates: any): string[] {
  const missing: string[] = [];
  for (const field of PROCESSING_DETAIL_FIELDS) {
    const nextValue = updates[field] !== undefined ? updates[field] : task[field];
    if (!hasValue(nextValue)) missing.push(field);
  }
  const nextDueDate = updates.due_date !== undefined ? updates.due_date : task.due_date;
  if (!nextDueDate) missing.push('due_date');
  return missing;
}

// GET /api/tasks - Get tasks with filters
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { type, status, assigned_to, related_user } = req.query;

    const userObjectId = toObjectId(userId);
    if (!userObjectId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    let relatedObjectId: mongoose.Types.ObjectId | null = null;
    if (related_user) {
      if (req.user!.role !== 'admin') {
        return res.status(403).json({ error: 'Only admins can filter tasks by related user' });
      }

      relatedObjectId = toObjectId(related_user as string);
      if (!relatedObjectId) {
        return res.status(400).json({ error: 'Invalid related user ID' });
      }
    }

    let filter: any = { is_deleted: false };

    if (relatedObjectId) {
      filter.$or = [
        { assigned_to: relatedObjectId },
        { user_id: relatedObjectId },
        { created_by: relatedObjectId }
      ];
      if (type === 'personal' || type === 'company') {
        filter.task_type = type;
      }
    } else {
      // Filter by task type
      if (type === 'personal') {
        filter.task_type = 'personal';
        filter.created_by = userObjectId;
      } else if (type === 'company') {
        filter.task_type = 'company';
      } else {
        // All users can see every company task, plus their own personal tasks.
        filter.$or = [
          { task_type: 'company' },
          { task_type: 'personal', created_by: userObjectId }
        ];
      }
    }

    // Filter by status
    if (status) {
      filter.status = status;
    }

    // Filter by assignee after applying visibility rules.
    if (assigned_to) {
      const assignedObjectId = toObjectId(assigned_to as string);
      if (assignedObjectId) {
        filter.assigned_to = assignedObjectId;
      }
    }

    const tasks = await Task.aggregate([
      { $match: filter },
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
          as: 'creator'
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'approved_by',
          foreignField: '_id',
          as: 'approver'
        }
      },
      { $unwind: { path: '$assignee', preserveNullAndEmptyArrays: true } },
      { $unwind: { path: '$creator', preserveNullAndEmptyArrays: true } },
      { $unwind: { path: '$approver', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          id: { $toString: '$_id' },
          assigned_to_name: '$assignee.full_name',
          assigned_to_avatar: '$assignee.avatar_url',
          created_by_name: '$creator.full_name',
          approved_by_name: '$approver.full_name',
          assigned_to: { $toString: '$assigned_to' },
          created_by: { $toString: '$created_by' },
          approved_by: { $toString: '$approved_by' },
          user_id: { $toString: '$user_id' }
        }
      },
      {
        $project: {
          assignee: 0,
          creator: 0,
          approver: 0
        }
      },
      {
        $sort: {
          status: 1,
          due_date: 1,
          created_at: -1
        }
      }
    ]);

    res.json(tasks);
  } catch (error: any) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch tasks' });
  }
});

// GET /api/tasks/counts - Get task counts (company tasks only)
router.get('/counts', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const matchFilter: any = { task_type: 'company', is_deleted: false };

    const counts = await Task.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: null,
          pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          started: { $sum: { $cond: [{ $eq: ['$status', 'started'] }, 1, 0] } },
          processing: { $sum: { $cond: [{ $eq: ['$status', 'processing'] }, 1, 0] } },
          review: { $sum: { $cond: [{ $eq: ['$status', 'review'] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          total: { $sum: 1 }
        }
      }
    ]);

    res.json(counts[0] || { pending: 0, started: 0, processing: 0, review: 0, completed: 0, total: 0 });
  } catch (error: any) {
    console.error('Get task counts error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch task counts' });
  }
});

// GET /api/tasks/history/:userId - Get completed task history
router.get('/history/:userId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const requestingUser = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    if (userId !== requestingUser && !isAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const userObjectId = toObjectId(userId);
    if (!userObjectId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const tasks = await Task.find({
      $or: [
        { assigned_to: userObjectId },
        { user_id: userObjectId }
      ],
      status: 'completed',
      is_deleted: false
    }).sort({ completed_at: -1 });

    const formattedTasks = tasks.map(task => ({
      id: task._id.toString(),
      ...task.toObject(),
      assigned_to: task.assigned_to?.toString(),
      created_by: task.created_by?.toString(),
      user_id: task.user_id?.toString()
    }));

    res.json(formattedTasks);
  } catch (error: any) {
    console.error('Get task history error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch task history' });
  }
});

// POST /api/tasks - Create task
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const {
      title,
      description,
      task_type = 'personal',
      assigned_to,
      due_date,
    } = req.body;

    const cleanTitle = cleanString(title);
    if (!cleanTitle) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const userObjectId = toObjectId(userId);
    if (!userObjectId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const finalTaskType = task_type === 'company' ? 'company' : 'personal';
    const requestedAssignedTo = assigned_to ? toObjectId(assigned_to) : null;
    const finalAssignedTo =
      finalTaskType === 'personal'
        ? userObjectId
        : (requestedAssignedTo || userObjectId);

    if (finalTaskType === 'personal' && requestedAssignedTo && requestedAssignedTo.toString() !== userId) {
      return res.status(403).json({ error: 'Personal tasks can only be created for yourself' });
    }

    // Company task assignment:
    // - Admin: any active user
    // - Team lead: self or direct team members
    // - Member: self only
    if (finalTaskType === 'company') {
      if (!await canAssignCompanyTask(req.user, finalAssignedTo, userObjectId)) {
        return res.status(403).json({
          error: 'You can create company tasks only for yourself or users you are allowed to manage'
        });
      }
    }

    const task = new Task({
      title: cleanTitle,
      description: cleanString(description),
      task_type: finalTaskType,
      assigned_to: finalAssignedTo,
      due_date: due_date ? new Date(due_date) : null,
      created_by: userObjectId,
      user_id: finalAssignedTo || userObjectId,
      status: 'pending',
      dataset_name: cleanString(req.body.dataset_name),
      dataset_links: cleanString(req.body.dataset_links),
      dataset_size: cleanString(req.body.dataset_size),
      limitations: cleanString(req.body.limitations),
      novelty: cleanString(req.body.novelty)
    });

    await task.save();

    // Send notification for company tasks
    if (finalTaskType === 'company' && finalAssignedTo && finalAssignedTo.toString() !== userId) {
      try {
        const { sendNotificationToUser } = await import('../server.js');
        sendNotificationToUser(finalAssignedTo.toString(), {
          type: 'new_task',
          title: 'New Task Assigned',
          message: `${title}`
        });
      } catch (e) {
        console.error('Failed to send task notification:', e);
      }
    }

    res.status(201).json({
      id: task._id.toString(),
      ...task.toObject(),
      assigned_to: task.assigned_to?.toString(),
      created_by: task.created_by?.toString(),
      user_id: task.user_id?.toString()
    });
  } catch (error: any) {
    console.error('Create task error:', error);
    res.status(500).json({ error: error.message || 'Failed to create task' });
  }
});

// PUT /api/tasks/:id - Update task
router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';
    const updates = req.body;
    const userObjectId = toObjectId(userId);
    if (!userObjectId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const taskObjectId = toObjectId(id);
    if (!taskObjectId) {
      return res.status(400).json({ error: 'Invalid task ID' });
    }

    const task = await Task.findOne({ _id: taskObjectId, is_deleted: false });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const isCreator = isTaskCreator(req.user, task);
    const worker = await canManageAsWorker(req.user, task);
    const coreUpdates = CORE_UPDATE_FIELDS.filter((field) => updates[field] !== undefined);
    const processingDetailUpdates = PROCESSING_DETAIL_FIELDS.filter((field) => updates[field] !== undefined);
    const completionDetailUpdates = COMPLETION_DETAIL_FIELDS.filter((field) => updates[field] !== undefined);
    const targetStatus = updates.status !== undefined ? updates.status : task.status;

    // Check permissions for status updates
    if (updates.status !== undefined) {
      if (!TASK_STATUSES.has(updates.status)) {
        return res.status(400).json({ error: 'Invalid task status' });
      }

      if (!(await canUpdateTaskStatus(req.user, task, updates.status))) {
        return res.status(403).json({
          error: updates.status === 'completed'
            ? 'Only an admin or the assignee\'s team lead can approve and complete a task.'
            : 'You do not have permission to set this task status.'
        });
      }

      // Enforce the linear flow for non-admins.
      if (updates.status === 'processing' && task.status === 'pending') {
        return res.status(400).json({ error: 'Start the task before moving it to processing' });
      }
      if (updates.status === 'review' && task.status !== 'processing' && !isAdmin) {
        return res.status(400).json({ error: 'Move the task to processing before submitting it for approval' });
      }
    }

    if (coreUpdates.length > 0 && !isAdmin && !isCreator) {
      return res.status(403).json({
        error: 'Only admins or task creators can update title, description, or due date.'
      });
    }

    if (processingDetailUpdates.length > 0 && !worker) {
      return res.status(403).json({
        error: 'Only admins, the assignee, or their team lead can update processing details.'
      });
    }

    if (completionDetailUpdates.length > 0 && !worker) {
      return res.status(403).json({
        error: 'Only admins, the assignee, or their team lead can submit completion details.'
      });
    }

    if (updates.assigned_to !== undefined) {
      if (task.task_type !== 'company') {
        return res.status(400).json({ error: 'Personal tasks cannot be reassigned' });
      }

      if (!isAdmin && !isCreator) {
        return res.status(403).json({ error: 'Only admins or task creators can reassign tasks' });
      }

      const nextAssignedTo = toObjectId(updates.assigned_to);
      if (!nextAssignedTo) {
        return res.status(400).json({ error: 'Invalid assignee ID' });
      }

      if (!await canAssignCompanyTask(req.user, nextAssignedTo, userObjectId)) {
        return res.status(403).json({
          error: 'You can assign company tasks only to yourself or users you are allowed to manage'
        });
      }

      task.assigned_to = nextAssignedTo;
      task.user_id = nextAssignedTo;
    }

    if (targetStatus === 'processing') {
      const missing = missingProcessingDetails(task, updates);
      if (missing.length > 0) {
        return res.status(400).json({
          error: `Processing details are required: ${missing.join(', ')}`
        });
      }
    }

    // Workers must submit the final results/values/summary when sending the
    // task for admin approval (-> "review"). Admins approve without re-entry.
    if (updates.status === 'review') {
      const missing = COMPLETION_DETAIL_FIELDS.filter((field) => {
        const next = updates[field] !== undefined ? updates[field] : (task as any)[field];
        return !hasValue(next);
      });
      if (missing.length > 0) {
        return res.status(400).json({
          error: `Completion details are required before submitting for approval: ${missing.join(', ')}`
        });
      }
    }

    // Apply core task fields.
    if (updates.title !== undefined) {
      const nextTitle = cleanString(updates.title);
      if (!nextTitle) {
        return res.status(400).json({ error: 'Title is required' });
      }
      task.title = nextTitle;
    }
    if (updates.description !== undefined) task.description = cleanString(updates.description);
    if (updates.due_date !== undefined) task.due_date = updates.due_date ? new Date(updates.due_date) : undefined;

    // Apply processing detail fields.
    for (const field of PROCESSING_DETAIL_FIELDS) {
      if (updates[field] !== undefined) {
        (task as any)[field] = cleanString(updates[field]);
      }
    }

    // Apply completion detail fields (entered by the worker when submitting for approval).
    for (const field of COMPLETION_DETAIL_FIELDS) {
      if (updates[field] !== undefined) {
        (task as any)[field] = cleanString(updates[field]);
      }
    }

    const previousStatus = task.status;
    if (updates.status !== undefined) task.status = updates.status;

    // Set started_at when work actually begins
    if (updates.status && (updates.status === 'started' || updates.status === 'processing') && !task.started_at) {
      task.started_at = new Date();
    }

    // Stamp when the worker submits the task for admin approval
    if (updates.status === 'review') {
      task.submitted_at = new Date();
    }

    // Set completed_at and record the approver if status is completed
    if (updates.status === 'completed') {
      task.completed_at = new Date();
      task.approved_by = userObjectId;
    }

    task.updated_at = new Date();
    await task.save();

    // Notifications: alert admins on submission, alert assignee on approval.
    if (updates.status && updates.status !== previousStatus) {
      try {
        const { sendNotificationToUser } = await import('../server.js');
        if (updates.status === 'review') {
          const admins = await User.find({ role: 'admin', is_active: true }).select('_id').lean();
          for (const a of admins) {
            sendNotificationToUser(a._id.toString(), {
              type: 'task_review',
              title: 'Task Submitted for Approval',
              message: `"${task.title}" is ready for review`
            });
          }
        } else if (updates.status === 'completed' && task.assigned_to) {
          sendNotificationToUser(task.assigned_to.toString(), {
            type: 'task_completed',
            title: 'Task Approved & Completed',
            message: `"${task.title}" was approved`
          });
        }
      } catch (e) {
        console.error('Failed to send task status notification:', e);
      }
    }

    res.json({
      id: task._id.toString(),
      ...task.toObject(),
      assigned_to: task.assigned_to?.toString(),
      created_by: task.created_by?.toString(),
      user_id: task.user_id?.toString()
    });
  } catch (error: any) {
    console.error('Update task error:', error);
    res.status(500).json({ error: error.message || 'Failed to update task' });
  }
});

// PUT /api/tasks/:id/complete - Mark task as complete (admin only, requires completion details)
router.put('/:id/complete', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const taskObjectId = toObjectId(id);
    if (!taskObjectId) {
      return res.status(400).json({ error: 'Invalid task ID' });
    }

    const task = await Task.findOne({ _id: taskObjectId, is_deleted: false });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (!(await canCompleteTask(req.user, task))) {
      return res.status(403).json({
        error: 'Only an admin or the assignee\'s team lead can approve and complete a task.'
      });
    }

    // Approve: use the details the worker submitted; allow an admin to override.
    const missing: string[] = [];
    for (const field of COMPLETION_DETAIL_FIELDS) {
      const provided = cleanString(req.body?.[field]);
      if (provided !== undefined) (task as any)[field] = provided;
      if (!hasValue((task as any)[field])) missing.push(field);
    }
    if (missing.length > 0) {
      return res.status(400).json({
        error: `This task has no completion details to approve. Ask the assignee to submit: ${missing.join(', ')}`
      });
    }

    task.status = 'completed';
    task.completed_at = new Date();
    task.approved_by = toObjectId(req.user!.id) || undefined;
    task.updated_at = new Date();
    await task.save();

    // Notify the assignee that their submission was approved.
    if (task.assigned_to) {
      try {
        const { sendNotificationToUser } = await import('../server.js');
        sendNotificationToUser(task.assigned_to.toString(), {
          type: 'task_completed',
          title: 'Task Approved & Completed',
          message: `"${task.title}" was approved`
        });
      } catch (e) {
        console.error('Failed to send completion notification:', e);
      }
    }

    res.json({
      id: task._id.toString(),
      ...task.toObject(),
      assigned_to: task.assigned_to?.toString(),
      created_by: task.created_by?.toString(),
      user_id: task.user_id?.toString()
    });
  } catch (error: any) {
    console.error('Complete task error:', error);
    res.status(500).json({ error: error.message || 'Failed to complete task' });
  }
});

// DELETE /api/tasks/:id - Delete task
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';
    const isTeamLead = req.user!.role === 'tl';

    const taskObjectId = toObjectId(id);
    if (!taskObjectId) {
      return res.status(400).json({ error: 'Invalid task ID' });
    }

    const task = await Task.findOne({ _id: taskObjectId, is_deleted: false });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (task.task_type === 'company') {
      // Admins: full control — can delete any company task in any state.
      if (isAdmin) {
        // no restriction
      } else if (isTeamLead) {
        // Team Leads: can delete company tasks they created for themselves or their team members.
        const creatorMatches = task.created_by?.toString() === userId;
        if (!creatorMatches) {
          return res.status(403).json({
            error: 'Team leads can only delete company tasks they created'
          });
        }

        const leadObjectId = toObjectId(userId);
        if (!leadObjectId) {
          return res.status(400).json({ error: 'Invalid team lead ID' });
        }

        const teamIds = await getTeamMemberIdsForLead(leadObjectId, true);
        const assignedId = task.assigned_to?.toString();
        if (!assignedId || !teamIds.includes(assignedId)) {
          return res.status(403).json({
            error: 'Team leads can only delete tasks assigned to themselves or their own team members'
          });
        }
      } else {
        return res.status(403).json({
          error: 'Only admins or team leads can delete company tasks'
        });
      }
    } else {
      // Personal tasks: only creator (or admin) can delete
      if (!isAdmin && task.created_by?.toString() !== userId) {
        return res.status(403).json({
          error: 'You can only delete your own personal tasks'
        });
      }
    }

    task.is_deleted = true;
    await task.save();

    res.json({ message: 'Task deleted successfully' });
  } catch (error: any) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete task' });
  }
});

export default router;
