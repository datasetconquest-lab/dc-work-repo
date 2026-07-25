import { Router } from 'express';
import type { Response } from 'express';
import { authMiddleware } from '../middleware.js';
import type { AuthRequest } from '../middleware.js';
import { User } from '../models/User.js';
import { Group, GroupMember, GroupMessage } from '../models/Group.js';
import { CalendarEvent } from '../models/CalendarEvent.js';
import { toObjectId } from '../utils/objectId.js';
import { normalizeMessageAttachments } from '../utils/messageAttachments.js';

const router = Router();

// NOTE: Task CRUD is handled exclusively by /api/tasks route (routes/tasks.ts)
// This file handles groups, events, and user listing only.

// Get user's groups
router.get('/groups/user/:userId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;

    if (req.user?.id !== userId && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const userObjectId = toObjectId(userId);
    if (!userObjectId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const memberships = await GroupMember.find({ user_id: userObjectId }).lean();
    const groupIds = memberships.map(m => m.group_id);

    const groups = await Group.find({ _id: { $in: groupIds } })
      .sort({ created_at: -1 })
      .lean();

    const formattedGroups = groups.map(group => ({
      id: group._id.toString(),
      name: group.name,
      description: group.description,
      created_at: group.created_at
    }));

    res.json(formattedGroups);
  } catch (error: any) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch groups' });
  }
});

// Get group messages
router.get('/groups/:groupId/messages', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;

    const groupObjectId = toObjectId(groupId);
    const userObjectId = toObjectId(req.user?.id || '');

    if (!groupObjectId || !userObjectId) {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const isMember = await GroupMember.findOne({
      group_id: groupObjectId,
      user_id: userObjectId
    });

    if (!isMember && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    const messages = await GroupMessage.aggregate([
      { $match: { group_id: groupObjectId } },
      {
        $lookup: {
          from: 'users',
          localField: 'user_id',
          foreignField: '_id',
          as: 'author'
        }
      },
      { $unwind: '$author' },
      {
        $addFields: {
          id: { $toString: '$_id' },
          content: '$message',
          user_name: '$author.full_name',
          user_id: { $toString: '$user_id' }
        }
      },
      { $project: { author: 0, message: 0 } },
      { $sort: { created_at: 1 } }
    ]);

    res.json(messages);
  } catch (error: any) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch messages' });
  }
});

// Get group members
router.get('/groups/:groupId/members', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;

    const groupObjectId = toObjectId(groupId);
    const userObjectId = toObjectId(req.user?.id || '');

    if (!groupObjectId || !userObjectId) {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const isMember = await GroupMember.findOne({
      group_id: groupObjectId,
      user_id: userObjectId
    });

    if (!isMember && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    const members = await GroupMember.aggregate([
      { $match: { group_id: groupObjectId } },
      {
        $lookup: {
          from: 'users',
          localField: 'user_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $addFields: {
          id: { $toString: '$_id' },
          user_id: { $toString: '$user_id' },
          user_name: '$user.full_name',
          user_email: '$user.email',
          added_at: '$joined_at'
        }
      },
      { $project: { user: 0 } },
      { $sort: { joined_at: 1 } }
    ]);

    res.json(members);
  } catch (error: any) {
    console.error('Error fetching members:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch members' });
  }
});

// Create a group
router.post('/groups', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    const userObjectId = toObjectId(req.user.id);
    if (!userObjectId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const group = new Group({
      name: name.trim(),
      description: description?.trim() || null,
      created_by: userObjectId
    });

    await group.save();

    // Add creator as first member
    await GroupMember.create({
      group_id: group._id,
      user_id: userObjectId,
      added_by: userObjectId
    });

    res.json({
      id: group._id.toString(),
      name: group.name,
      description: group.description,
      created_at: group.created_at
    });
  } catch (error: any) {
    console.error('Error creating group:', error);
    res.status(500).json({ error: error.message || 'Failed to create group' });
  }
});

// Delete a group (admin only)
router.delete('/groups/:groupId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can delete groups' });
    }

    const { groupId } = req.params;
    const groupObjectId = toObjectId(groupId);

    if (!groupObjectId) {
      return res.status(400).json({ error: 'Invalid group ID' });
    }

    // Delete messages
    await GroupMessage.deleteMany({ group_id: groupObjectId });
    // Delete members
    await GroupMember.deleteMany({ group_id: groupObjectId });
    // Delete group
    const result = await Group.findByIdAndDelete(groupObjectId);

    if (!result) {
      return res.status(404).json({ error: 'Group not found' });
    }

    return res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting group:', error);
    return res.status(500).json({ error: error.message || 'Failed to delete group' });
  }
});

// Send a message to a group
router.post('/groups/:groupId/messages', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const { content, attachments } = req.body;

    if (!content?.trim() && (!attachments || attachments.length === 0)) {
      return res.status(400).json({ error: 'Message content or attachments required' });
    }

    const groupObjectId = toObjectId(groupId);
    const userObjectId = toObjectId(req.user?.id || '');

    if (!groupObjectId || !userObjectId) {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const isMember = await GroupMember.findOne({
      group_id: groupObjectId,
      user_id: userObjectId
    });

    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    const apiBaseUrl = `${req.protocol}://${req.get('host')}/api`;
    const normalizedAttachments = await normalizeMessageAttachments(attachments || [], userObjectId, apiBaseUrl);

    const message = new GroupMessage({
      group_id: groupObjectId,
      user_id: userObjectId,
      message: content?.trim() || '',
      attachments: normalizedAttachments
    });

    await message.save();

    // Get group name and sender info
    const group = await Group.findById(groupObjectId);
    const sender = await User.findById(userObjectId).select('full_name avatar_url');
    const groupName = group?.name || 'Group';
    const senderName = sender?.full_name || 'Someone';
    const senderAvatar = sender?.avatar_url;

    // Get other group members
    const members = await GroupMember.find({
      group_id: groupObjectId,
      user_id: { $ne: userObjectId }
    });

    const messageWithAuthor = {
      id: message._id.toString(),
      content: message.message,
      message: message.message,
      attachments: message.attachments,
      user_id: message.user_id.toString(),
      created_at: message.created_at,
      author_full_name: senderName,
      author_avatar_url: senderAvatar
    };

    // Send notifications
    try {
      const { sendNotificationToUser, io } = await import('../server.js');
      for (const member of members) {
        sendNotificationToUser(member.user_id.toString(), {
          type: 'group_message',
          title: groupName,
          message: content ? `${senderName}: ${content.length > 40 ? content.substring(0, 40) + '...' : content}` : `${senderName} shared an attachment`
        });

        io.to(`user:${member.user_id.toString()}`).emit('new_group_message', {
          group_id: groupId,
          message: messageWithAuthor
        });
      }
    } catch (e) {
      console.error('Failed to send WebSocket notifications:', e);
    }

    res.json(messageWithAuthor);
  } catch (error: any) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: error.message || 'Failed to send message' });
  }
});

// Add member to group (admin only)
router.post('/groups/:groupId/members', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can add members' });
    }

    const { groupId } = req.params;
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const groupObjectId = toObjectId(groupId);
    const userObjectId = toObjectId(user_id);
    const addedByObjectId = toObjectId(req.user?.id || '');

    if (!groupObjectId || !userObjectId || !addedByObjectId) {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    // Check if already member
    const existing = await GroupMember.findOne({
      group_id: groupObjectId,
      user_id: userObjectId
    });

    if (existing) {
      return res.status(409).json({ error: 'User is already a member' });
    }

    const member = new GroupMember({
      group_id: groupObjectId,
      user_id: userObjectId,
      added_by: addedByObjectId
    });

    await member.save();

    res.json({
      id: member._id.toString(),
      group_id: member.group_id.toString(),
      user_id: member.user_id.toString(),
      added_at: member.joined_at
    });
  } catch (error: any) {
    console.error('Error adding member:', error);
    res.status(500).json({ error: error.message || 'Failed to add member' });
  }
});

// Get user's upcoming events
router.get('/events/user/:userId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;

    if (req.user?.id !== userId && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const userObjectId = toObjectId(userId);
    if (!userObjectId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const events = await CalendarEvent.find({
      $or: [
        { created_by: userObjectId },
        { participants: userObjectId }
      ],
      start_time: { $gte: new Date() }
    }).sort({ start_time: 1 }).lean();

    const formattedEvents = events.map(event => ({
      id: event._id.toString(),
      title: event.title,
      description: event.description,
      start_time: event.start_time,
      end_time: event.end_time,
      all_day: event.all_day
    }));

    res.json(formattedEvents);
  } catch (error: any) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch events' });
  }
});

// Get all users (for admin)
router.get('/users', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const users = await User.find({ is_active: true })
      .select('email full_name avatar_url role is_active created_at')
      .sort({ full_name: 1 })
      .lean();

    const formattedUsers = users.map(user => ({
      id: user._id.toString(),
      email: user.email,
      full_name: user.full_name,
      avatar_url: user.avatar_url,
      role: user.role,
      is_active: user.is_active,
      created_at: user.created_at
    }));

    res.json(formattedUsers);
  } catch (error: any) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch users' });
  }
});

// Delete a group message (only sender can delete)
router.delete('/groups/:groupId/messages/:messageId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { messageId } = req.params;
    const messageObjectId = toObjectId(messageId);
    const userObjectId = toObjectId(req.user.id);

    if (!messageObjectId || !userObjectId) {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const result = await GroupMessage.findOneAndDelete({
      _id: messageObjectId,
      user_id: userObjectId
    });

    if (!result) {
      return res.status(403).json({ error: 'You can only delete your own messages' });
    }

    return res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting group message:', error);
    return res.status(500).json({ error: error.message || 'Failed to delete message' });
  }
});

export default router;
