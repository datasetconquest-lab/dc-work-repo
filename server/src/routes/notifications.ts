import { Router } from 'express';
import type { Response } from 'express';
import { authMiddleware } from '../middleware.js';
import type { AuthRequest } from '../middleware.js';
import { DirectMessage } from '../models/DirectMessage.js';
import { GroupMember, GroupMessage, Group } from '../models/Group.js';
import { Task } from '../models/Task.js';
import { CalendarEvent } from '../models/CalendarEvent.js';
import { User } from '../models/User.js';
import { toObjectId } from '../utils/objectId.js';

const router = Router();


router.get('/poll', authMiddleware, async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const since = req.query.since as string;

    if (!since) {
        return res.json({ notifications: [] });
    }

    try {
        const notifications: any[] = [];
        const userObjectId = toObjectId(userId);
        const sinceDate = new Date(since);

        if (!userObjectId) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }

        // 1. New DM messages
        const dms = await DirectMessage.aggregate([
            {
                $match: {
                    receiver_id: userObjectId,
                    created_at: { $gt: sinceDate }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'sender_id',
                    foreignField: '_id',
                    as: 'sender'
                }
            },
            { $unwind: '$sender' }
        ]);

        dms.forEach(dm => {
            notifications.push({
                type: 'message',
                title: `Message from ${dm.sender.full_name}`,
                message: dm.message ? (dm.message.length > 50 ? dm.message.substring(0, 50) + '...' : dm.message) : 'Sent an attachment',
                timestamp: dm.created_at
            });
        });

        // 2. New Group messages
        const userGroups = await GroupMember.find({ user_id: userObjectId }).lean();

        if (userGroups.length > 0) {
            const groupIds = userGroups.map(g => g.group_id);
            const groups = await Group.find({ _id: { $in: groupIds } }).lean();
            const groupMap: Record<string, string> = {};
            groups.forEach(g => {
                groupMap[g._id.toString()] = g.name;
            });

            const groupMsgs = await GroupMessage.aggregate([
                {
                    $match: {
                        group_id: { $in: groupIds },
                        created_at: { $gt: sinceDate },
                        user_id: { $ne: userObjectId }
                    }
                },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'user_id',
                        foreignField: '_id',
                        as: 'author'
                    }
                },
                { $unwind: '$author' }
            ]);

            groupMsgs.forEach(msg => {
                notifications.push({
                    type: 'group_message',
                    title: groupMap[msg.group_id.toString()] || 'Group',
                    message: `${msg.author.full_name}: ${msg.message ? (msg.message.length > 40 ? msg.message.substring(0, 40) + '...' : msg.message) : 'Sent an attachment'}`,
                    timestamp: msg.created_at
                });
            });
        }

        // 3. New tasks assigned to user (not created by them)
        const newTasks = await Task.aggregate([
            {
                $match: {
                    assigned_to: userObjectId,
                    created_by: { $ne: userObjectId },
                    created_at: { $gt: sinceDate }
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
            { $unwind: { path: '$creator', preserveNullAndEmptyArrays: true } }
        ]);

        newTasks.forEach(t => {
            notifications.push({
                type: 'new_task',
                title: 'New Task Assigned',
                message: `${t.title}`,
                timestamp: t.created_at
            });
        });

        // 4. Task status updates
        const taskUpdates = await Task.find({
            $or: [
                { assigned_to: userObjectId },
                { created_by: userObjectId }
            ],
            updated_at: { $gt: sinceDate },
            $expr: { $ne: ['$updated_at', '$created_at'] }
        }).lean();

        taskUpdates.forEach(t => {
            notifications.push({
                type: 'task_update',
                title: 'Task Status Changed',
                message: `"${t.title}" is now ${t.status}`,
                timestamp: t.updated_at
            });
        });

        // 5. Global Calendar Events (company-wide)
        const globalEvents = await CalendarEvent.find({
            is_company_wide: true,
            updated_at: { $gt: sinceDate },
            created_by: { $ne: userObjectId }
        }).lean();

        globalEvents.forEach(e => {
            notifications.push({
                type: 'company_event',
                title: 'New Company Event',
                message: e.title,
                timestamp: e.updated_at
            });
        });

        // 6. Personal calendar events/reminders
        const now = new Date();
        const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
        const fiftyMinutesAfterSince = new Date(sinceDate.getTime() + 50 * 60 * 1000);

        const upcomingEvents = await CalendarEvent.find({
            $or: [
                { created_by: userObjectId },
                { participants: userObjectId }
            ],
            start_time: { $gt: fiftyMinutesAfterSince, $lte: oneHourFromNow }
        }).lean();

        upcomingEvents.forEach(e => {
            const startTime = new Date(e.start_time);
            const minutesUntil = Math.round((startTime.getTime() - Date.now()) / 60000);
            notifications.push({
                type: 'reminder',
                title: 'Upcoming Event',
                message: `${e.title} starts in ${minutesUntil} minutes`,
                timestamp: new Date().toISOString()
            });
        });

        // 7. Added to a new group
        const newGroupMemberships = await GroupMember.aggregate([
            {
                $match: {
                    user_id: userObjectId,
                    joined_at: { $gt: sinceDate },
                    added_by: { $ne: userObjectId }
                }
            },
            {
                $lookup: {
                    from: 'groups',
                    localField: 'group_id',
                    foreignField: '_id',
                    as: 'group'
                }
            },
            { $unwind: '$group' }
        ]);

        newGroupMemberships.forEach(g => {
            notifications.push({
                type: 'group_added',
                title: 'Added to Group',
                message: `You were added to "${g.group.name}"`,
                timestamp: g.joined_at
            });
        });

        const serverTime = new Date().toISOString();
        res.json({ notifications, server_time: serverTime });

    } catch (e: any) {
        console.error('Notification poll error:', e);
        res.status(500).json({ error: 'Failed to poll notifications' });
    }
});

// Test endpoint to verify notifications are working
router.get('/test', authMiddleware, async (req: AuthRequest, res: Response) => {
    res.json({
        notifications: [
            {
                type: 'test',
                title: 'Test Notification',
                message: 'This is a test notification from the server',
                timestamp: new Date().toISOString()
            }
        ],
        server_time: new Date().toISOString()
    });
});

export default router;
