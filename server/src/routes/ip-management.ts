import { Router } from 'express';
import type { Response } from 'express';
import { authMiddleware } from '../middleware.js';
import type { AuthRequest } from '../middleware.js';
import { User } from '../models/User.js';
import { LoginLog } from '../models/Common.js';
import { toObjectId } from '../utils/objectId.js';

const router = Router();


// Get user's IP restrictions
router.get('/users/:userId/ip-restrictions', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { userId } = req.params;
    const isAdmin = req.user.role === 'admin';

    if (!isAdmin && req.user.id !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const userObjectId = toObjectId(userId);
    if (!userObjectId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const user = await User.findById(userObjectId)
      .select('email full_name restrict_by_ip allowed_ips ip_last_login ip_login_history');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      userId: user._id.toString(),
      email: user.email,
      full_name: user.full_name,
      restrict_by_ip: user.restrict_by_ip,
      allowed_ips: user.allowed_ips ? user.allowed_ips.split(',').map((ip: string) => ip.trim()) : [],
      ip_last_login: user.ip_last_login,
      ip_login_history: user.ip_login_history || [],
    });
  } catch (error: any) {
    console.error('Error fetching IP restrictions:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch IP restrictions' });
  }
});

// Update user's IP restrictions (Admin only)
router.post('/users/:userId/ip-restrictions', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const isAdmin = req.user.role === 'admin';

    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can update IP restrictions' });
    }

    const { userId } = req.params;
    const { restrict_by_ip, allowed_ips } = req.body;

    if (typeof restrict_by_ip !== 'boolean' || !Array.isArray(allowed_ips)) {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    // Validate IP addresses / CIDRs
    const ipv4OrCidr = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
    const ipv6 = /^[0-9a-fA-F:]+$/;
    for (const ip of allowed_ips) {
      const t = String(ip).trim();
      const ok = t === 'localhost' || ipv4OrCidr.test(t) || ipv6.test(t);
      if (!ok) {
        return res.status(400).json({ error: `Invalid IP address: ${ip}` });
      }
    }

    const ipsString = allowed_ips.join(', ');

    const userObjectId = toObjectId(userId);
    if (!userObjectId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const user = await User.findByIdAndUpdate(
      userObjectId,
      {
        restrict_by_ip,
        allowed_ips: ipsString,
        updated_at: new Date()
      },
      { new: true }
    ).select('email full_name restrict_by_ip allowed_ips');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'IP restrictions updated successfully',
      user: {
        id: user._id.toString(),
        email: user.email,
        full_name: user.full_name,
        restrict_by_ip: user.restrict_by_ip,
        allowed_ips: user.allowed_ips ? user.allowed_ips.split(',').map((ip: string) => ip.trim()) : [],
      },
    });
  } catch (error: any) {
    console.error('Error updating IP restrictions:', error);
    res.status(500).json({ error: error.message || 'Failed to update IP restrictions' });
  }
});

// Enable WFH access (temporary IP allowance)
router.post('/users/:userId/enable-wfh', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const isAdmin = req.user.role === 'admin';

    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can enable WFH access' });
    }

    const { userId } = req.params;
    const { additional_ips } = req.body;

    if (!Array.isArray(additional_ips)) {
      return res.status(400).json({ error: 'additional_ips must be an array' });
    }

    const userObjectId = toObjectId(userId);
    if (!userObjectId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const user = await User.findById(userObjectId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const currentIPs = user.allowed_ips
      ? user.allowed_ips.split(',').map((ip: string) => ip.trim())
      : [];

    // Merge IPs and remove duplicates
    const allIPs = [...new Set([...currentIPs, ...additional_ips])];
    const ipsString = allIPs.join(', ');

    user.allowed_ips = ipsString;
    user.restrict_by_ip = true;
    user.updated_at = new Date();
    await user.save();

    res.json({
      message: 'WFH access enabled',
      user: {
        id: user._id.toString(),
        email: user.email,
        full_name: user.full_name,
        allowed_ips: ipsString.split(',').map((ip: string) => ip.trim()),
      },
    });
  } catch (error: any) {
    console.error('Error enabling WFH access:', error);
    res.status(500).json({ error: error.message || 'Failed to enable WFH access' });
  }
});

// Get login history for a user (Admin only)
router.get('/users/:userId/login-history', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const isAdmin = req.user.role === 'admin';

    if (!isAdmin && req.user.id !== req.params.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { userId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);

    const userObjectId = toObjectId(userId);
    if (!userObjectId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const logs = await LoginLog.find({ user_id: userObjectId })
      .sort({ login_time: -1 })
      .limit(limit)
      .lean();

    const formattedLogs = logs.map(log => ({
      id: log._id.toString(),
      user_id: log.user_id?.toString(),
      login_time: log.login_time,
      success: log.success,
      ip_address: log.ip_address,
      user_agent: log.user_agent
    }));

    res.json({
      total: formattedLogs.length,
      logs: formattedLogs,
    });
  } catch (error: any) {
    console.error('Error fetching login history:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch login history' });
  }
});

export default router;
