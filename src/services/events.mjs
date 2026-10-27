import { getUpcomingEvents } from '../data/db.mjs';

export function listUpcomingEvents(db) {
  return getUpcomingEvents(db);
}
