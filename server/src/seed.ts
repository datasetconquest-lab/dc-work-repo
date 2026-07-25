import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('Error: MONGODB_URI environment variable is required. Set it in server/.env');
  process.exit(1);
}

// User Schema
const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    full_name: { type: String, trim: true },
    employee_id: { type: String, trim: true },
    avatar_url: { type: String },
    // Extend roles here as well to keep in sync with main User model
    role: { type: String, enum: ['admin', 'member', 'manager', 'tl'], default: 'member' },
    is_active: { type: Boolean, default: true },
    password_hash: { type: String },
    allowed_ips: { type: String, default: '127.0.0.1, ::1, localhost, 192.168.0.0/16, 10.0.0.0/8' },
    restrict_by_ip: { type: Boolean, default: true },
    ip_last_login: { type: String },
    ip_login_history: [{ ip: String, timestamp: Date }],
    last_login: { type: Date },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // Team hierarchy: when set, this user reports to the given team lead
    team_lead_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { collection: 'users' });

// Group Schema
const GroupSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    is_active: { type: Boolean, default: true },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { collection: 'groups' });

// Group Member Schema
const GroupMemberSchema = new mongoose.Schema({
    group_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    added_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    joined_at: { type: Date, default: Date.now }
}, { collection: 'group_members' });

GroupMemberSchema.index({ group_id: 1, user_id: 1 }, { unique: true });

const User = mongoose.model('User', UserSchema);
const Group = mongoose.model('Group', GroupSchema);
const GroupMember = mongoose.model('GroupMember', GroupMemberSchema);

// All users data - REPLACE PASSWORDS WITH REAL ONES BEFORE RUNNING IN PRODUCTION
// These are placeholder passwords for demonstration purposes
const usersData = [
    {
        full_name: 'Manvith',
        email: 'manvith.dataconquest@outlook.com',
        role: 'admin',
        employee_id: 'DC003',
        password: 'ChangeMe@123',  // TODO: Replace with actual password
        avatar_url: 'https://images.pexels.com/photos/30417421/pexels-photo-30417421.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1'
    },
    {
        full_name: 'Venkatachalam K',
        email: 'venkat.dataconquest@outlook.com',
        role: 'admin',
        employee_id: 'DC001',
        password: 'ChangeMe@123'  // TODO: Replace with actual password
    },
    {
        full_name: 'Swathi M',
        email: 'swathi.dataconquest@outlook.com',
        role: 'admin',
        employee_id: 'DC002',
        password: 'ChangeMe@123'  // TODO: Replace with actual password
    },
    {
        full_name: 'Amitha K',
        email: 'amitha.dataconquest@outlook.com',
        // Team Lead (TL)
        role: 'tl',
        employee_id: 'DC005',
        password: 'ChangeMe@123'  // TODO: Replace with actual password
    },
    {
        full_name: 'Aravindh',
        email: 'aravindh.dataconquest@outlook.com',
        // Team Lead (TL)
        role: 'tl',
        employee_id: 'DC004',
        password: 'ChangeMe@123'  // TODO: Replace with actual password
    },

    {
        full_name: 'Sachin',
        email: 'sachin.dataconquest@gmail.com',
        role: 'member',
        employee_id: 'DC010',
        password: 'ChangeMe@123'  // TODO: Replace with actual password
    },
    {
        full_name: 'Adithya',
        email: 'adithya.dataconquest@gmail.com',
        role: 'member',
        employee_id: 'DC011',
        password: 'ChangeMe@123'  // TODO: Replace with actual password
    },
    {
        full_name: 'Anish',
        email: 'anish.dataconquest@gmail.com',
        role: 'member',
        employee_id: 'DC012',
        password: 'ChangeMe@123'  // TODO: Replace with actual password
    }
];

async function seedDatabase() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI!);
        console.log('✓ Connected to MongoDB');

        // Clear existing data
        console.log('\n🔄 Clearing existing data...');
        await User.deleteMany({});
        await Group.deleteMany({});
        await GroupMember.deleteMany({});
        console.log('✓ Existing data cleared');

        // Create users
        console.log('\n👥 Creating users...');
        const createdUsers: any[] = [];

        for (const userData of usersData) {
            // Generate unique salt per user (M8 fix)
            const hashedPassword = await bcrypt.hash(userData.password, 12);

            const user = new User({
                email: userData.email,
                full_name: userData.full_name,
                role: userData.role,
                employee_id: userData.employee_id,
                is_active: true,
                password_hash: hashedPassword,
                avatar_url: userData.avatar_url || null,
                allowed_ips: '127.0.0.1, ::1, localhost, 192.168.0.0/16, 10.0.0.0/8, 103.218.112.0/24',
                restrict_by_ip: true
            });

            await user.save();
            createdUsers.push(user);
            console.log(`  ✓ Created ${userData.role}: ${userData.full_name} (${userData.email})`);
        }

        // Find Manvith (first admin) to be the group creator
        const adminUser = createdUsers.find(u => u.email === 'manvith.dataconquest@outlook.com');

        // Set up team lead relationships:
        // - Aravindh leads Sachin, Adithya, and Anish
        // - Amitha currently has no seeded direct reports
        console.log('\n👥 Assigning team leads...');
        const aravindh = createdUsers.find(u => u.email === 'aravindh.dataconquest@outlook.com');
        const sachin = createdUsers.find(u => u.email === 'sachin.dataconquest@gmail.com');
        const adithya = createdUsers.find(u => u.email === 'adithya.dataconquest@gmail.com');
        const anish = createdUsers.find(u => u.email === 'anish.dataconquest@gmail.com');

        const teamUpdates: Promise<any>[] = [];
        if (aravindh && sachin) {
            teamUpdates.push(User.updateOne({ _id: sachin._id }, { $set: { team_lead_id: aravindh._id } }));
        }
        if (aravindh && adithya) {
            teamUpdates.push(User.updateOne({ _id: adithya._id }, { $set: { team_lead_id: aravindh._id } }));
        }
        if (aravindh && anish) {
            teamUpdates.push(User.updateOne({ _id: anish._id }, { $set: { team_lead_id: aravindh._id } }));
        }
        await Promise.all(teamUpdates);
        console.log('✓ Team lead relationships assigned');

        // Create Company Channel group
        console.log('\n📢 Creating Company Channel group...');
        const companyChannel = new Group({
            name: 'Company Channel',
            description: 'Default company-wide channel for all team members.',
            created_by: adminUser._id,
            is_active: true
        });
        await companyChannel.save();
        console.log('  ✓ Company Channel created');

        // Add all users to Company Channel
        console.log('\n👥 Adding all users to Company Channel...');
        for (const user of createdUsers) {
            const member = new GroupMember({
                group_id: companyChannel._id,
                user_id: user._id,
                added_by: adminUser._id
            });
            await member.save();
            console.log(`  ✓ Added ${user.full_name} to Company Channel`);
        }

        // Print summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 SEED COMPLETE - SUMMARY');
        console.log('='.repeat(60));
        console.log(`\n✓ Total Users Created: ${createdUsers.length}`);
        console.log(`  - Admins: ${createdUsers.filter(u => u.role === 'admin').length}`);
        console.log(`  - Members: ${createdUsers.filter(u => u.role === 'member').length}`);
        console.log(`\n✓ Groups Created: 1 (Company Channel)`);
        console.log(`✓ Group Members: ${createdUsers.length}`);

        console.log('\n' + '-'.repeat(60));
        console.log('🔐 LOGIN CREDENTIALS:');
        console.log('-'.repeat(60));
        for (const userData of usersData) {
            console.log(`  ${userData.role.toUpperCase().padEnd(7)} | ${userData.email.padEnd(40)} | ${userData.password}`);
        }
        console.log('-'.repeat(60));

        await mongoose.disconnect();
        console.log('\n✓ Database connection closed');
        console.log('✓ Seed complete!\n');

    } catch (error) {
        console.error('Error seeding database:', error);
        process.exit(1);
    }
}

seedDatabase();
