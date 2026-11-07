import {readFile} from 'node:fs/promises';
// Connection status only. Saving a key or fetching the public WSDL must never
// imply production authentication or enable tax-document issuance.
export async function factoStatus(){
 let config;try{config=JSON.parse(await readFile(process.env.MEIBO_FACTO_CONFIG??'/data/facto-credentials.json','utf8'));}catch{return {provider:'Facto',configured:false,production_enabled:false,production_verified:false,mode:'disabled',demo:null};}
 return {provider:'Facto',protocol:'SOAP',configured:!!(config.username&&config.password),production_enabled:false,production_verified:false,mode:'demo',demo:config.demo?{ok:config.demo.ok===true,tested_at:config.demo.tested_at,folio:config.demo.folio,pdf_url:config.demo.pdf_url}:null};
}
