import crypto from 'crypto';
import mongoose from 'mongoose';
import { config } from '../config/config';
import { User } from '../models/User';
import { Organization } from '../models/Organization';

/**
 * Pre-create isolated specialist-review accounts for the closed (invite-only)
 * deployment. Each reviewer gets their OWN organization (a private sandbox) and
 * an admin user inside it, so testers never see or overwrite each other's data.
 * A fresh org automatically sees the shared/global factor library (Egyptian
 * defaults + DEFRA/EPA/EFDB/GHGP) — it only lacks org-private custom factors —
 * so the calculator works out of the box.
 *
 * Self-service signup is closed on that instance (DISABLE_REGISTRATION=true), so
 * this script is the ONLY way accounts are created there.
 *
 * Usage (inside the backend container, MONGODB_URI pointing at the prod db):
 *   node dist/scripts/seedReviewAccounts.js "Dr Jane Smith=jane@firm.com" "Omar Ali=omar@firm.com"
 *   node dist/scripts/seedReviewAccounts.js jane@firm.com omar@firm.com   # names derived from the address
 *
 * Idempotent: an email that already exists is left untouched (its password is
 * NOT reset) and reported as skipped. Generated passwords are printed ONCE here —
 * capture them; they are stored only as a bcrypt hash and cannot be recovered.
 *
 * Optional env: REVIEW_ORG_SUFFIX (default " — Review Workspace"),
 *               REVIEW_INDUSTRY (one of the Organization industry enum; default "Other").
 */

const ORG_SUFFIX = process.env.REVIEW_ORG_SUFFIX ?? ' — Review Workspace';
const INDUSTRY = process.env.REVIEW_INDUSTRY ?? 'Other';

interface Reviewer {
  name: string;
  email: string;
}

/** Parse "Name=email" or a bare "email" (name derived from the local part). */
function parseReviewer(arg: string): Reviewer {
  const eq = arg.indexOf('=');
  if (eq > 0) {
    const name = arg.slice(0, eq).trim();
    const email = arg.slice(eq + 1).trim().toLowerCase();
    return { name, email };
  }
  const email = arg.trim().toLowerCase();
  const local = email.split('@')[0] || email;
  const name = local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return { name: name || email, email };
}

/**
 * Strong, human-typeable password: 14 chars from an unambiguous set (no
 * 0/O/1/l/I), guaranteed to contain an upper, a lower and a digit so it always
 * satisfies the register policy (min 8, has a letter, has a number).
 */
function generatePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits;
  const bytes = crypto.randomBytes(14);
  const chars: string[] = [];
  for (let i = 0; i < 11; i++) chars.push(all[bytes[i] % all.length]);
  // Guarantee the three classes.
  chars.push(upper[bytes[11] % upper.length]);
  chars.push(lower[bytes[12] % lower.length]);
  chars.push(digits[bytes[13] % digits.length]);
  return chars.join('');
}

async function seedReviewAccounts(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (args.length === 0) {
    console.error(
      'No reviewers supplied.\n' +
        'Usage: node dist/scripts/seedReviewAccounts.js "Name=email" [...] | <email> [...]',
    );
    process.exitCode = 1;
    return;
  }

  const reviewers = args.map(parseReviewer);
  const created: Array<{ name: string; email: string; password: string; org: string }> = [];
  const skipped: string[] = [];

  await mongoose.connect(config.MONGODB_URI);
  try {
    for (const { name, email } of reviewers) {
      if (!email.includes('@')) {
        console.warn(`Skipping "${email}" — not a valid email.`);
        skipped.push(email);
        continue;
      }

      const existing = await User.findOne({ email });
      if (existing) {
        console.log(`• ${email} already exists — skipped (password left unchanged).`);
        skipped.push(email);
        continue;
      }

      const orgName = `${name}${ORG_SUFFIX}`;
      const org = await Organization.create({
        name: orgName,
        industry: INDUSTRY,
        country: 'Egypt',
        size: 'medium',
        isActive: true,
        // Skip the guided onboarding wizard so reviewers land straight in the app.
        onboarding: { completed: true },
      });

      const password = generatePassword();
      // Plain password — the User pre-save hook hashes it exactly once.
      await User.create({
        email,
        password,
        name,
        role: 'admin', // admin of their own sandbox org -> full feature access
        organizationId: org._id,
        isActive: true,
      });

      created.push({ name, email, password, org: orgName });
      console.log(`✅ Created ${email} (admin of "${orgName}")`);
    }
  } finally {
    await mongoose.disconnect();
  }

  console.log('\n=========================================================');
  console.log(' SPECIALIST REVIEW CREDENTIALS (capture these now)');
  console.log('=========================================================');
  if (created.length === 0) {
    console.log(' No new accounts were created.');
  } else {
    for (const c of created) {
      console.log(` Name:     ${c.name}`);
      console.log(` Email:    ${c.email}`);
      console.log(` Password: ${c.password}`);
      console.log(` Org:      ${c.org}`);
      console.log(' ---------------------------------------------------------');
    }
  }
  if (skipped.length) console.log(` Skipped (already existed / invalid): ${skipped.join(', ')}`);
  console.log('=========================================================');
  console.log(' Passwords are shown ONCE and stored only as a bcrypt hash.');
  console.log('=========================================================\n');
}

seedReviewAccounts()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error('❌ seedReviewAccounts failed:', err);
    process.exit(1);
  });
