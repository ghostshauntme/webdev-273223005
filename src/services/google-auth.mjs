import {
  findGoogleAccount,
  findUserByEmail,
  linkGoogleAccount,
  lockGoogleAccounts,
  withTransaction
} from '../data/db.mjs';

export async function resolveGoogleUser(
  db, profile, currentUser = null, confirmed = false
) {
  if (!profile ||
      typeof profile.sub !== 'string' ||
      !profile.sub ||
      profile.email_verified !== true ||
      typeof profile.email !== 'string') {
    throw new Error('Google identity is not verified');
  }

  return withTransaction(db, async (db) => {
    await lockGoogleAccounts(db);
    const linked = await findGoogleAccount(db, profile.sub);

    if (linked) {
      if (currentUser && linked.id !== currentUser.id) {
        throw new Error('Google account belongs to another user');
      }

      return linked;
    }

    const existing = await findUserByEmail(
      db, profile.email.trim().toLowerCase()
    );

    if (!existing ||
        !currentUser ||
        existing.id !== currentUser.id ||
        !confirmed) {
      throw new Error('Account linking requires confirmation');
    }

    await linkGoogleAccount(db, profile.sub, existing.id);

    return await findGoogleAccount(db, profile.sub);
  });
}
