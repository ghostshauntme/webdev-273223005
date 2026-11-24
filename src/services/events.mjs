import { getUpcomingEvents, insertEvent } from '../data/db.mjs';

export function listUpcomingEvents(db) {
  return getUpcomingEvents(db);
}

export class EventError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function createEvent(db, user, input) {
  if (!user) {
    throw new EventError(401, 'Sign in first');
  }

  if (user.role !== 'organizer') {
    throw new EventError(403, 'Organizers only');
  }

  const title = typeof input?.title === 'string'
    ? input.title.trim() : '';

  const date = typeof input?.date === 'string'
    ? Date.parse(input.date) : NaN;

  const capacity = input?.capacity;
  const location = input?.location ?? '';

  if (typeof location !== 'string' || location.length > 200) {
    throw new EventError(400, 'Invalid event location');
  }

  if (!title || title.length > 200 ||
      !Number.isFinite(date) || date <= Date.now() ||
      !Number.isSafeInteger(capacity) || capacity <= 0) {
    throw new EventError(400, 'Invalid event details');
  }

  return insertEvent(
    db, title, new Date(date).toISOString(), capacity, location.trim()
  );
}
