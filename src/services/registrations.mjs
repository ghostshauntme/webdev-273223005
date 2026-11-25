
import {
  findEventById,
  lockEvent,
  countRegistrations,
  findRegistration,
  insertRegistration,
  deleteRegistration,
    withTransaction,
  getUserRegistrations
} from '../data/db.mjs';

export class RegistrationError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'RegistrationError';
    this.status = status;
  }
}

export function registerForEvent(db, userId, eventId) {
  return withTransaction(db, async (db) => {
    await lockEvent(db, eventId);
    const event = await findEventById(db, eventId);

    if (!event) {
      throw new RegistrationError('Event not found', 404);
    }

    if (Date.parse(event.start_at) <= Date.now()) {
      throw new RegistrationError('This event has already started', 409);
    }

    if (await findRegistration(db, userId, eventId)) {
      throw new RegistrationError('Already registered', 409);
    }

    if (await countRegistrations(db, eventId) >= event.capacity) {
      throw new RegistrationError('This event is full', 409);
    }

    return await insertRegistration(db, userId, eventId);
  });
}

export function cancelRegistration(db, userId, eventId) {
  return withTransaction(db, async (db) => {
    await lockEvent(db, eventId);
    if (!(await findRegistration(db, userId, eventId))) {
      throw new RegistrationError(
        'You can only cancel your own registration',
        403
      );
    }

    await deleteRegistration(db, userId, eventId);

    return { cancelled: true };
  });
}

export async function listMyRegistrations(db, userId) {
  return getUserRegistrations(db, userId);
}
