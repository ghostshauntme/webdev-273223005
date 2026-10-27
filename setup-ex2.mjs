// Merge Exercise 2 app scripts into the student's existing Exercise 1 package.
// This intentionally does not replace mcp-server/ or previous dependencies.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const pkgFile = 'package.json';
let pkg = existsSync(pkgFile) ? JSON.parse(readFileSync(pkgFile, 'utf8')) : {};
pkg.name ??= 'student-club-events';
pkg.version ??= '1.0.0';
pkg.private = true;
pkg.type ??= 'module';
pkg.scripts ??= {};
pkg.scripts.start = 'node src/server.mjs';
pkg.scripts.test = 'node --test test/*.test.mjs';
pkg.scripts.setup = 'node scripts/seed-account.mjs';
pkg.scripts.mcp ??= 'node mcp-server/server.js';
writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
const ignorePath = '.gitignore';
const ignore = existsSync(ignorePath) ? readFileSync(ignorePath, 'utf8') : '';
const additions = ['node_modules/', 'data/', '.env'];
const missing = additions.filter((entry) => !ignore.split(/\r?\n/).includes(entry));
if (missing.length) writeFileSync(ignorePath, ignore.trimEnd() + '\n' + missing.join('\n') + '\n');
console.log('Exercise 2 files and npm scripts are ready. Existing MCP server preserved.');
