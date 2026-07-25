# Office Deployment Guide

This guide explains how to deploy your Teams application for use within your office network.

> **Current production stack:** the app now runs on **MongoDB Atlas** (database),
> **Render** (backend API) and **Netlify** (frontend). The backend reads a single
> `MONGODB_URI` connection string (plus `JWT_SECRET` and `CORS_ORIGIN`). The
> PostgreSQL steps below are **legacy** and only apply to an old local-network
> setup — for the current cloud deploy, configure `MONGODB_URI` on Render and
> `VITE_API_URL` on Netlify. See `server/render.yaml` and `server/README.md`.

## Best Option: Local Network Deployment (Recommended)

This is the **most secure and fastest** option for office use.

### Prerequisites
- A dedicated computer/server in your office (can be an old PC, doesn't need to be powerful)
- All users must be on the same local network (same WiFi or connected via LAN)
- Windows/Linux/Mac computer that stays on during office hours

### Step 1: Setup the Server Computer

1. **Install Node.js and PostgreSQL on the server machine**:
   - Download Node.js from https://nodejs.org/ (LTS version)
   - Download PostgreSQL from https://www.postgresql.org/download/

2. **Clone or copy this project** to the server machine:
   ```bash
   # Copy the entire DC/Teams folder to the server
   # For example: C:\TeamsServer\DC\Teams
   ```

3. **Configure PostgreSQL Database**:
   ```bash
   # Open PostgreSQL command line and create database
   psql -U postgres
   CREATE DATABASE data_conquest;
   \q
   ```

4. **Update server environment variables** (`.env` in `server` folder):
   ```env
   # Server Port
   PORT=3001

   # Database Connection (local MongoDB or a MongoDB Atlas SRV string)
   # URL-encode special characters in the password (e.g. @ -> %40)
   MONGODB_URI=mongodb://localhost:27017/dc_teams

   # JWT Secret (generate a random string, e.g. openssl rand -hex 32)
   JWT_SECRET=your_super_secret_jwt_key_here_change_this

   # CORS - Allow all local network IPs
   CORS_ORIGIN=http://localhost:5173,http://YOUR_SERVER_IP:5173
   ```

5. **Find your server's local IP address**:
   - **Windows**: Open Command Prompt → type `ipconfig` → look for "IPv4 Address" (e.g., 192.168.1.100)
   - **Mac/Linux**: Open Terminal → type `ifconfig` or `ip addr` → look for local IP

### Step 2: Run Database Migration

```bash
cd D:\DC\Teams\server
npm install
psql -U postgres -d data_conquest -f ../supabase/migrations/complete_schema.sql
```

### Step 3: Install Dependencies and Build

```bash
# Install server dependencies
cd D:\DC\Teams\server
npm install

# Install frontend dependencies
cd D:\DC\Teams
npm install
```

### Step 4: Configure Frontend for Network Access

Update `d:/DC/Teams/.env`:
```env
# Use your server's local IP address
VITE_API_URL=http://192.168.1.100:3001/api
```
(Replace `192.168.1.100` with your actual server IP)

### Step 5: Build Frontend for Production

```bash
cd D:\DC\Teams
npm run build
```

### Step 6: Setup Production Server with PM2

PM2 is a process manager that keeps your application running 24/7.

```bash
# Install PM2 globally
npm install -g pm2

# Start backend server
cd D:\DC\Teams\server
pm2 start npm --name "teams-backend" -- start

# Serve frontend (using npx serve)
cd D:\DC\Teams
npm install -g serve
pm2 start serve --name "teams-frontend" -- -s dist -l 5173

# Save PM2 configuration
pm2 save

# Setup PM2 to start on system boot
pm2 startup
```

### Step 7: Access from Other Computers

On any computer in the same office network:
1. Open web browser
2. Go to: `http://192.168.1.100:5173` (use your server IP)
3. Login with user credentials

### Step 8: Create Users

You can create users either:
1. **Via database**:
   ```sql
   INSERT INTO profiles (email, full_name, role, is_active)
   VALUES ('user@office.com', 'John Doe', 'member', true);
   ```

2. **Create a registration endpoint** (optional - I can help add this if needed)

---

## Alternative Option: Cloud Deployment (For Remote Access)

If you need access from outside the office:

### Option A: Railway

1. Create account at https://railway.app
2. Connect your GitHub repository
3. Deploy both frontend and backend
4. Set environment variables in Railway dashboard

### Option B: Vercel + Supabase

1. Use Vercel for frontend (https://vercel.com)
2. Use Supabase for database (https://supabase.com)
3. Deploy backend to Railway or Render

---

## Security Considerations

### For Local Network:
- ✅ Most secure - traffic never leaves your office
- ✅ Fast - no internet latency
- ✅ No monthly costs
- ⚠️ Server computer must stay on during office hours
- ⚠️ Only accessible within office network

### Recommended Security Enhancements:

1. **Change default JWT secret** in server `.env`
2. **Use strong database password**
3. **Create admin user first**, then regular users
4. **Backup database regularly**:
   ```bash
   pg_dump -U postgres data_conquest > backup_$(date +%Y%m%d).sql
   ```

5. **Set up firewall** on server computer to only allow:
   - Port 5173 (frontend)
   - Port 3001 (backend)
   - Only from local network (192.168.x.x range)

---

## Troubleshooting

### Users can't connect:
1. Check server computer's firewall allows incoming connections on ports 3001 and 5173
2. Verify all users are on same network
3. Ping the server IP from another computer to ensure network connectivity

### Application not starting:
```bash
# Check PM2 status
pm2 status

# View logs
pm2 logs teams-backend
pm2 logs teams-frontend

# Restart services
pm2 restart all
```

### Database connection issues:
1. Verify PostgreSQL is running
2. Check database credentials in server `.env`
3. Ensure database exists: `psql -U postgres -l`

---

## Daily Operations

### Starting the server (if not using PM2):
```bash
# Terminal 1 - Backend
cd D:\DC\Teams\server
npm run dev

# Terminal 2 - Frontend  
cd D:\DC\Teams
npm run dev
```

### Stopping services:
```bash
pm2 stop all
```

### Viewing active users:
```sql
SELECT email, full_name, role, is_active FROM profiles;
```

---

## Questions?

**Q: Can I access this from home?**  
A: Not with local deployment. You'd need cloud deployment or VPN to your office.

**Q: How many users can it support?**  
A: The local server can easily handle 50-100 concurrent users depending on hardware.

**Q: What if the server computer shuts down?**  
A: The application will be unavailable until it restarts. Use a dedicated machine or enable auto-start on boot.

**Q: Can I use a laptop as the server?**  
A: Yes, but it must stay on and connected to the network during office hours.

---

## Next Steps

1. Follow Step 1-7 above to set up your server
2. Create your admin user account
3. Test from another computer in the office
4. Distribute the access URL to your team: `http://YOUR_SERVER_IP:5173`
