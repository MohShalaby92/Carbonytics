import { Router } from 'express';
import { body } from 'express-validator';
import {
  register,
  login,
  refreshToken,
  logout,
  getProfile,
  updateProfile,
  changePassword,
} from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';

const router = Router();

// Validation middleware
const validateRegister = [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/[A-Za-z]/)
    .withMessage('Password must contain a letter')
    .matches(/\d/)
    .withMessage('Password must contain a number'),
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('organizationName').trim().notEmpty().withMessage('Organization name is required'),
  body('industry').trim().notEmpty().withMessage('Industry is required'),
];

const validateLogin = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

const validateChangePassword = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters')
    .matches(/[A-Za-z]/)
    .withMessage('New password must contain a letter')
    .matches(/\d/)
    .withMessage('New password must contain a number'),
];

// Public routes
router.post('/register', validate(validateRegister), register);
router.post('/login', validate(validateLogin), login);
router.post('/refresh', refreshToken);

// Protected routes
router.use(authenticate);
router.post('/logout', logout);
router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.post('/change-password', validate(validateChangePassword), changePassword);

export default router;
