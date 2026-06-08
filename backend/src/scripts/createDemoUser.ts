import mongoose from 'mongoose';
import { config } from '../config/config';
import { User } from '../models/User';
import { Organization } from '../models/Organization';

async function createDemoUser(): Promise<void> {
  try {
    console.log('🌱 Creating demo user...');
    
    await mongoose.connect(config.MONGODB_URI);
    
    let demoOrg = await Organization.findOne({ name: 'Demo Organization' });
    
    if (!demoOrg) {
      demoOrg = await Organization.create({
        name: 'Demo Organization',
        industry: 'Technology/Software',
        country: 'Egypt',
        size: 'medium',
        isActive: true,
      });
      console.log('✅ Created demo organization');
    }

    await User.deleteOne({ email: 'demo@carbonytics.com' });

    // Pass the PLAIN password — the User model's pre-save hook hashes it once.
    // (Previously this pre-hashed, causing a double-hash so the demo login failed.)
    await User.create({
      email: 'demo@carbonytics.com',
      password: 'Demo!2026Pass',
      name: 'Demo User',
      role: 'admin',
      organizationId: demoOrg._id,
      isActive: true,
    });

    console.log('✅ Demo user created (email: demo@carbonytics.com / password: Demo!2026Pass)');
    
  } catch (error) {
    console.error('❌ Demo user creation failed:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

createDemoUser().then(() => process.exit(0)).catch(() => process.exit(1));
