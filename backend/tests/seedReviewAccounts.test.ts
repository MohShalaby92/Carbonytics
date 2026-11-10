/**
 * The review-account seeder must never leave an orphan org behind: if the user
 * cannot be created (e.g. the email validator rejects "x@firm.info"), the org it
 * just made is deleted and the error surfaces so the caller reports it.
 */
jest.mock('../src/models/Organization', () => ({
  Organization: {
    create: jest.fn(async () => ({ _id: 'org1' })),
    deleteOne: jest.fn(async () => ({})),
  },
}));
jest.mock('../src/models/User', () => ({
  User: { create: jest.fn() },
}));

import { Organization } from '../src/models/Organization';
import { User } from '../src/models/User';
import { createReviewer } from '../src/scripts/seedReviewAccounts';

describe('createReviewer', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes the new org and rethrows when the user cannot be created', async () => {
    (User.create as jest.Mock).mockRejectedValueOnce(new Error('Please enter a valid email'));
    await expect(createReviewer({ name: 'Omar', email: 'omar@firm.info' })).rejects.toThrow('valid email');
    expect(Organization.deleteOne).toHaveBeenCalledWith({ _id: 'org1' });
  });

  it('returns the plain password and keeps the org on success', async () => {
    (User.create as jest.Mock).mockResolvedValueOnce({});
    const { password, org } = await createReviewer({ name: 'Jane', email: 'jane@firm.com' });
    expect(password.length).toBeGreaterThanOrEqual(12);
    expect(org).toContain('Jane');
    expect(Organization.deleteOne).not.toHaveBeenCalled();
  });
});
