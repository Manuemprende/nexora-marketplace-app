import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';

export function sessionUsable(session,time=Date.now()){
  try{const claims=JSON.parse(Buffer.from(session.token.split('.')[1],'base64url').toString());return Number.isSafeInteger(session.user?.id)&&typeof claims.exp==='number'&&claims.exp*1000>time+600000;}catch{return false;}
}
export async function getDropiSession({file='data/dropi-auth.json',email=process.env.DROPI_EMAIL,password=process.env.DROPI_PASSWORD,fetchImpl=fetch}={}){
  let cached;try{cached=JSON.parse(await readFile(file,'utf8'));}catch{}
  if(sessionUsable(cached))return cached;
  if(!email||!password)throw new Error('Sesión Dropi vencida: configura DROPI_EMAIL y DROPI_PASSWORD en el servidor para renovarla');
  const response=await fetchImpl('https://api-v2.dropi.cl/bff/auth/core/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://app.dropi.cl',Referer:'https://app.dropi.cl/'},body:JSON.stringify({email,password,white_brand_id:4}),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`Login Dropi HTTP ${response.status}; se detuvo sin reintentar credenciales`);
  const result=await response.json(),data=result.data??result,user=data.objects??data.user;
  if(!(result.is_successful??result.isSuccess)||!data.token||!Number.isSafeInteger(user?.id))throw new Error('Dropi requiere intervención para iniciar sesión; no se harán intentos repetidos');
  const session={token:data.token,user:{id:user.id,role:user.roleuser?.name,type:user.type_user,parent_id:user.parent_seller?.id??user.parent_seller_id},obtained_at:new Date().toISOString()};
  if(cached?.user?.id&&cached.user.id!==session.user.id)throw new Error('La sesión renovada pertenece a otra cuenta; se detuvo la captura');
  if(!sessionUsable(session))throw new Error('Dropi no entregó una sesión de datos vigente; revisar segundo factor o acceso');
  await mkdir(dirname(file),{recursive:true});await writeFile(file+'.tmp',JSON.stringify(session),{mode:0o600});await rename(file+'.tmp',file);
  return session;
}
