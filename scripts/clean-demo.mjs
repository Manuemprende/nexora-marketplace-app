import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function cleanDemo(db) {
  const before=db.prepare('SELECT count(*) n FROM products WHERE is_demo=0').get().n;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`CREATE TEMP TABLE demo_variants AS SELECT v.id FROM variants v JOIN products p ON p.id=v.product_id WHERE p.is_demo=1;
      CREATE TEMP TABLE demo_orders AS SELECT DISTINCT order_id id FROM order_items WHERE variant_id IN (SELECT id FROM demo_variants);
      CREATE TEMP TABLE demo_sales AS SELECT DISTINCT sale_id id FROM sale_items WHERE variant_id IN (SELECT id FROM demo_variants);`);
    const mixed=db.prepare(`SELECT (SELECT count(*) FROM order_items WHERE order_id IN (SELECT id FROM demo_orders) AND variant_id NOT IN (SELECT id FROM demo_variants)) +
      (SELECT count(*) FROM sale_items WHERE sale_id IN (SELECT id FROM demo_sales) AND variant_id NOT IN (SELECT id FROM demo_variants)) n`).get().n;
    if(mixed)throw new Error('Mixed real/test transaction detected; automatic cleanup refused');
    const removed={products:db.prepare('SELECT count(*) n FROM products WHERE is_demo=1').get().n,variants:db.prepare('SELECT count(*) n FROM demo_variants').get().n,orders:db.prepare('SELECT count(*) n FROM demo_orders').get().n,sales:db.prepare('SELECT count(*) n FROM demo_sales').get().n};
    const ids=new Set(['demo_variants','demo_orders','demo_sales'].flatMap(table=>db.prepare(`SELECT id FROM ${table}`).all().map(row=>row.id)));
    for(const op of db.prepare('SELECT request_id,fingerprint,result_json FROM operations').all()) {
      if([...ids].some(id=>op.fingerprint.includes(id)||op.result_json.includes(id)))db.prepare('DELETE FROM operations WHERE request_id=?').run(op.request_id);
    }
    db.exec(`DELETE FROM packing_events WHERE order_id IN (SELECT id FROM demo_orders);
      DELETE FROM order_items WHERE order_id IN (SELECT id FROM demo_orders);
      DELETE FROM orders WHERE id IN (SELECT id FROM demo_orders);
      DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM demo_sales);
      DELETE FROM sales WHERE id IN (SELECT id FROM demo_sales);
      UPDATE catalog_import_rows SET variant_id=NULL WHERE variant_id IN (SELECT id FROM demo_variants);
      DELETE FROM inventory_movements WHERE variant_id IN (SELECT id FROM demo_variants);
      DELETE FROM external_codes WHERE variant_id IN (SELECT id FROM demo_variants);
      DELETE FROM inventory WHERE variant_id IN (SELECT id FROM demo_variants);
      DELETE FROM variants WHERE id IN (SELECT id FROM demo_variants);
      DELETE FROM products WHERE is_demo=1;`);
    if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Foreign key check failed');
    if(db.prepare('SELECT count(*) n FROM products WHERE is_demo=0').get().n!==before)throw new Error('Real catalog changed');
    db.exec('COMMIT; DROP TABLE demo_variants; DROP TABLE demo_orders; DROP TABLE demo_sales;');
    return {...removed,realProductsPreserved:before};
  } catch(error){db.exec('ROLLBACK');throw error;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const path=process.argv[2];if(!path)throw new Error('Provide the database path');
  const db=new DatabaseSync(path);db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  const backup=`${path}.before-demo-cleanup-${Date.now()}`;
  db.exec(`VACUUM INTO '${backup.replaceAll("'","''")}'`);
  try{console.log(JSON.stringify({backup,...cleanDemo(db)}));}finally{db.close();}
}
