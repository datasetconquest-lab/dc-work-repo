import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from './models/User.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('Error: MONGODB_URI environment variable is required. Set it in server/.env');
  process.exit(1);
}

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI!);
    console.log('✓ Connected');

    const updates: { email: string; employee_id: string }[] = [
      { email: 'venkat.dataconquest@outlook.com', employee_id: 'DC001' },
      { email: 'swathi.dataconquest@outlook.com', employee_id: 'DC002' },
      { email: 'manvith.dataconquest@outlook.com', employee_id: 'DC003' },
      { email: 'aravindh.dataconquest@outlook.com', employee_id: 'DC004' },
      { email: 'amitha.dataconquest@outlook.com', employee_id: 'DC005' },
      { email: 'nandhakumar.dataconquest@outlook.com', employee_id: 'DC006' },

      { email: 'sachin.dataconquest@gmail.com', employee_id: 'DC010' },
      { email: 'adithya.dataconquest@gmail.com', employee_id: 'DC011' },
      { email: 'anish.dataconquest@gmail.com', employee_id: 'DC012' },
    ];

    console.log('\nUpdating employee IDs...');
    for (const { email, employee_id } of updates) {
      const res = await User.updateOne({ email }, { $set: { employee_id } });
      console.log(`  ${email} -> ${employee_id} (matched: ${res.matchedCount}, modified: ${res.modifiedCount})`);
    }

    console.log('\nDeleting employee VIGNESH TR...');
    const deleteResult = await User.deleteOne({ email: 'vignesh.dataconquest@outlook.com' });
    console.log(`  Deleted count: ${deleteResult.deletedCount}`);



    await mongoose.disconnect();
    console.log('\n✓ Done. Connection closed.');
  } catch (err) {
    console.error('Error running employee update script:', err);
    process.exit(1);
  }
}

run();

