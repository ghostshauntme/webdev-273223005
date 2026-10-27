import { openDatabase, getAllEvents, deleteEvent, restoreEvent } from '../src/data/db.mjs';
const [command, idRaw] = process.argv.slice(2);
const id = Number(idRaw);
const db = openDatabase();
try {
  if (command === 'list') {
    for (const e of getAllEvents(db)) console.log(`${e.id} | ${e.title} | ${e.start_at} | capacity=${e.capacity}`);
  } else if ((command === 'delete' || command === 'restore') && [1, 2, 3].includes(id)) {
    const count = command === 'delete' ? deleteEvent(db, id) : restoreEvent(db, id);
    console.log(`${command}: ${count} row(s) changed for event ${id}`);
  } else {
    console.error('Usage: node scripts/db.mjs list | delete 2 | restore 2');
    process.exitCode = 1;
  }
} finally {
  db.close();
}
