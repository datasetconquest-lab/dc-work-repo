import { Router } from 'express';
import type { Response } from 'express';
import { authMiddleware, adminMiddleware } from '../middleware.js';
import type { AuthRequest } from '../middleware.js';
import { User } from '../models/User.js';
import { toObjectId } from '../utils/objectId.js';
import { hashPassword, validatePassword } from '../auth.js';

const router = Router();


// Create new profile (admin only)
router.post('/', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { email, password, full_name, employee_id, role } = req.body;

    if (!email || !password || !full_name) {
      return res.status(400).json({ error: 'Email, password, and full name are required' });
    }

    const validation = validatePassword(password);
    if (!validation.isValid) {
      return res.status(400).json({ error: validation.errors.join(' ') });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'A user with this email already exists' });
    }

    const hashedPassword = await hashPassword(password);
    const validRoles = ['admin', 'member', 'team_lead'];
    const assignedRole = validRoles.includes(role) ? role : 'member';

    const newUser = new User({
      email: email.toLowerCase(),
      password_hash: hashedPassword,
      full_name,
      employee_id: employee_id || null,
      role: assignedRole,
      is_active: true
    });

    await newUser.save();

    res.status(201).json({
      id: newUser._id.toString(),
      email: newUser.email,
      full_name: newUser.full_name,
      employee_id: (newUser as any).employee_id,
      role: newUser.role,
      is_active: newUser.is_active,
      created_at: newUser.created_at
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to create user' });
  }
});

// Get all profiles (admin only)
router.get('/', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const users = await User.find({})
      .select('email full_name employee_id avatar_url role is_active restrict_by_ip allowed_ips ip_last_login late_permission_dates created_at updated_at')
      .sort({ created_at: -1 });

    const formattedUsers = users.map(user => ({
      id: user._id.toString(),
      email: user.email,
      full_name: user.full_name,
      employee_id: (user as any).employee_id,
      avatar_url: user.avatar_url,
      role: user.role,
      is_active: user.is_active,
      restrict_by_ip: (user as any).restrict_by_ip,
      allowed_ips: (user as any).allowed_ips,
      ip_last_login: (user as any).ip_last_login,
      late_permission_dates: (user as any).late_permission_dates || [],
      created_at: user.created_at,
      updated_at: user.updated_at
    }));

    res.json(formattedUsers);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch profiles' });
  }
});

// Get active profiles (basic fields) - available to any authenticated user
router.get('/active', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const users = await User.find({ is_active: true })
      .select('email full_name avatar_url role is_active')
      .sort({ full_name: 1, email: 1 });

    const formattedUsers = users.map(user => ({
      id: user._id.toString(),
      email: user.email,
      full_name: user.full_name,
      avatar_url: user.avatar_url,
      role: user.role,
      is_active: user.is_active
    }));

    res.json(formattedUsers);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch users' });
  }
});

// Get team members for the current team lead (or admin)
router.get('/team', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const leadObjectId = toObjectId(req.user.id);
    if (!leadObjectId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    // Team members are users whose team_lead_id matches the current user
    const users = await User.find({ is_active: true, team_lead_id: leadObjectId })
      .select('email full_name avatar_url role is_active team_lead_id')
      .sort({ full_name: 1, email: 1 });

    const formattedUsers = users.map(user => ({
      id: user._id.toString(),
      email: user.email,
      full_name: user.full_name,
      avatar_url: user.avatar_url,
      role: user.role,
      is_active: user.is_active
    }));

    res.json(formattedUsers);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch team members' });
  }
});

// Get profile by ID
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Users can only view their own profile, unless they're admin
    if (req.user?.id !== id && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const objectId = toObjectId(id);
    if (!objectId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const user = await User.findById(objectId)
      .select('email full_name employee_id avatar_url role is_active created_at updated_at');

    if (!user) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json({
      id: user._id.toString(),
      email: user.email,
      full_name: user.full_name,
      employee_id: (user as any).employee_id,
      avatar_url: user.avatar_url,
      role: user.role,
      is_active: user.is_active,
      created_at: user.created_at,
      updated_at: user.updated_at
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch profile' });
  }
});

// Update profile
router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Users can only update their own profile, unless they're admin
    if (req.user?.id !== id && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const objectId = toObjectId(id);
    if (!objectId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const updateData: any = { updated_at: new Date() };
    const { full_name, avatar_url, employee_id, is_active, restrict_by_ip, allowed_ips, late_permission_dates } = req.body;

    if (full_name !== undefined) updateData.full_name = full_name;
    if (avatar_url !== undefined) updateData.avatar_url = avatar_url;
    if (employee_id !== undefined && req.user?.role === 'admin') {
      const clean = typeof employee_id === 'string' ? employee_id.trim() : employee_id;
      if (!clean) {
        updateData.$unset = { ...(updateData.$unset || {}), employee_id: 1 };
      } else {
        updateData.employee_id = clean;
      }
    }
    if (is_active !== undefined && req.user?.role === 'admin') updateData.is_active = is_active;
    if (restrict_by_ip !== undefined && req.user?.role === 'admin') updateData.restrict_by_ip = restrict_by_ip;
    if (allowed_ips !== undefined && req.user?.role === 'admin') updateData.allowed_ips = allowed_ips;
    if (late_permission_dates !== undefined && req.user?.role === 'admin') {
      if (!Array.isArray(late_permission_dates)) {
        return res.status(400).json({ error: 'late_permission_dates must be an array of YYYY-MM-DD strings' });
      }
      const dateRe = /^\d{4}-\d{2}-\d{2}$/;
      const cleaned = Array.from(new Set(
        late_permission_dates
          .map((d: unknown) => (typeof d === 'string' ? d.trim() : ''))
          .filter((d: string) => dateRe.test(d))
      )).sort();
      updateData.late_permission_dates = cleaned;
    }

    if (Object.keys(updateData).length === 1) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const user = await User.findByIdAndUpdate(objectId, updateData, { new: true })
      .select('email full_name employee_id avatar_url role is_active late_permission_dates created_at updated_at');

    if (!user) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json({
      id: user._id.toString(),
      email: user.email,
      full_name: user.full_name,
      employee_id: (user as any).employee_id,
      avatar_url: user.avatar_url,
      role: user.role,
      is_active: user.is_active,
      late_permission_dates: (user as any).late_permission_dates || [],
      created_at: user.created_at,
      updated_at: user.updated_at
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update profile' });
  }
});

// Delete profile (admin only)
router.delete('/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const objectId = toObjectId(id);
    if (!objectId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const user = await User.findByIdAndDelete(objectId)
      .select('email full_name');

    if (!user) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json({
      message: 'Profile deleted successfully',
      profile: {
        id: user._id.toString(),
        email: user.email,
        full_name: user.full_name
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete profile' });
  }
});

export default router;
