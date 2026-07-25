import { Router } from 'express';
import type { Response } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateUser, findUserById, comparePassword, hashPassword, validatePassword } from '../auth.js';
import { authMiddleware } from '../middleware.js';
import type { AuthRequest } from '../middleware.js';
import { User } from '../models/User.js';

const router = Router();

// Limit password-change attempts to blunt guessing of the current password.
const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limiting for login to prevent brute force attacks
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 login attempts per 15 minutes
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful logins
});

// Login endpoint
router.post('/login', loginLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Get client IP address
    const clientIP = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.socket.remoteAddress?.replace(/^::ffff:/, '') ||
      req.ip ||
      'unknown';

    try {
      const { user, token } = await authenticateUser(email, password, clientIP);

      // Ensure we return valid JSON with proper user data
      const responseData = {
        token,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name || '',
          avatar_url: user.avatar_url || null,
          role: user.role || 'member',
          is_active: user.is_active !== false,
        },
      };

      res.json(responseData);
    } catch (authError: any) {
      // Specific authentication errors
      return res.status(401).json({
        error: authError.message || 'Authentication failed',
        code: 'AUTH_FAILED'
      });
    }
  } catch (error: any) {
    console.error('Login endpoint error:', error);
    res.status(500).json({
      error: 'Internal server error',
      code: 'SERVER_ERROR'
    });
  }
});

// Get current user endpoint
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await findUserById(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user._id.toString(),
      email: user.email,
      full_name: user.full_name,
      avatar_url: user.avatar_url,
      role: user.role,
      is_active: user.is_active,
      created_at: user.created_at,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch user' });
  }
});

// Change own password (authenticated). Verifies the current password, enforces
// the password policy, and stores a new bcrypt hash.
router.post('/change-password', authMiddleware, changePasswordLimiter, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const currentPassword = String(req.body?.current_password ?? '');
    const newPassword = String(req.body?.new_password ?? '');
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.password_hash) {
      return res.status(400).json({ error: 'No password is set for this account. Contact an administrator.' });
    }

    const currentOk = await comparePassword(currentPassword, user.password_hash);
    if (!currentOk) return res.status(401).json({ error: 'Current password is incorrect' });

    const validation = validatePassword(newPassword);
    if (!validation.isValid) return res.status(400).json({ error: validation.errors.join(' ') });

    const sameAsOld = await comparePassword(newPassword, user.password_hash);
    if (sameAsOld) {
      return res.status(400).json({ error: 'New password must be different from your current password' });
    }

    user.password_hash = await hashPassword(newPassword);
    (user as any).updated_at = new Date();
    await user.save();

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error: any) {
    console.error('Change password error:', error);
    res.status(500).json({ error: error.message || 'Failed to change password' });
  }
});

// Verify token endpoint
router.post('/verify', authMiddleware, async (req: AuthRequest, res: Response) => {
  res.json({
    valid: true,
    user: req.user,
  });
});

// Logout endpoint (for client-side token cleanup)
router.post('/logout', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user) {
      // Optionally log the logout
      // await query('UPDATE login_logs SET logout_time = NOW() WHERE user_id = $1 AND logout_time IS NULL', [req.user.id]);
    }
    res.json({ message: 'Logout successful' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Logout failed' });
  }
});

export default router;
