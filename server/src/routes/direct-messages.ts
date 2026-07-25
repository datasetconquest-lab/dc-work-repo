import { Router } from 'express';
import type { Response } from 'express';
import { authMiddleware } from '../middleware.js';
import type { AuthRequest } from '../middleware.js';
import { DirectMessage } from '../models/DirectMessage.js';
import { User } from '../models/User.js';
import { toObjectId } from '../utils/objectId.js';
import { normalizeMessageAttachments } from '../utils/messageAttachments.js';

const router = Router();


// Get conversation between current user and another user
router.get('/user/:otherUserId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { otherUserId } = req.params;
    const userObjectId = toObjectId(req.user.id);
    const otherObjectId = toObjectId(otherUserId);

    if (!userObjectId || !otherObjectId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const messages = await DirectMessage.aggregate([
      {
        $match: {
          $or: [
            { sender_id: userObjectId, receiver_id: otherObjectId },
            { sender_id: otherObjectId, receiver_id: userObjectId }
          ]
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
      { $unwind: { path: '$sender', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          id: { $toString: '$_id' },
          sender_id: { $toString: '$sender_id' },
          recipient_id: { $toString: '$receiver_id' },
          content: '$message',
          author_full_name: '$sender.full_name',
          author_avatar_url: '$sender.avatar_url',
          read_at: { $cond: [{ $eq: ['$is_read', true] }, '$updated_at', null] }
        }
      },
      { $project: { sender: 0, message: 0, receiver_id: 0 } },
      { $sort: { created_at: 1 } }
    ]);

    return res.json(messages);
  } catch (error: any) {
    console.error('Error fetching direct messages:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch messages' });
  }
});

// Mark messages as read from a specific user
router.post('/read/:otherUserId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { otherUserId } = req.params;
    const userObjectId = toObjectId(req.user.id);
    const otherObjectId = toObjectId(otherUserId);

    if (!userObjectId || !otherObjectId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    await DirectMessage.updateMany(
      { sender_id: otherObjectId, receiver_id: userObjectId, is_read: false },
      { is_read: true, updated_at: new Date() }
    );

    return res.json({ success: true });
  } catch (error: any) {
    console.error('Error marking messages as read:', error);
    return res.status(500).json({ error: error.message || 'Failed to mark messages as read' });
  }
});

// Get unread message counts
router.get('/unread-count', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userObjectId = toObjectId(req.user.id);
    if (!userObjectId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const unreadCounts = await DirectMessage.aggregate([
      { $match: { receiver_id: userObjectId, is_read: false } },
      { $group: { _id: '$sender_id', count: { $sum: 1 } } }
    ]);

    const counts: Record<string, number> = {};
    unreadCounts.forEach((row: any) => {
      counts[row._id.toString()] = row.count;
    });

    return res.json(counts);
  } catch (error: any) {
    console.error('Error fetching unread counts:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch unread counts' });
  }
});

// Send message to another user
router.post('/user/:otherUserId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { otherUserId } = req.params;
    const { content, attachments } = req.body as {
      content?: string;
      attachments?: unknown[];
    };

    if (!content && (!attachments || attachments.length === 0)) {
      return res.status(400).json({ error: 'Message content or attachments required' });
    }

    const userObjectId = toObjectId(req.user.id);
    const otherObjectId = toObjectId(otherUserId);

    if (!userObjectId || !otherObjectId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const apiBaseUrl = `${req.protocol}://${req.get('host')}/api`;
    const normalizedAttachments = await normalizeMessageAttachments(attachments || [], userObjectId, apiBaseUrl);

    const message = new DirectMessage({
      sender_id: userObjectId,
      receiver_id: otherObjectId,
      message: content || '',
      attachments: normalizedAttachments
    });

    await message.save();

    // Get sender's name for the notification
    const sender = await User.findById(userObjectId).select('full_name avatar_url');
    const senderName = sender?.full_name || req.user.email;
    const senderAvatar = sender?.avatar_url;

    // Prepare the message with author info for real-time update
    const messageWithAuthor = {
      id: message._id.toString(),
      sender_id: message.sender_id.toString(),
      recipient_id: message.receiver_id.toString(),
      content: message.message,
      attachments: message.attachments,
      created_at: message.created_at,
      read_at: null,
      author_full_name: senderName,
      author_avatar_url: senderAvatar
    };

    // Send real-time notification and message to recipient
    try {
      const { sendNotificationToUser, io } = await import('../server.js');

      sendNotificationToUser(otherUserId, {
        type: 'message',
        title: `Message from ${senderName}`,
        message: content ? (content.length > 50 ? content.substring(0, 50) + '...' : content) : 'Sent an attachment'
      });

      io.to(`user:${otherUserId}`).emit('new_message', {
        sender_id: req.user.id,
        message: messageWithAuthor
      });
    } catch (e) {
      console.error('Failed to send WebSocket notification:', e);
    }

    return res.json(messageWithAuthor);
  } catch (error: any) {
    console.error('Error sending direct message:', error);
    return res.status(500).json({ error: error.message || 'Failed to send message' });
  }
});

// Delete a direct message (only sender can delete)
router.delete('/:messageId', authMiddleware, async (req: AuthRequest, res: Response) => {
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

    const message = await DirectMessage.findOneAndDelete({
      _id: messageObjectId,
      sender_id: userObjectId
    });

    if (!message) {
      return res.status(403).json({ error: 'You can only delete your own messages' });
    }

    return res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting direct message:', error);
    return res.status(500).json({ error: error.message || 'Failed to delete message' });
  }
});

export default router;
