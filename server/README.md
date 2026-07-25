# Teams Management Backend Server

A Node.js Express server providing authentication and database operations for the Teams Management application.

## Prerequisites

- **Node.js** v18+ installed
- **MongoDB** — either a local `mongod` (default `mongodb://localhost:27017/dc_teams`) or a MongoDB Atlas cluster connection string

## Setup

### 1. Install Dependencies

```bash
cd d:\DC\Teams\server
npm install
```

### 2. Configure Environment Variables

Create/update the `.env` file with your MongoDB connection (see `server/.env.example`):

```env
NODE_ENV=development
PORT=3001

# Local MongoDB, or a MongoDB Atlas SRV string.
# URL-encode special characters in the password (e.g. @ -> %40).
MONGODB_URI=mongodb://localhost:27017/dc_teams

JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRE=7d

CORS_ORIGIN=http://localhost:5173
```

**⚠️ Important:** In production, `MONGODB_URI` and `JWT_SECRET` are required and the server will refuse to start without them.

### 3. Initialize Database

MongoDB creates collections and indexes automatically on first write — no manual
migration is needed. To populate initial users/groups, run the seed script:

```bash
npm run seed
```

### 4. Start Development Server

```bash
npm run dev
```

You should see:
```
✓ MongoDB connected successfully
✓ Server running on port 3001
```

## API Endpoints

### Authentication

**POST** `/api/auth/login`
```json
{
  "email": "admin@dataconquest.com",
  "password": "admin123"
}
```

Response:
```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "admin@dataconquest.com",
    "full_name": "System Admin",
    "avatar_url": "https://...",
    "role": "admin",
    "is_active": true
  },
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**GET** `/api/auth/me` (requires token)
- Returns current authenticated user profile

**POST** `/api/auth/verify` (requires token)
- Verifies JWT token validity

**POST** `/api/auth/logout` (requires token)
- Logs out user

### Profiles

**GET** `/api/profiles` (admin only)
- Get all user profiles

**GET** `/api/profiles/:id` (requires token)
- Get specific user profile

**PUT** `/api/profiles/:id` (requires token)
- Update user profile

**DELETE** `/api/profiles/:id` (admin only)
- Delete user profile

## Authentication

All protected endpoints require Bearer token in header:

```
Authorization: Bearer <your_jwt_token>
```

Example:
```bash
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." http://localhost:3001/api/auth/me
```

## Default User Credentials

- **Email:** admin@dataconquest.com
- **Password:** admin123
- **Role:** admin

## Troubleshooting

### "Cannot find module"
```bash
npm install
```

### Database connection fails
1. Check MongoDB is reachable (local `mongod` running, or Atlas cluster up)
2. Verify `MONGODB_URI` in `.env` — URL-encode special characters in the password (`@` -> `%40`)
3. For Atlas, confirm your IP is allowed under Network Access and the DB user/password are correct

### "Module not found: xyz" errors
This is usually from stale node_modules. Clear and reinstall:
```bash
rm -r node_modules package-lock.json
npm install
npm run dev
```

### TypeScript errors
Make sure you're running:
```bash
npm run dev
```

Not:
```bash
node src/server.ts
```

## Database Schema

Key MongoDB collections (see `src/models/`):
- `users` - User profiles + password hashes + per-user IP allowlist
- `login_logs` - Authentication audit trail
- `groups` / `group_members` / `group_messages` - Team channels
- `direct_messages` - 1:1 chat
- `tasks` - Company & personal tasks (pending → started → processing → review → completed)
- `calendar_events` - Team events
- `attendance` / `monthly_attendance_exports` - Attendance tracking
- `files` - Uploaded attachments/avatars

## Security Features

✓ Password hashing with bcryptjs (12 rounds)
✓ JWT token-based authentication (7 days expiry)
✓ Per-user IP allow-listing (office network restriction, optional WFH override)
✓ Rate limiting (general + strict login limiter) and Helmet headers
✓ CORS protection
✓ Admin-only endpoints and route-level ownership checks
✓ Audit logging for all logins
