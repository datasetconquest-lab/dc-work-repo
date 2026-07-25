import { Router } from 'express';
import type { Response } from 'express';
import { authMiddleware } from '../middleware.js';
import type { AuthRequest } from '../middleware.js';
import { DirectMessage } from '../models/DirectMessage.js';
import { GroupMessage } from '../models/Group.js';
import { Reaction } from '../models/Common.js';
import { toObjectId } from '../utils/objectId.js';

const router = Router();


// ============================================================================
// DIRECT MESSAGES - Reactions & Read Status
// ============================================================================

// Add reaction to a direct message
router.post('/direct/:messageId/react', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { messageId } = req.params;
        const { emoji } = req.body;

        if (!emoji || typeof emoji !== 'string') {
            return res.status(400).json({ error: 'Emoji is required' });
        }

        const messageObjectId = toObjectId(messageId);
        const userObjectId = toObjectId(req.user.id);

        if (!messageObjectId || !userObjectId) {
            return res.status(400).json({ error: 'Invalid ID' });
        }

        const message = await DirectMessage.findById(messageObjectId);

        if (!message) {
            return res.status(404).json({ error: 'Message not found' });
        }

        // Check if reaction exists
        const existingReaction = await Reaction.findOne({
            message_id: messageObjectId,
            message_type: 'direct',
            user_id: userObjectId,
            emoji
        });

        if (existingReaction) {
            // Remove the reaction (toggle off)
            await existingReaction.deleteOne();
        } else {
            // Add the reaction
            await Reaction.create({
                message_id: messageObjectId,
                message_type: 'direct',
                user_id: userObjectId,
                emoji
            });
        }

        // Get all reactions for this message
        const reactions = await Reaction.find({
            message_id: messageObjectId,
            message_type: 'direct'
        }).lean();

        const formattedReactions = reactions.map(r => ({
            user_id: r.user_id.toString(),
            emoji: r.emoji,
            created_at: r.created_at
        }));

        return res.json({ reactions: formattedReactions });
    } catch (error: any) {
        console.error('Error adding reaction:', error);
        return res.status(500).json({ error: error.message || 'Failed to add reaction' });
    }
});

// Mark direct message as read
router.post('/direct/:messageId/read', authMiddleware, async (req: AuthRequest, res: Response) => {
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

        const result = await DirectMessage.findOneAndUpdate(
            { _id: messageObjectId, receiver_id: userObjectId, is_read: false },
            { is_read: true, updated_at: new Date() },
            { new: true }
        );

        if (!result) {
            return res.json({ message: 'Already read or not found' });
        }

        return res.json({ read_at: result.updated_at });
    } catch (error: any) {
        console.error('Error marking as read:', error);
        return res.status(500).json({ error: error.message || 'Failed to mark as read' });
    }
});

// Mark all messages from a user as read
router.post('/direct/user/:userId/read-all', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { userId } = req.params;
        const senderObjectId = toObjectId(userId);
        const receiverObjectId = toObjectId(req.user.id);

        if (!senderObjectId || !receiverObjectId) {
            return res.status(400).json({ error: 'Invalid ID' });
        }

        const result = await DirectMessage.updateMany(
            { sender_id: senderObjectId, receiver_id: receiverObjectId, is_read: false },
            { is_read: true, updated_at: new Date() }
        );

        return res.json({ updated: result.modifiedCount });
    } catch (error: any) {
        console.error('Error marking all as read:', error);
        return res.status(500).json({ error: error.message || 'Failed to mark all as read' });
    }
});

// ============================================================================
// GROUP MESSAGES - Reactions & Read Status
// ============================================================================

// Add reaction to a group message
router.post('/group/:messageId/react', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { messageId } = req.params;
        const { emoji } = req.body;

        if (!emoji || typeof emoji !== 'string') {
            return res.status(400).json({ error: 'Emoji is required' });
        }

        const messageObjectId = toObjectId(messageId);
        const userObjectId = toObjectId(req.user.id);

        if (!messageObjectId || !userObjectId) {
            return res.status(400).json({ error: 'Invalid ID' });
        }

        const message = await GroupMessage.findById(messageObjectId);

        if (!message) {
            return res.status(404).json({ error: 'Message not found' });
        }

        // Check if reaction exists
        const existingReaction = await Reaction.findOne({
            message_id: messageObjectId,
            message_type: 'group',
            user_id: userObjectId,
            emoji
        });

        if (existingReaction) {
            await existingReaction.deleteOne();
        } else {
            await Reaction.create({
                message_id: messageObjectId,
                message_type: 'group',
                user_id: userObjectId,
                emoji
            });
        }

        const reactions = await Reaction.find({
            message_id: messageObjectId,
            message_type: 'group'
        }).lean();

        const formattedReactions = reactions.map(r => ({
            user_id: r.user_id.toString(),
            emoji: r.emoji,
            created_at: r.created_at
        }));

        return res.json({ reactions: formattedReactions });
    } catch (error: any) {
        console.error('Error adding reaction:', error);
        return res.status(500).json({ error: error.message || 'Failed to add reaction' });
    }
});

// Mark group message as read - store read status in a separate collection or as part of message
router.post('/group/:messageId/read', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // For simplicity, we'll just return success - group read tracking can be implemented later
        return res.json({ read_by: [{ user_id: req.user.id, read_at: new Date().toISOString() }] });
    } catch (error: any) {
        console.error('Error marking as read:', error);
        return res.status(500).json({ error: error.message || 'Failed to mark as read' });
    }
});

// Mark all messages in a group as read
router.post('/group/:groupId/read-all', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // For simplicity, just return success
        return res.json({ updated: 0 });
    } catch (error: any) {
        console.error('Error marking all as read:', error);
        return res.status(500).json({ error: error.message || 'Failed to mark all as read' });
    }
});

// Get unread count for direct messages
router.get('/direct/unread-count', authMiddleware, async (req: AuthRequest, res: Response) => {
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
        console.error('Error getting unread count:', error);
        return res.status(500).json({ error: error.message || 'Failed to get unread count' });
    }
});

// Get unread count for group messages
router.get('/group/:groupId/unread-count', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // For simplicity, return 0 - proper group read tracking can be implemented later
        return res.json({ unread: 0 });
    } catch (error: any) {
        console.error('Error getting unread count:', error);
        return res.status(500).json({ error: error.message || 'Failed to get unread count' });
    }
});

export default router;
