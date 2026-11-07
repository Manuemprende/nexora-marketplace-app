export function dropiWindow(at=Date.now()){
 const until=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
 return {from:new Date(Date.parse(until+'T12:00:00Z')-86400000).toISOString().slice(0,10),until};
}
