import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const TARGET_EMAIL = 'manvith.dataconquest@outlook.com';
const NEW_IP = '103.218.112.18';

async function updateIP() {
    if (!MONGODB_URI) {
        console.error('MONGODB_URI not found in environment');
        process.exit(1);
    }

    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✓ Connected');

        const User = mongoose.model('User', new mongoose.Schema({
            email: String,
            allowed_ips: String
        }, { collection: 'users' }));

        const user = await User.findOne({ email: TARGET_EMAIL });

        if (!user) {
            console.error(`User ${TARGET_EMAIL} not found`);
            process.exit(1);
        }

        const currentIps = user.allowed_ips || '';
        if (currentIps.includes(NEW_IP)) {
            console.log(`✓ IP ${NEW_IP} is already in the allowed list for ${TARGET_EMAIL}`);
        } else {
            const updatedIps = currentIps ? `${currentIps}, ${NEW_IP}` : NEW_IP;
            await User.updateOne({ email: TARGET_EMAIL }, { $set: { allowed_ips: updatedIps } });
            console.log(`✓ Successfully added IP ${NEW_IP} to allowed list for ${TARGET_EMAIL}`);
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

updateIP();
