import mongoose from 'mongoose';
import { config } from '../config/config';
import { User } from '../models/User';
import { Organization } from '../models/Organization';
import { generateTemporaryPassword } from '../utils/security';

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
 * NOT reset) and reported as skipped. Each password is printed ONCE, right after
 * its account is created — capture it; it is stored only as a bcrypt hash. A
 * reviewer that fails (e.g. the User email validator rejects it) is rolled back
 * (its org deleted) and reported; the remaining reviewers are still created.
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
 * Create one reviewer's org + admin user. If the user cannot be created the org
 * is deleted again, so a failure never leaves an orphan sandbox behind.
 * Returns the plain password (to print once) and the org name.
 */
export async function createReviewer({ name, email }: Reviewer): Promise<{ password: string; org: string }> {
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

  const password = generateTemporaryPassword();
  try {
    // Plain password — the User pre-save hook hashes it exactly once.
    await User.create({
      email,
      password,
      name,
      role: 'admin', // admin of their own sandbox org -> full feature access
      organizationId: org._id,
      isActive: true,
    });
  } catch (err) {
    await Organization.deleteOne({ _id: org._id });
    throw err;
  }
  return { password, org: orgName };
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

  const skipped: string[] = [];
  const failed: string[] = [];
  let createdCount = 0;

  console.log('\n=========================================================');
  console.log(' SPECIALIST REVIEW CREDENTIALS (capture these now)');
  console.log('=========================================================');

  await mongoose.connect(config.MONGODB_URI);
  try {
    for (const reviewer of args.map(parseReviewer)) {
      const { name, email } = reviewer;
      if (await User.findOne({ email })) {
        console.log(` • ${email} already exists — skipped (password left unchanged).`);
        skipped.push(email);
        continue;
      }
      try {
        const { password, org } = await createReviewer(reviewer);
        createdCount++;
        // Printed immediately so a later failure can never swallow it.
        console.log(` Name:     ${name}`);
        console.log(` Email:    ${email}`);
        console.log(` Password: ${password}`);
        console.log(` Org:      ${org}`);
        console.log(' ---------------------------------------------------------');
      } catch (err) {
        console.error(` ❌ ${email} NOT created: ${(err as Error).message}`);
        failed.push(email);
      }
    }
  } finally {
    await mongoose.disconnect();
  }

  if (createdCount === 0) console.log(' No new accounts were created.');
  if (skipped.length) console.log(` Skipped (already existed): ${skipped.join(', ')}`);
  if (failed.length) {
    console.log(` FAILED (nothing created, safe to re-run): ${failed.join(', ')}`);
    process.exitCode = 1;
  }
  console.log('=========================================================');
  console.log(' Passwords are shown ONCE and stored only as a bcrypt hash.');
  console.log('=========================================================\n');
}

if (require.main === module) {
  seedReviewAccounts()
    .then(() => process.exit(process.exitCode ?? 0))
    .catch((err) => {
      console.error('❌ seedReviewAccounts failed:', err);
      process.exit(1);
    });
}
