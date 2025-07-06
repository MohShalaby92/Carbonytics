#!/bin/bash

# Script to add demo user functionality to existing Carbonytics setup
echo "🔧 Adding demo user functionality to Carbonytics..."

# Check if we're in the right directory
if [ ! -f "backend/package.json" ]; then
    echo "❌ backend/package.json not found. Please run from project root."
    exit 1
fi

# Add the demo user script to backend package.json (only if not already present)
if ! grep -q "create-demo-user" backend/package.json; then
    echo "📝 Adding create-demo-user script to backend/package.json..."
    
    # Use sed to add the new script before the closing brace of scripts section
    sed -i.bak '/    "seed-benchmarks": "ts-node src\/scripts\/seedBenchmarks.ts"/a\
    "create-demo-user": "ts-node src/scripts/createDemoUser.ts",' backend/package.json
    
    echo "✅ Added create-demo-user script to package.json"
else
    echo "ℹ️ create-demo-user script already exists in package.json"
fi

# Create the demo user TypeScript file
echo "📁 Creating demo user script file..."
cat > backend/src/scripts/createDemoUser.ts << 'EOF'
// This script creates demo users for testing the Carbonytics platform
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from '../config/config';
import { User } from '../models/User';
import { Organization } from '../models/Organization';

async function createDemoUser(): Promise<void> {
  try {
    console.log('🌱 Creating demo user for Carbonytics...');
    
    // Connect to MongoDB using the same connection string from config
    await mongoose.connect(config.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Check if demo organization exists
    let demoOrg = await Organization.findOne({ name: 'Demo Organization' });
    
    if (!demoOrg) {
      // Create demo organization
      demoOrg = await Organization.create({
        name: 'Demo Organization',
        industry: 'Technology/Software',
        country: 'Egypt',
        size: 'medium',
        settings: {
          currency: 'EGP',
          language: 'en',
          timezone: 'Africa/Cairo',
        },
        isActive: true,
      });
      console.log('✅ Created demo organization');
    } else {
      console.log('ℹ️ Demo organization already exists');
    }

    // Remove existing demo user if exists (for clean setup)
    await User.deleteOne({ email: 'demo@carbonytics.com' });
    
    // Hash password using same method as User model
    const hashedPassword = await bcrypt.hash('demo123', 12);
    
    // Create demo user
    const demoUser = await User.create({
      email: 'demo@carbonytics.com',
      password: hashedPassword,
      name: 'Demo User',
      role: 'admin',
      organizationId: demoOrg._id,
      isActive: true,
    });
    
    console.log('✅ Created demo user');

    // Create additional demo users for testing different roles
    const additionalUsers = [
      {
        email: 'manager@carbonytics.com',
        name: 'Demo Manager',
        role: 'manager',
        password: 'demo123',
      },
      {
        email: 'user@carbonytics.com',
        name: 'Demo Viewer',
        role: 'user',
        password: 'demo123',
      },
    ];

    for (const userData of additionalUsers) {
      // Remove if exists
      await User.deleteOne({ email: userData.email });
      
      const hashedPassword = await bcrypt.hash(userData.password, 12);
      await User.create({
        email: userData.email,
        password: hashedPassword,
        name: userData.name,
        role: userData.role,
        organizationId: demoOrg._id,
        isActive: true,
      });
      console.log(`✅ Created ${userData.role} user: ${userData.email}`);
    }

    // Verify demo user can login by testing password comparison
    const testUser = await User.findOne({ email: 'demo@carbonytics.com' })
      .select('+password');
    
    if (testUser) {
      const isPasswordValid = await bcrypt.compare('demo123', testUser.password);
      if (isPasswordValid) {
        console.log('✅ Demo user password verification successful');
      } else {
        console.log('❌ Demo user password verification failed');
      }
    }

    console.log('🎉 Demo user creation completed successfully!');
    
    // Log summary
    console.log('\n📋 DEMO CREDENTIALS SUMMARY:');
    console.log('================================');
    console.log('Organization: Demo Organization');
    console.log('Admin User:   demo@carbonytics.com / demo123');
    console.log('Manager User: manager@carbonytics.com / demo123');
    console.log('Viewer User:  user@carbonytics.com / demo123');
    console.log('================================\n');
    
  } catch (error) {
    console.error('❌ Demo user creation failed:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  createDemoUser()
    .then(() => {
      console.log('Demo user creation completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Demo user creation failed:', error);
      process.exit(1);
    });
}

export { createDemoUser };
EOF

echo "✅ Created backend/src/scripts/createDemoUser.ts"

# Create a simple wrapper script for easy execution
echo "🔧 Creating easy-to-run scripts..."

# Create deployment verification script
cat > verify-deployment.sh << 'EOF'
#!/bin/bash
# Quick deployment verification script for Carbonytics
echo "🚀 Carbonytics Deployment Verification"
echo "======================================"

# Check Docker containers
echo "🐳 Checking Docker containers..."
docker-compose ps

# Check frontend
echo "🎨 Testing frontend..."
if curl -f -s http://localhost:3000 > /dev/null; then
    echo "✅ Frontend is accessible"
else
    echo "❌ Frontend is not accessible"
fi

# Check backend
echo "🔧 Testing backend..."
if curl -f -s http://localhost:5000/api/emission-categories > /dev/null; then
    echo "✅ Backend API is accessible"
else
    echo "❌ Backend API is not accessible"
fi

# Test demo login
echo "🔑 Testing demo login..."
login_response=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "demo@carbonytics.com", "password": "demo123"}')

if echo "$login_response" | grep -q '"success":true'; then
    echo "✅ Demo login working!"
else
    echo "❌ Demo login failed - creating demo user..."
    docker-compose exec backend npm run create-demo-user
fi

echo ""
echo "📍 URLs:"
echo "Frontend: http://localhost:3000"
echo "Backend:  http://localhost:5000"
echo ""
echo "🔑 Demo Credentials:"
echo "Email: demo@carbonytics.com"
echo "Password: demo123"
EOF

chmod +x verify-deployment.sh

# Create a quick demo user creation script
cat > create-demo-users.sh << 'EOF'
#!/bin/bash
echo "👤 Creating demo users for Carbonytics..."

if docker-compose ps | grep -q "Up"; then
    echo "📡 Creating demo users via Docker..."
    docker-compose exec backend npm run create-demo-user
else
    echo "❌ Docker containers are not running. Please start with: docker-compose up -d"
fi
EOF

chmod +x create-demo-users.sh

echo ""
echo "✅ Setup completed successfully!"
echo ""
echo "📋 Available Scripts:"
echo "  ./verify-deployment.sh    - Check deployment status and create demo user if needed"
echo "  ./create-demo-users.sh    - Create demo users manually"
echo "  docker-compose exec backend npm run create-demo-user - Run demo user creation directly"
echo ""
echo "🚀 Quick Start:"
echo "  1. Ensure containers are running: docker-compose up -d"
echo "  2. Run verification: ./verify-deployment.sh"
echo "  3. Open browser: http://localhost:3000"
echo "  4. Login with: demo@carbonytics.com / demo123"
echo ""
echo "🎯 Your Carbonytics MVP is ready for testing!"