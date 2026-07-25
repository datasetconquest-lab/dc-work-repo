import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { connectDB } from './db.js';
import { verifyToken } from './auth.js';
import { startAttendanceScheduler } from './attendanceScheduler.js';
import { startMessageFileCleanupScheduler } from './services/messageFileCleanup.js';

console.log('[Server] Starting up...');

dotenv.config();

// Environment validation (warn in development, fail in production)
const isProduction = process.env.NODE_ENV === 'production';
const requiredEnvVars = ['MONGODB_URI'];
const recommendedEnvVars = ['JWT_SECRET'];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.warn(`⚠️ Warning: ${envVar} not set, using default local MongoDB`);
  }
}

for (const envVar of recommendedEnvVars) {
  if (!process.env[envVar] || process.env[envVar] === 'your-secret-key') {
    console.warn(`⚠️ Warning: ${envVar} should be set to a secure value in production`);
  }
}

const app = express();
// Trust proxy is required for Render/Netlify to get the real client IP for rate limiting and IP restrictions
app.set('trust proxy', 1);
const httpServer = createServer(app);
const PORT = parseInt(process.env.PORT || '3001', 10);

// Security middleware - Helmet with configuration suitable for local network
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for local development
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// Rate limiting - protect against brute force attacks
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 login attempts per windowMs
  message: { error: 'Too many login attempts, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(generalLimiter);

// Support comma-separated CORS origins
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// CORS configuration
const corsConfig = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin) return callback(null, true);

    if (origin.includes('localhost') ||
      origin.match(/192\.168\.\d+\.\d+/) ||
      origin.match(/10\.\d+\.\d+\.\d+/) ||
      origin.match(/172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+/)) {
      return callback(null, true);
    }

    // Normalize origin by removing trailing slash for comparison
    const normalizedOrigin = origin.endsWith('/') ? origin.slice(0, -1) : origin;
    const isAllowed = corsOrigins.some(o => {
      const normalizedAllowed = o.endsWith('/') ? o.slice(0, -1) : o;
      return normalizedAllowed === normalizedOrigin;
    });

    if (isAllowed) {
      return callback(null, true);
    }

    console.error(`[CORS Blocked] Origin: "${origin}" not in allowed list:`, corsOrigins);
    callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
};

app.use(cors(corsConfig));
// Increase JSON/urlencoded body limit to align with larger file uploads
app.use(express.json({ strict: true, limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Socket.IO setup with CORS
const io = new SocketIOServer(httpServer, {
  path: '/socket.io',
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (origin.includes('localhost') ||
        origin.match(/192\.168\.\d+\.\d+/) ||
        origin.match(/10\.\d+\.\d+\.\d+/) ||
        origin.match(/172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+/)) {
        return callback(null, true);
      }

      const normalizedOrigin = origin.endsWith('/') ? origin.slice(0, -1) : origin;
      const isAllowed = corsOrigins.some(o => {
        const normalizedAllowed = o.endsWith('/') ? o.slice(0, -1) : o;
        return normalizedAllowed === normalizedOrigin;
      });

      if (isAllowed) return callback(null, true);
      callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// Store connected users: userId -> Set of socket IDs
const connectedUsers = new Map<string, Set<string>>();

// Socket.IO authentication and connection handling
io.on('connection', (socket) => {
  console.log('[Socket.IO] New connection:', socket.id);

  // Authenticate user
  socket.on('authenticate', (token: string) => {
    try {
      const user = verifyToken(token);
      if (user) {
        (socket as any).userId = user.id;

        // Track this socket for the user
        if (!connectedUsers.has(user.id)) {
          connectedUsers.set(user.id, new Set());
          // Broadcast user came online (only for first connection)
          io.emit('user_status', { userId: user.id, status: 'online' });
        }
        connectedUsers.get(user.id)!.add(socket.id);

        // Join a room with the user's ID for easy targeting
        socket.join(`user:${user.id}`);

        console.log(`[Socket.IO] User ${user.id} authenticated (socket: ${socket.id})`);
        socket.emit('authenticated', { userId: user.id });
      } else {
        socket.emit('auth_error', { error: 'Invalid token' });
      }
    } catch (e) {
      socket.emit('auth_error', { error: 'Authentication failed' });
    }
  });

  socket.on('disconnect', () => {
    const userId = (socket as any).userId;
    if (userId && connectedUsers.has(userId)) {
      connectedUsers.get(userId)!.delete(socket.id);
      if (connectedUsers.get(userId)!.size === 0) {
        connectedUsers.delete(userId);
        // Broadcast user went offline
        io.emit('user_status', { userId, status: 'offline' });
      }
    }
    console.log('[Socket.IO] Disconnected:', socket.id);
  });

  // Typing indicator - notify when user is typing
  socket.on('typing', (data: { recipientId?: string; groupId?: string; isTyping: boolean }) => {
    const userId = (socket as any).userId;
    if (!userId) return;

    if (data.recipientId) {
      // Direct message typing
      io.to(`user:${data.recipientId}`).emit('user_typing', {
        userId,
        isTyping: data.isTyping,
        type: 'direct'
      });
    } else if (data.groupId) {
      // Group message typing - broadcast to all members
      io.emit('user_typing', {
        userId,
        groupId: data.groupId,
        isTyping: data.isTyping,
        type: 'group'
      });
    }
  });

  // Request online users list
  socket.on('get_online_users', () => {
    const onlineUsers = Array.from(connectedUsers.keys());
    socket.emit('online_users', onlineUsers);
  });
});

// Export io for use in routes
export { io, connectedUsers };

// Helper function to send notification to a user
export function sendNotificationToUser(userId: string, notification: {
  type: string;
  title: string;
  message: string;
  timestamp?: string;
}) {
  notification.timestamp = notification.timestamp || new Date().toISOString();
  io.to(`user:${userId}`).emit('notification', notification);
  console.log(`[Socket.IO] Sent notification to user ${userId}:`, notification.title);
}

// Helper function to broadcast to all connected users
export function broadcastNotification(notification: {
  type: string;
  title: string;
  message: string;
  timestamp?: string;
}, excludeUserId?: string) {
  notification.timestamp = notification.timestamp || new Date().toISOString();

  for (const [userId] of connectedUsers) {
    if (userId !== excludeUserId) {
      io.to(`user:${userId}`).emit('notification', notification);
    }
  }
  console.log('[Socket.IO] Broadcast notification:', notification.title);
}

// Helper function to check if a user is online
export function isUserOnline(userId: string): boolean {
  return connectedUsers.has(userId);
}

// Helper function to get all online user IDs
export function getOnlineUsers(): string[] {
  return Array.from(connectedUsers.keys());
}

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString(), connectedUsers: connectedUsers.size });
});

// Initialize routes
async function initializeRoutes() {
  try {
    const authModule = await import('./routes/auth.js');
    const profileModule = await import('./routes/profiles.js');
    const attendanceModule = await import('./routes/attendance.js');
    const ipManagementModule = await import('./routes/ip-management.js');
    const queryModule = await import('./routes/query.js');
    const dmModule = await import('./routes/direct-messages.js');
    const calendarModule = await import('./routes/calendar.js');
    const mailModule = await import('./routes/mail.js');
    const uploadModule = await import('./routes/upload.js');
    const tasksModule = await import('./routes/tasks.js');
    const reactionsModule = await import('./routes/reactions.js');
    const notificationsModule = await import('./routes/notifications.js');
    const dataModule = await import('./routes/data.js');
    const todosModule = await import('./routes/todos.js');

    app.use('/api/auth', authModule.default);
    app.use('/api/profiles', profileModule.default);
    app.use('/api/attendance', attendanceModule.default);
    app.use('/api/admin', ipManagementModule.default);
    app.use('/api/query', queryModule.default);
    app.use('/api/messages', dmModule.default);
    app.use('/api/calendar', calendarModule.default);
    app.use('/api/admin/mail', mailModule.default);
    app.use('/api/upload', uploadModule.default);
    app.use('/api/tasks', tasksModule.default);
    app.use('/api/reactions', reactionsModule.default);
    app.use('/api/notifications', notificationsModule.default);
    app.use('/api/data', dataModule.default);
    app.use('/api/todos', todosModule.default);

    // EDA portal routes are OPTIONAL: they exist only in the desktop (exe) build,
    // which also bundles the local Python EDA service. On the website (Render) the
    // eda route/model files are not part of the repo, so this import is skipped
    // gracefully. The specifier is typed as `string` (not a literal) so tsc does
    // not statically resolve — and fail on — the optional module when it is absent.
    try {
      const edaSpecifier: string = './routes/eda.js';
      const edaModule: any = await import(edaSpecifier);
      app.use('/api/eda', edaModule.default);
      console.log('[Server] EDA portal routes enabled');
    } catch (e: any) {
      console.log('[Server] EDA portal routes not present — skipping', e?.message || '');
    }

    console.log('[Server] Routes loaded successfully');
  } catch (error) {
    console.error('[Server] Failed to load routes:', error);
    throw error;
  }
}

// Start server
async function startServer() {
  try {
    await initializeRoutes();

    app.use((req, res) => {
      res.status(404).json({ error: 'Not found' });
    });

    app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error('Server error:', err);
      res.status(500).json({ error: err.message || 'Internal server error' });
    });

    const connected = await connectDB();
    if (!connected) {
      console.error('Failed to connect to MongoDB. Please check your connection settings.');
      process.exit(1);
    }

    // Attendance auto-finalization (mark absent after evening window)
    startAttendanceScheduler();

    // Wipe shared message/group files on the 1st of every month at 02:00 server time.
    // Only files uploaded with category 'message' are removed; avatars and any
    // other uploads are left untouched.
    startMessageFileCleanupScheduler();

    // Use httpServer instead of app.listen for Socket.IO
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`\n✓ Server running on port ${PORT}`);
      console.log(`✓ WebSocket support enabled`);
      console.log(`✓ CORS enabled for ${corsOrigins.join(', ')}`);
      console.log(`✓ Ready to accept requests`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
