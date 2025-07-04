import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

describe('Authentication Utils', () => {
  const testPassword = 'testPassword123';
  const testEmail = 'test@carbonytics.com';

  describe('Password Hashing', () => {
    it('should hash passwords correctly', async () => {
      const hashedPassword = await bcrypt.hash(testPassword, 12);
      
      expect(hashedPassword).toBeDefined();
      expect(hashedPassword).not.toBe(testPassword);
      expect(hashedPassword.length).toBeGreaterThan(50);
    });

    it('should verify passwords correctly', async () => {
      const hashedPassword = await bcrypt.hash(testPassword, 12);
      const isValid = await bcrypt.compare(testPassword, hashedPassword);
      const isInvalid = await bcrypt.compare('wrongPassword', hashedPassword);
      
      expect(isValid).toBe(true);
      expect(isInvalid).toBe(false);
    });
  });

  describe('JWT Token Generation', () => {
    it('should generate valid JWT tokens', () => {
      const payload = {
        id: 'test-user-id',
        email: testEmail,
        role: 'user'
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '24h' });
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should verify JWT tokens correctly', () => {
      const payload = {
        id: 'test-user-id',
        email: testEmail,
        role: 'user'
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '24h' });
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      
      expect(decoded.id).toBe(payload.id);
      expect(decoded.email).toBe(payload.email);
      expect(decoded.role).toBe(payload.role);
    });

    it('should reject invalid tokens', () => {
      const invalidToken = 'invalid.jwt.token';
      
      expect(() => {
        jwt.verify(invalidToken, process.env.JWT_SECRET!);
      }).toThrow();
    });
  });
});
