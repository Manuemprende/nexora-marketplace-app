import {hashPassword,uuid,transaction} from './database.mjs';
import {fail,text} from './service.mjs';

export const sections=['dashboard','summary','landings','landing-orders','live','dropea','dropi','facebook','scan','collecting','products','imports','mapping','movements','pos','integrations','mcp','settings','returns','cash'];

export function identity(db,user){
  const permissions = user.role==='admin'?[...sections,'users']:db.prepare('SELECT section FROM user_permissions WHERE user_id=? ORDER BY section').all(user.id).map(r=>r.section);
  return {
    ...user,
    operational_profile:db.prepare('SELECT operational_profile FROM users WHERE id=?').get(user.id)?.operational_profile??'operator',
    read_only_sections:user.role==='admin'?[]:db.prepare("SELECT section FROM user_permissions WHERE user_id=? AND access_mode='read'").all(user.id).map(r=>r.section),
    permissions,
    sections: permissions
  };
}

export function userList(db){return db.prepare('SELECT id,email,role,active,operational_profile FROM users').all().map(u=>identity(db,u));}

export function setUserActive(db,id,input,actor){
 if(typeof input.active!=='boolean')fail(400,'Estado de usuario inválido');
 const user=db.prepare('SELECT id,email,role,active,operational_profile FROM users WHERE id=?').get(id);
 if(!user)fail(404,'Usuario no encontrado');
 if(id===actor&&!input.active)fail(409,'No puedes desactivar tu propia cuenta');
 return transaction(db,()=>{
  db.prepare('UPDATE users SET active=? WHERE id=?').run(input.active?1:0,id);
  if(!input.active)db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
  return identity(db,{...user,active:input.active?1:0});
 });
}

export function changeUserPassword(db,id,input,actor,sessionHash=''){
 const password=text(input.password,'Contraseña',200,true);
 if(password.length<10)fail(400,'La contraseña debe tener al menos 10 caracteres');
 if(!db.prepare('SELECT id FROM users WHERE id=?').get(id))fail(404,'Usuario no encontrado');
 return transaction(db,()=>{
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(password),id);
  if(id===actor&&sessionHash)db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(id,sessionHash);
  else db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
  return {ok:true};
 });
}

export function can(user,...allowed){return user.role==='admin'||allowed.some(s=>user.permissions.includes(s));}

export function authorize(user,path,method){
 if(user.role==='admin')return;
 if(path.startsWith('/api/demand-alerts')){if(user.role!=='admin')fail(403,'Solo el administrador gestiona las alertas de demanda');return;}
 if(path==='/api/cash/sale-notifications/read'&&method==='POST'){if(!can(user,'cash'))fail(403,'Solo caja puede gestionar estos avisos');return;}
 if(path==='/api/users'||/^\/api\/users\//.test(path)){if(user.role!=='admin')fail(403,'Solo el administrador gestiona usuarios');return;}

 let required=[];

 if(path.startsWith('/api/integrations/dropi-web/')){if(user.role!=='admin')fail(403,'Solo el administrador gestiona Dropi web');return;}
 else if(path.startsWith('/api/integrations/whatsapp/')){if(user.role!=='admin')fail(403,'Solo un administrador conecta WhatsApp');return;}
 else if(path==='/api/whatsapp/status')required=['pos','settings'];
 else if(path.startsWith('/api/order-previews/'))required=['scan'];
 else if(path.startsWith('/api/packing-support'))required=['scan','collecting'];
 else if(path==='/api/cash/status')required=['pos','cash'];
 else if(path.startsWith('/api/cash/'))required=['cash'];
 else if(path==='/api/publication-options')required=['products'];
 else if(path.startsWith('/api/order-sync/'))required=['scan','integrations'];
 else if(path.startsWith('/api/facto/'))required=['integrations','settings'];
 else if(path==='/api/customers'||path.startsWith('/api/customers/'))required=['pos'];
 else if(path.startsWith('/api/channel-catalog'))required=['mapping'];
 else if(path==='/api/returns'||path==='/api/return-sources')required=['returns'];
 else if(path==='/api/pos/featured'){if(method!=='GET'&&user.role!=='admin')fail(403,'Solo el administrador configura los destacados');required=['pos'];}
 else if(path.startsWith('/api/pos/'))required=['pos'];
 else if(path==='/api/business-settings')required=method==='GET'?['settings','pos']:['settings'];
 else if(/\/policy$/.test(path)||path.startsWith('/api/published-stock/'))required=['products'];
 else if(path==='/api/search')required=['scan','pos'];
 else if((path==='/api/images'||path.startsWith('/api/images/'))&&method==='POST')required=['products'];
 else if(path==='/api/categories')required=method==='GET'?['products','pos','mapping','dashboard','summary','integrations']:['products'];
 else if(path==='/api/catalog'||/^\/api\/catalog\/[^/]+$/.test(path))required=method==='GET'?['products','pos','mapping','dashboard','summary','integrations','live','dropea','dropi','facebook']:['products'];
 else if(path==='/api/orders')required=method==='GET'?['scan','dashboard','summary','integrations']:['scan'];
 else if(path.startsWith('/api/orders/'))required=['scan'];
 else if(path.startsWith('/api/imports'))required=['imports'];
 else if(/\/stock$/.test(path)||/^\/api\/variants\/[^/]+$/.test(path))required=['products'];
 else if(/\/codes$/.test(path)||path.startsWith('/api/codes/'))required=['mapping'];
 else if(path==='/api/movements')required=['movements','dashboard','summary'];
 else if(path==='/api/sales'||path.startsWith('/api/sales/'))required=method==='GET'?['pos','dashboard','summary','integrations']:['pos'];
 else if(path==='/api/dashboard')required=['dashboard','summary'];
 else if(path.startsWith('/api/landings')||path.startsWith('/api/radar'))required=['landings','landing-orders','live','dashboard'];
 else if(path.startsWith('/api/dropi'))required=['dropi','products','scan'];
 else if(path.startsWith('/api/facebook'))required=['facebook'];

 if(method!=='GET'&&user.role!=='admin'&&required.length&&required.every(s=>!user.permissions.includes(s)||user.read_only_sections?.includes(s)))fail(403,'Esta sección tiene permiso de solo lectura');
 if(path==='/api/business-settings'&&method!=='GET'&&!can(user,'settings'))fail(403,'Solo configuración puede editar datos de empresa');
 if(required.length&&!can(user,...required))fail(403,'No tienes acceso a esta sección');
 if((path==='/api/orders'&&method==='POST'||path==='/api/orders/demo'||/^\/api\/orders\/[^/]+\/cancel$/.test(path))&&user.role!=='admin')fail(403,'Solo el administrador puede gestionar estos pedidos');
}

export function saveUser(db,input,id=null,actor=null){
 const role=input.role==='admin'?'admin':['operator','packer','collector'].includes(input.role)?'packer':null;const profile=role==='admin'?'operator':input.role==='collector'?'collector':input.role==='packer'?'packer':input.operational_profile??'operator';if(!['operator','packer','collector'].includes(profile))fail(400,'Perfil operativo inválido');if(!role)fail(400,'Perfil inválido');
 const permissions=role==='admin'?[]:(input.permissions??input.sections);
 if(!Array.isArray(permissions)||permissions.some(s=>!sections.includes(s))||new Set(permissions).size!==permissions.length||role!=='admin'&&!permissions.length)fail(400,'Selecciona al menos una sección válida');
 if(role!=='admin'&&permissions.includes('cash')&&!permissions.includes('pos'))fail(400,'El permiso de caja requiere acceso al punto de venta');
 const readOnly=input.read_only_sections??[];if(!Array.isArray(readOnly)||readOnly.some(s=>!permissions.includes(s)))fail(400,'Permisos de lectura inválidos');
 const email=text(input.email,'Correo',254,true).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Correo inválido');
 const active=input.active===false?0:1;
 if(id&&id===actor&&(role!=='admin'||!active))fail(409,'No puedes quitarte tu acceso de administrador');
 const existing=id?db.prepare('SELECT * FROM users WHERE id=?').get(id):null;if(id&&!existing)fail(404,'Usuario no encontrado');
 if(!id){const password=text(input.password,'Contraseña',200,true);if(password.length<10)fail(400,'La contraseña debe tener al menos 10 caracteres');}
 return transaction(db,()=>{
  const userId=id??uuid();
  if(id)db.prepare('UPDATE users SET email=?,role=?,active=? WHERE id=?').run(email,role,active,userId);
  else db.prepare('INSERT INTO users(id,email,password_hash,role,active) VALUES (?,?,?,?,?)').run(userId,email,hashPassword(text(input.password,'Contraseña',200,true)),role,active);
  db.prepare('UPDATE users SET operational_profile=? WHERE id=?').run(profile,userId);
  db.prepare('DELETE FROM user_permissions WHERE user_id=?').run(userId);
  for(const section of permissions)db.prepare('INSERT INTO user_permissions(user_id,section,access_mode) VALUES (?,?,?)').run(userId,section,readOnly.includes(section)?'read':'manage');
  if(!active)db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
  return identity(db,{id:userId,email,role,active,operational_profile:profile});
 });
}

export function authorizeSupportAction(user,action){
 const section=['claim','release','deliver','not_found'].includes(action)?'collecting':'scan';
 if(user.role!=='admin'&&(!user.permissions.includes(section)||user.read_only_sections?.includes(section)))fail(403,section==='collecting'?'Necesitas permiso para gestionar recolección':'Necesitas permiso para gestionar empaque');
}
