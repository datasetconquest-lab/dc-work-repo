import { Router } from 'express';
import type { Response } from 'express';
import { authMiddleware, adminMiddleware } from '../middleware.js';
import type { AuthRequest } from '../middleware.js';
import { User } from '../models/User.js';
import { LoginLog } from '../models/Common.js';
import { ServerIpConfig } from '../models/ServerIpConfig.js';
import { refreshDynamicServerIps, getDynamicServerIps } from '../auth.js';
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

    // Validate IP addresses / CIDRs / Wildcards (e.g. 223.185.*, 223.185.0.0/16)
    const ipv4OrCidrOrWildcard = /^(\d{1,3}|\*)(\.(\d{1,3}|\*)){0,3}(\/\d{1,2})?$/;
    const ipv6 = /^[0-9a-fA-F:]+$/;
    for (const ip of allowed_ips) {
      const t = String(ip).trim();
      const ok = t === 'localhost' || ipv4OrCidrOrWildcard.test(t) || ipv6.test(t);
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

// Get server-wide allocated IPs (Admin only)
router.get('/server-ips', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const dynamicIps = await ServerIpConfig.find({}).sort({ created_at: -1 }).lean();
    const envIps = (process.env.GLOBAL_ALLOWED_IPS || '223.185.0.0/16,127.0.0.1,::1,localhost')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    res.json({
      required_prefix: process.env.REQUIRED_IP_PREFIX || '223.185.',
      env_ips: envIps,
      allocated_ips: dynamicIps.map((d: any) => ({
        id: d._id.toString(),
        ip: d.ip,
        label: d.label || '',
        created_at: d.created_at
      }))
    });
  } catch (error: any) {
    console.error('Error fetching server IPs:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch server IPs' });
  }
});

// Allocate server-wide IP (Admin only)
router.post('/server-ips', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { ip, label } = req.body;
    if (!ip || typeof ip !== 'string') {
      return res.status(400).json({ error: 'Valid IP is required' });
    }

    const cleanIp = ip.trim();
    const ipv4OrCidrOrWildcard = /^(\d{1,3}|\*)(\.(\d{1,3}|\*)){0,3}(\/\d{1,2})?$/;
    const ipv6 = /^[0-9a-fA-F:]+$/;
    const ok = cleanIp === 'localhost' || ipv4OrCidrOrWildcard.test(cleanIp) || ipv6.test(cleanIp);
    if (!ok) {
      return res.status(400).json({ error: `Invalid IP address format: ${cleanIp}` });
    }

    const existing = await ServerIpConfig.findOne({ ip: cleanIp });
    if (existing) {
      return res.status(400).json({ error: 'This IP is already allocated to the server' });
    }

    const newConfig = new ServerIpConfig({
      ip: cleanIp,
      label: typeof label === 'string' ? label.trim() : '',
      added_by: toObjectId(req.user!.id)
    });
    await newConfig.save();

    // Refresh memory cache
    const allRecords = await ServerIpConfig.find({}).lean();
    refreshDynamicServerIps(allRecords.map((r: any) => r.ip.trim()));

    res.status(201).json({
      message: 'Server IP allocated successfully',
      allocated: {
        id: newConfig._id.toString(),
        ip: newConfig.ip,
        label: newConfig.label,
        created_at: newConfig.created_at
      }
    });
  } catch (error: any) {
    console.error('Error allocating server IP:', error);
    res.status(500).json({ error: error.message || 'Failed to allocate server IP' });
  }
});

// Remove allocated server-wide IP (Admin only)
router.delete('/server-ips/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const objectId = toObjectId(id);
    if (!objectId) return res.status(400).json({ error: 'Invalid ID' });

    await ServerIpConfig.findByIdAndDelete(objectId);

    // Refresh memory cache
    const allRecords = await ServerIpConfig.find({}).lean();
    refreshDynamicServerIps(allRecords.map((r: any) => r.ip.trim()));

    res.json({ success: true, message: 'Server IP allocation removed' });
  } catch (error: any) {
    console.error('Error removing server IP:', error);
    res.status(500).json({ error: error.message || 'Failed to remove server IP' });
  }
});

export default router;
