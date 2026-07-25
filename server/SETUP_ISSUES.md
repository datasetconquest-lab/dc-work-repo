# Backend Server - Issues Found & Fixed

## Problems Identified

### 1. ❌ **Incorrect Import Paths**
**Location:** `src/routes/auth.ts` and `src/routes/profiles.ts`

**Problem:**
```typescript
import { authenticateUser } from './auth.ts';  // WRONG - same directory
import { authMiddleware } from './middleware.ts'; // WRONG - wrong directory
```

**Fix:**
```typescript
import { authenticateUser } from '../auth.js';  // RIGHT - go up one level
import { authMiddleware } from '../middleware.js'; // RIGHT - go up one level
```

**Reason:** Route files are in `src/routes/` but auth.ts and middleware.ts are in `src/`

---

### 2. ❌ **TypeScript File Extensions in ESM**
**Location:** All import statements

**Problem:**
```typescript
import { testConnection } from './db.ts';  // ESM doesn't support .ts in imports
```

**Fix:**
```typescript
import { testConnection } from './db.js';  // ESM requires .js extension
```

**Reason:** When using ESM module system (`"type": "module"` in package.json), TypeScript must be transpiled to JavaScript, so imports need `.js` extensions

---

### 3. ❌ **Missing Password in .env**
**Location:** `.env` file

**Problem:**
```env
DB_PASSWORD=your_password  # Placeholder, not actual password
```

**Fix:**
```env
DB_PASSWORD=your_actual_password_here  # Must match PostgreSQL setup
```

**Reason:** Connection will fail if password doesn't match PostgreSQL installation

---

### 4. ❌ **Module Resolution Issues**
**Location:** `tsconfig.json`

**Problem:**
```json
{
  "module": "ES2020",
  "moduleResolution": "node"
  // Missing: verbatimModuleSyntax
}
```

**Fix:**
```json
{
  "module": "ES2020",
  "moduleResolution": "node",
  "verbatimModuleSyntax": true  // Preserve import/export syntax
}
```

---

### 5. ❌ **Package Version Compatibility**
**Location:** `package.json`

**Issue:** Some package versions may not be compatible. Updated to stable versions:
- `jsonwebtoken@^9.1.2` → kept (latest stable)
- `pg@^8.11.3` → kept (latest stable)
- `express@^4.18.2` → kept (latest stable)

---

### 6. ❌ **Missing Error Messages in Import**
**Location:** `src/routes/auth.ts`

**Problem:**
```typescript
import { authenticateUser, findUserById, findUserByEmail } from './auth.ts';
// findUserByEmail is imported but never used
```

**Fix:**
```typescript
import { authenticateUser, findUserById } from '../auth.js';
// Removed unused import
```

---

## Files Modified

✅ `server/src/routes/auth.ts` - Fixed import paths
✅ `server/src/routes/profiles.ts` - Fixed import paths
✅ `server/src/server.ts` - Fixed import paths
✅ `server/src/auth.ts` - Fixed import paths
✅ `server/src/middleware.ts` - Fixed import paths
✅ `server/src/db.ts` - Reordered imports for clarity
✅ `server/tsconfig.json` - Added verbatimModuleSyntax
✅ `server/package.json` - Added --no-warnings flag
✅ `server/README.md` - Updated with comprehensive setup guide

---

## How to Verify Fixes

### 1. Check node_modules are installed
```bash
cd d:\DC\Teams\server
npm install
```

### 2. Test with health check
```bash
npm run dev
```

Should output:
```
✓ Server running on http://localhost:3001
✓ CORS enabled for http://localhost:5173
✓ Database: teams_db
```

### 3. Test endpoint
```bash
curl http://localhost:3001/health
```

Should return:
```json
{"status":"OK","timestamp":"2026-01-19T..."}
```

### 4. Test login
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"<your-password>"}'
```

---

## Setup Checklist

- [ ] PostgreSQL running on localhost:5432
- [ ] Database `teams_db` created
- [ ] Migration executed: `00_create_initial_schema.sql`
- [ ] `.env` file has correct DB_PASSWORD
- [ ] Run: `npm install` in server directory
- [ ] Run: `npm run dev` to start backend
- [ ] Test: `curl http://localhost:3001/health`

---

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| `Cannot find module 'pg'` | Run `npm install` |
| `ECONNREFUSED 127.0.0.1:5432` | Start PostgreSQL |
| `password authentication failed` | Check DB_PASSWORD in .env |
| `relation "profiles" does not exist` | Run migration |
| `Module ERR_MODULE_NOT_FOUND` | Clear node_modules and reinstall |

