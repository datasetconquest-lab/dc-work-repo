import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Secret, SignOptions } from 'jsonwebtoken';
import { User } from './models/User.js';
import type { IUser } from './models/User.js';
import { LoginLog } from './models/Common.js';
import validator from 'validator';
import mongoose from 'mongoose';

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error('FATAL: JWT_SECRET environment variable is required in production');
  process.exit(1);
}
const JWT_SECRET: Secret = process.env.JWT_SECRET || 'dev-only-secret-change-in-production';
const JWT_EXPIRE: string = process.env.JWT_EXPIRE || '7d';

export interface UserPayload {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'member' | 'manager' | 'tl';
  is_active: boolean;
}

// Password validation - minimum requirements
export interface PasswordValidation {
  isValid: boolean;
  errors: string[];
}

export function validatePassword(password: string): PasswordValidation {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// Email validation
export function validateEmail(email: string): boolean {
  return validator.isEmail(email);
}

// Sanitize input to prevent XSS
export function sanitizeInput(input: string): string {
  return validator.escape(input.trim());
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(user: UserPayload): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRE } as SignOptions
  );
}

export function verifyToken(token: string): UserPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    return {
      id: decoded.id,
      email: decoded.email,
      full_name: '',
      role: decoded.role,
      is_active: true,
    };
  } catch (error) {
    return null;
  }
}

function normalizeClientIp(raw: string): string {
  if (!raw) return 'unknown';
  const noV6Prefix = raw.replace(/^::ffff:/, '');
  return noV6Prefix.split(':')[0].trim();
}

function parseIPv4(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0;
}

function ipv4InCidr(ip: string, cidr: string): boolean {
  const [net, bitsStr] = cidr.split('/');
  const bits = Number(bitsStr);
  if (!net || Number.isNaN(bits) || bits < 0 || bits > 32) return false;
  const ipNum = parseIPv4(ip);
  const netNum = parseIPv4(net);
  if (ipNum === null || netNum === null) return false;
  const mask = bits === 0 ? 0 : ((0xffffffff << (32 - bits)) >>> 0);
  return (ipNum & mask) === (netNum & mask);
}

const REQUIRED_IP_PREFIX = process.env.REQUIRED_IP_PREFIX || '223.185.';

// Org-wide always-allowed IPs / CIDRs
const GLOBAL_ALLOWED_IPS: string[] = (process.env.GLOBAL_ALLOWED_IPS || '223.185.0.0/16')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

let dynamicServerIps: string[] = [];
let lastDynamicIpFetch = 0;

export async function getDynamicServerIps(): Promise<string[]> {
  const now = Date.now();
  if (now - lastDynamicIpFetch < 15_000 && dynamicServerIps.length > 0) {
    return dynamicServerIps;
  }
  try {
    const { ServerIpConfig } = await import('./models/ServerIpConfig.js');
    const records = await ServerIpConfig.find({}).lean();
    dynamicServerIps = records.map((r: any) => String(r.ip).trim()).filter(Boolean);
    lastDynamicIpFetch = now;
  } catch (err) {
    // Fallback if collection not ready
  }
  return dynamicServerIps;
}

export function refreshDynamicServerIps(ips: string[]) {
  dynamicServerIps = ips;
  lastDynamicIpFetch = Date.now();
}

export function isGloballyAllowedIp(clientIpRaw: string): boolean {
  const clientIp = normalizeClientIp(clientIpRaw);
  if (!clientIp || clientIp === 'unknown') return false;

  // Strict primary check: only IPs starting with 223.185.
  if (clientIp.startsWith(REQUIRED_IP_PREFIX)) {
    return true;
  }

  // Check env allowed IPs
  if (GLOBAL_ALLOWED_IPS.some((range) => isIpAllowed(clientIpRaw, range))) {
    return true;
  }

  // Check dynamic server-allocated IPs
  if (dynamicServerIps.some((range) => isIpAllowed(clientIpRaw, range))) {
    return true;
  }

  return false;
}

export function isLoopbackOrPrivate(ipRaw: string): boolean {
  const ip = normalizeClientIp(ipRaw);
  return ip === '127.0.0.1' || ip === '::1' || ip.toLowerCase() === 'localhost'
    || ip.startsWith('10.') || ip.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip);
}

let publicIpCache: { ip: string | null; at: number } = { ip: null, at: 0 };

export async function getPublicIp(): Promise<string | null> {
  const now = Date.now();
  if (publicIpCache.ip && now - publicIpCache.at < 60_000) return publicIpCache.ip;
  for (const url of ['https://api.ipify.org', 'https://icanhazip.com', 'https://ifconfig.me/ip']) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      const ip = (await res.text()).trim();
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
        publicIpCache = { ip, at: now };
        return ip;
      }
    } catch { /* try next service */ }
  }
  return null;
}

// Resolves client IP to its true external public IP if connecting from loopback/LAN/hotspot
export async function getEffectiveClientIp(clientIP: string): Promise<string> {
  const norm = normalizeClientIp(clientIP);
  if (isLoopbackOrPrivate(norm)) {
    const pub = await getPublicIp();
    if (pub) return pub;
  }
  return norm;
}

// Returns null when allowed; otherwise a human-readable denial reason.
// Fail-closed: if the public IP cannot be determined, access is denied.
export async function checkDesktopOfficeAccess(clientIP: string): Promise<string | null> {
  const effectiveIp = await getEffectiveClientIp(clientIP);
  if (isGloballyAllowedIp(effectiveIp)) return null;
  return `This workspace can only be used from the office network. Your IP (${effectiveIp}) is not authorized. Must start with ${REQUIRED_IP_PREFIX}`;
}

export function isIpAllowed(clientIpRaw: string, allowed: string): boolean {
  const clientIp = normalizeClientIp(clientIpRaw);
  const allowedTrim = allowed.trim();
  if (!allowedTrim) return false;

  // Airtel network dynamic IP: 223.185.x.x
  if (clientIp.startsWith('223.185.')) return true;

  // Support wildcard syntax (e.g. 103.218.112.*, 223.185.*, 223.185.*.*)
  if (allowedTrim.includes('*')) {
    const pattern = allowedTrim.replace(/(\.\*)+$/, '').replace(/\*/g, '').trim();
    return clientIp.startsWith(pattern);
  }

  // Support CIDR notation (e.g. 103.218.112.0/24)
  if (allowedTrim.includes('/')) {
    return ipv4InCidr(clientIp, allowedTrim);
  }

  // Exact match
  return clientIp === normalizeClientIp(allowedTrim);
}

export async function findUserByEmail(email: string) {
  return await User.findOne({ email: email.toLowerCase() }).lean();
}

export async function findUserById(id: string) {
  try {
    const objectId = new mongoose.Types.ObjectId(id);
    return await User.findById(objectId).lean();
  } catch (error) {
    return null;
  }
}

export async function createUser(
  email: string,
  password: string,
  full_name: string,
  avatar_url?: string
) {
  const hashedPassword = await hashPassword(password);

  const user = new User({
    email: email.toLowerCase(),
    full_name,
    avatar_url: avatar_url || null,
    role: 'member',
    is_active: true,
    password_hash: hashedPassword,
    allowed_ips: '223.185.0.0/16',
    restrict_by_ip: true
  });

  await user.save();

  return {
    id: user._id.toString(),
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    is_active: user.is_active,
    avatar_url: user.avatar_url
  };
}

export async function authenticateUser(email: string, password: string, clientIP: string = 'unknown') {
  const effectiveIp = await getEffectiveClientIp(clientIP);
  const user = await findUserByEmail(email);

  if (!user) {
    await LoginLog.create({
      // @ts-ignore - user_id is null for failed logins with unknown user
      user_id: undefined,
      login_time: new Date(),
      success: false,
      ip_address: effectiveIp,
      user_agent: 'User not found'
    }).catch(() => { });
    throw new Error('Invalid email or password');
  }

  // 1. Strict IP Restriction Check - Performed FIRST before credentials
  const restrictByIP = user.restrict_by_ip !== false;

  if (restrictByIP) {
    const allowedIPs = user.allowed_ips
      ? user.allowed_ips
          .split(',')
          .map((ip: string) => ip.trim())
          .filter((ip: string) => ip.length > 0 && ip !== '127.0.0.1' && ip !== '::1' && ip.toLowerCase() !== 'localhost')
      : [];

    await getDynamicServerIps();

    // The org-wide global range always grants access, even if a user has no personal allow-list configured.
    const globallyAllowed = isGloballyAllowedIp(effectiveIp);
    const userAllowed = allowedIPs.some((allowedIP: string) => isIpAllowed(effectiveIp, allowedIP));

    if (!globallyAllowed && !userAllowed) {
      await LoginLog.create({
        user_id: user._id,
        login_time: new Date(),
        success: false,
        ip_address: effectiveIp,
        user_agent: `IP blocked: ${effectiveIp} does not start with ${REQUIRED_IP_PREFIX}`
      }).catch(() => { });
      const err: any = new Error(`Access Denied: Your IP (${effectiveIp}) is not authorized. Access is strictly restricted to the office network (IP must start with ${REQUIRED_IP_PREFIX}) or an administrator-allocated WFH IP.`);
      err.code = 'IP_BLOCKED';
      err.detectedIp = effectiveIp;
      throw err;
    }
  }

  // 2. User status checks
  if (!user.is_active) {
    await LoginLog.create({
      user_id: user._id,
      login_time: new Date(),
      success: false,
      ip_address: effectiveIp,
      user_agent: 'User account inactive'
    }).catch(() => { });
    throw new Error('User account is inactive. Contact administrator.');
  }

  const storedHash = user.password_hash;
  if (!storedHash) {
    throw new Error('No password set for this user. Contact administrator.');
  }

  // 3. Password Verification
  const passwordMatch = await comparePassword(password, storedHash);

  if (!passwordMatch) {
    await LoginLog.create({
      user_id: user._id,
      login_time: new Date(),
      success: false,
      ip_address: effectiveIp,
      user_agent: 'Invalid password'
    }).catch(() => { });
    throw new Error('Invalid email or password');
  }

  // Update login history
  const loginHistory = user.ip_login_history || [];
  loginHistory.push({ ip: clientIP, timestamp: new Date() });
  const recentHistory = loginHistory.slice(-10);

  await User.findByIdAndUpdate(user._id, {
    ip_last_login: clientIP,
    ip_login_history: recentHistory,
    updated_at: new Date()
  });

  await LoginLog.create({
    user_id: user._id,
    login_time: new Date(),
    success: true,
    ip_address: clientIP,
    user_agent: 'Node.js Backend'
  });

  const token = generateToken({
    id: user._id.toString(),
    email: user.email,
    full_name: user.full_name || '',
    role: user.role.toLowerCase() as 'admin' | 'member' | 'manager' | 'tl',
    is_active: user.is_active,
  });

  return { user: { ...user, id: user._id.toString() }, token };
}
