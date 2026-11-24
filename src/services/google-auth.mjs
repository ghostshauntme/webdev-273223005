import {
  findGoogleAccount,
  findUserByEmail,
  linkGoogleAccount,
  withTransaction
} from '../data/db.mjs';

export function resolveGoogleUser(
  db, profile, currentUser = null, confirmed = false
) {
  if (!profile ||
      typeof profile.sub !== 'string' ||
      !profile.sub ||
      profile.email_verified !== true ||
      typeof profile.email !== 'string') {
    throw new Error('Google identity is not verified');
  }

  return withTransaction(db, () => {
    const linked = findGoogleAccount(db, profile.sub);

    if (linked) {
      if (currentUser && linked.id !== currentUser.id) {
        throw new Error('Google account belongs to another user');
      }

      return linked;
    }

    const existing = findUserByEmail(
      db, profile.email.trim().toLowerCase()
    );

    if (!existing ||
        !currentUser ||
        existing.id !== currentUser.id ||
        !confirmed) {
      throw new Error('Account linking requires confirmation');
    }

    linkGoogleAccount(db, profile.sub, existing.id);

    return findGoogleAccount(db, profile.sub);
  });
}
