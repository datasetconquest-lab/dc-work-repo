import type { Request, Response, NextFunction } from 'express';
import { verifyToken, isIpAllowed, isGloballyAllowedIp, findUserById, checkDesktopOfficeAccess } from './auth.js';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    if (!decoded) {
      return res.status(401).json({ error: 'Session expired or invalid token. Please login again.' });
    }

    // STRICT SECURITY CHECK: Fetch user from DB for every sensitive request
    const user = await findUserById(decoded.id);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (user.is_active === false) {
      return res.status(401).json({ error: 'Your account has been deactivated. Contact administrator.' });
    }

    // IP Validation
    if (user.restrict_by_ip !== false) {
      const forwarded = req.headers['x-forwarded-for'] as string;
      const realIp = req.headers['x-real-ip'] as string;
      let clientIP = forwarded ? forwarded.split(',')[0].trim() : (realIp || req.ip || req.socket.remoteAddress || 'unknown');

      clientIP = clientIP.replace(/^::ffff:/, '');

      const allowedIPs = user.allowed_ips
        ? user.allowed_ips.split(',').map((ip: string) => ip.trim()).filter((ip: string) => ip.length > 0)
        : [];

      // DEBUG: Log IP check details
      const isAuthMe = req.originalUrl.includes('/auth/me') || req.originalUrl.includes('/auth/verify');
      const isOwnProfile = req.originalUrl.includes(`/profiles/${user._id.toString()}`);
      const isAdminSafety = user.role === 'admin' && (req.originalUrl.includes('/profiles') || req.originalUrl.includes('/admin'));

      const isExempted = isAuthMe || isOwnProfile || isAdminSafety;

      // Desktop exe: requests arrive via loopback — enforce the office network
      // using the machine's PUBLIC IP (mirrors the website's per-request check).
      if (!isExempted) {
        const desktopDenial = await checkDesktopOfficeAccess(clientIP);
        if (desktopDenial) {
          console.warn(`[SECURITY] Desktop request blocked (outside office) for ${user.email} on ${req.method} ${req.originalUrl}`);
          return res.status(403).json({
            error: `Access Denied: ${desktopDenial}`,
            code: 'IP_BLOCKED',
            detectedIp: clientIP
          });
        }
      }

      if (allowedIPs.length > 0 && !isExempted) {
        const ipAllowed = isGloballyAllowedIp(clientIP)
          || allowedIPs.some((allowedIP: string) => isIpAllowed(clientIP, allowedIP));

        if (!ipAllowed) {
          console.warn(`[SECURITY] Blocked request from ${clientIP} for user ${user.email} on ${req.method} ${req.originalUrl}. Allowed: ${user.allowed_ips}`);
          return res.status(403).json({
            error: `Access Denied: Your IP (${clientIP}) is not authorized. This site is restricted to the office network.`,
            code: 'IP_BLOCKED',
            detectedIp: clientIP
          });
        }
      }

      // Log successful (or exempted) request IP for monitoring during fixes
      if (!isExempted) {
        console.log(`[AUTH] Allowed ${req.method} ${req.originalUrl} for ${user.email} from ${clientIP}`);
      }
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    next();
  } catch (error: any) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Security validation failed' });
  }
}

export function adminMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }

  next();
}
