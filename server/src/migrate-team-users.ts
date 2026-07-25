/**
 * Idempotent migration: set TL teams and add missing team members.
 * Run: npm run migrate:team-users (from server/)
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { User } from './models/User.js';
import { Group, GroupMember } from './models/Group.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('Error: MONGODB_URI environment variable is required. Set it in server/.env');
  process.exit(1);
}

// Passwords are read from environment variables so plaintext secrets never
// live in source control. Set them when running, e.g.:
//   PW_TARUN=... PW_DINESH=... PW_HARI=... npm run migrate:team-users
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Error: ${name} environment variable is required (member password).`);
    process.exit(1);
  }
  return value;
}

const NEW_MEMBERS: {
  full_name: string;
  email: string;
  employee_id?: string;
  password: string;
  team: 'aravindh' | 'amitha';
}[] = [
  { full_name: 'Tarun M', email: 'tarun.dataconquest@outlook.com', password: requireEnv('PW_TARUN'), team: 'amitha' },
  { full_name: 'Dinesh S', email: 'dinesh.dataconquest@outlook.com', password: requireEnv('PW_DINESH'), team: 'amitha' },
  { full_name: 'Hari Siddarth S', email: 'hari.dataconquest@outlook.com', password: requireEnv('PW_HARI'), team: 'amitha' },
];

const ARAVINDH_TEAM_EMAILS = [
  'adithya.dataconquest@gmail.com',
  'anish.dataconquest@gmail.com',
  'sachin.dataconquest@gmail.com',
];

const DEFAULT_ALLOWED_IPS =
  '127.0.0.1, ::1, localhost, 192.168.0.0/16, 10.0.0.0/8, 103.218.112.0/24';

function nextEmployeeIds(existingIds: Array<string | undefined>, count: number): string[] {
  const used = new Set(existingIds.filter(Boolean));
  const ids: string[] = [];
  let n = 1;
  while (ids.length < count) {
    const candidate = `DC${String(n).padStart(3, '0')}`;
    if (!used.has(candidate)) {
      ids.push(candidate);
      used.add(candidate);
    }
    n += 1;
  }
  return ids;
}

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI!);
    console.log('✓ Connected');

    const aravindh = await User.findOne({ email: 'aravindh.dataconquest@outlook.com' });
    const amitha = await User.findOne({ email: 'amitha.dataconquest@outlook.com' });
    if (!aravindh) throw new Error('User not found: aravindh.dataconquest@outlook.com');
    if (!amitha) throw new Error('User not found: amitha.dataconquest@outlook.com');

    const salt = await bcrypt.genSalt(12);

    await User.updateOne({ _id: aravindh._id }, { $set: { role: 'tl', updated_at: new Date() } });
    await User.updateOne({ _id: amitha._id }, { $set: { role: 'tl', updated_at: new Date() } });

    console.log('\nAssigning existing members to Aravindh...');
    const aravindhTeam = await User.updateMany(
      { email: { $in: ARAVINDH_TEAM_EMAILS } },
      { $set: { team_lead_id: aravindh._id, updated_at: new Date() } }
    );
    console.log(`  matched: ${aravindhTeam.matchedCount}, modified: ${aravindhTeam.modifiedCount}`);

    const existingIds = (await User.find({}).select('employee_id').lean())
      .map((u: any) => u.employee_id);
    const existingNewMembers = await User.find({
      email: { $in: NEW_MEMBERS.map(u => u.email.toLowerCase()) }
    }).select('email employee_id').lean();
    const existingByEmail = new Map(existingNewMembers.map((u: any) => [u.email, u]));
    const membersNeedingIds = NEW_MEMBERS.filter((u) => !existingByEmail.get(u.email.toLowerCase())?.employee_id);
    const generatedIds = nextEmployeeIds(existingIds, membersNeedingIds.length);
    let generatedIdIndex = 0;

    console.log('\nUpserting new members...');
    for (const u of NEW_MEMBERS) {
      const email = u.email.toLowerCase();
      const hash = await bcrypt.hash(u.password, salt);
      const lead = u.team === 'amitha' ? amitha : aravindh;
      const existing = await User.findOne({ email });
      const employeeId = u.employee_id || existing?.employee_id || generatedIds[generatedIdIndex++];

      if (!existing) {
        await User.create({
          email,
          full_name: u.full_name,
          employee_id: employeeId,
          role: 'member',
          is_active: true,
          password_hash: hash,
          team_lead_id: lead._id,
          allowed_ips: DEFAULT_ALLOWED_IPS,
          restrict_by_ip: true,
          ip_login_history: [],
        });
        console.log(`  created: ${employeeId} ${email} (${u.team})`);
      } else {
        await User.updateOne(
          { _id: existing._id },
          {
            $set: {
              full_name: u.full_name,
              employee_id: employeeId,
              password_hash: hash,
              team_lead_id: lead._id,
              role: 'member',
              is_active: true,
              updated_at: new Date(),
            },
          }
        );
        console.log(`  updated: ${employeeId} ${email} (${u.team})`);
      }
    }

    const companyGroup =
      (await Group.findOne({ name: 'Company Channel' })) ||
      (await Group.findOne({ name: { $regex: /^company channel$/i } }));
    const admin =
      (await User.findOne({ email: 'manvith.dataconquest@outlook.com' })) ||
      (await User.findOne({ role: 'admin' }).sort({ created_at: 1 }));
    if (companyGroup && admin) {
      console.log('\nEnsuring Company Channel membership for new users...');
      for (const u of NEW_MEMBERS) {
        const user = await User.findOne({ email: u.email.toLowerCase() });
        if (!user) continue;
        const already = await GroupMember.findOne({
          group_id: companyGroup._id,
          user_id: user._id,
        });
        if (!already) {
          await GroupMember.create({
            group_id: companyGroup._id,
            user_id: user._id,
            added_by: admin._id,
          });
          console.log(`  added to Company Channel: ${u.email}`);
        }
      }
    } else {
      console.log('\n(skip) Company Channel or admin not found — add group_members manually if needed');
    }

    await mongoose.disconnect();
    console.log('\n✓ Done. Connection closed.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

run();
