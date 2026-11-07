import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { hashPassword } from '../server/database.mjs';

// Runs once, on the unpublished copy of the local database.
const db = new DatabaseSync('/var/lib/nexora/nexora.sqlite');
const accounts = ['admin@nexora.io', 'empaque@nexora.io'];
const access = [];
db.exec('BEGIN IMMEDIATE');
try {
  db.exec('DELETE FROM sessions');
  db.prepare('UPDATE users SET active=0 WHERE email NOT IN (?,?)').run(...accounts);
  for (const email of accounts) {
    const password = randomBytes(24).toString('base64url');
    const result = db.prepare('UPDATE users SET active=1,password_hash=? WHERE email=?').run(hashPassword(password), email);
    if (result.changes !== 1) throw new Error(`Missing account: ${email}`);
    access.push(`${email}: ${password}`);
  }
  writeFileSync('/etc/nexora/access.txt', `https://nexora.wentixai.cyou\n${access.join('\n')}\n`, { mode: 0o600, flag: 'wx' });
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
} finally { db.close(); }
