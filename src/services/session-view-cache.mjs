import LZString from 'lz-string';
// Display data survives an overnight break. Authentication is still checked separately.
const prefix='meibo-view-v2:',lifetime=24*3600000,sessionLifetime=8*3600000;
export function accessKey(user){return user?JSON.stringify([user.id,user.role,[...(user.permissions??[])].sort(),[...(user.read_only_sections??[])].sort()]):null;}
function normalizedOwner(value){try{const [id,role,permissions,read_only_sections]=JSON.parse(value);return accessKey({id,role,permissions,read_only_sections});}catch{return null;}}
function owner(storage){try{const w=JSON.parse(storage.getItem('meibo-workspace')||'null');return w?.user&&Date.now()-w.time<sessionLifetime?accessKey(w.user):null;}catch{return null;}}
export function readViewCache(key,storage=globalThis.sessionStorage){try{const o=owner(storage),raw=storage.getItem(prefix+key),c=JSON.parse(raw||'null');if(!o||normalizedOwner(c?.owner)!==o||Date.now()-c.time>=lifetime)return null;const previous=memo.get(prefix+key);if(previous?.raw===raw)return previous.value;const value=c.codec==='lz-utf16'?JSON.parse(LZString.decompressFromUTF16(c.value)):c.value;memo.set(prefix+key,{raw,value});return value;}catch{return null;}}
const memo=new Map(),pending=new Map(),latestWrite=new Map();let worker,sequence=0;
function commit(key,encoded,storage){
 try{storage.setItem(prefix+key,encoded);memo.delete(prefix+key);return true;}catch{
  try{storage.removeItem('meibo-catalog-cache');storage.removeItem(prefix+'workspace-data');const victims=[];
   for(let i=0;i<storage.length;i++){const k=storage.key(i);if(k?.startsWith(prefix)&&k!==prefix+key&&!k.startsWith(prefix+'workspace-')&&k!==prefix+'pos-draft'){let time=0;try{time=JSON.parse(storage.getItem(k)).time??0;}catch{}victims.push({k,time});}}
   victims.sort((a,b)=>a.time-b.time);for(let i=-1;i<victims.length;i++){if(i>=0)storage.removeItem(victims[i].k);try{storage.setItem(prefix+key,encoded);memo.delete(prefix+key);return true;}catch{}}
  }catch{}return false;
 }
}
function encode(o,json){return JSON.stringify({owner:o,time:Date.now(),codec:'lz-utf16',value:LZString.compressToUTF16(json)});}
export function writeViewCache(key,value,storage=globalThis.sessionStorage){try{
 const o=owner(storage);if(!o)return false;const json=JSON.stringify(value),id=++sequence;latestWrite.set(key,id);
 if(key!=='pos-draft'&&json.length>250000&&typeof Worker!=='undefined'){
  if(!worker){worker=new Worker(new URL('./view-cache-worker.mjs',import.meta.url),{type:'module'});worker.onmessage=event=>{const item=pending.get(event.data.id);pending.delete(event.data.id);if(item&&latestWrite.get(item.key)===event.data.id&&owner(item.storage)===item.owner)commit(item.key,event.data.encoded,item.storage);};worker.onerror=()=>{worker.terminate();worker=null;for(const [id,item] of pending){if(latestWrite.get(item.key)===id&&owner(item.storage)===item.owner)commit(item.key,encode(item.owner,item.json),item.storage);}pending.clear();};}
  pending.set(id,{key,storage,owner:o,json});worker.postMessage({id,owner:o,json});return true;
 }
 return commit(key,encode(o,json),storage);
}catch{return false;}}
export function hasViewCache(key,storage=globalThis.sessionStorage){try{const c=JSON.parse(storage.getItem(prefix+key)||'null');return !!c&&normalizedOwner(c.owner)===owner(storage)&&Date.now()-c.time<lifetime;}catch{return false;}}
export function touchViewCache(key,storage=globalThis.sessionStorage){try{
 const raw=storage.getItem(prefix+key),c=JSON.parse(raw||'null'),o=owner(storage);if(!o||normalizedOwner(c?.owner)!==o)return false;
 if(Date.now()-c.time<60000)return true;c.time=Date.now();const encoded=JSON.stringify(c);storage.setItem(prefix+key,encoded);const previous=memo.get(prefix+key);if(previous?.raw===raw)memo.set(prefix+key,{...previous,raw:encoded});return true;
}catch{return false;}}
// Call only with a session confirmed by the API. Old identity metadata is never
// sufficient to restore another user's data or bypass changed permissions.
export function acceptWorkspaceSession(user,defaults,storage=globalThis.sessionStorage){
 let previous;try{previous=JSON.parse(storage.getItem('meibo-workspace')||'null')?.user;}catch{}
 if(!user||accessKey(previous)!==accessKey(user)||previous?.operational_profile!==user?.operational_profile)clearViewCaches(storage);
 if(user)storage.setItem('meibo-workspace',JSON.stringify({user,time:Date.now()}));else storage.removeItem('meibo-workspace');
 return {data:readWorkspaceData(defaults,storage),loaded:Object.fromEntries(Object.keys(defaults).map(k=>[k,hasViewCache('workspace-'+k,storage)]))};
}
export function clearViewCaches(storage=globalThis.sessionStorage){memo.clear();latestWrite.clear();pending.clear();try{for(let i=storage.length-1;i>=0;i--){const key=storage.key(i);if(key?.startsWith(prefix)||key==='meibo-catalog-cache')storage.removeItem(key);}}catch{}}
export function readWorkspaceData(defaults,storage=globalThis.sessionStorage){const legacy=readViewCache('workspace-data',storage);const data={...defaults};for(const key of Object.keys(defaults)){const value=readViewCache('workspace-'+key,storage)??legacy?.[key];if(value!==null&&value!==undefined)data[key]=value;}return data;}
