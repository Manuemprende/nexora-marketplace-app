import { DatabaseSync } from 'node:sqlite';
const name=new Date().toISOString().replace(/[:.]/g,'-');
const db=new DatabaseSync('/var/lib/nexora/nexora.sqlite');
db.exec(`VACUUM INTO '/var/backups/nexora/nexora-${name}.sqlite'`);
db.close();
