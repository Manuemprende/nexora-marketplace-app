const chileDay = value => new Intl.DateTimeFormat('sv-SE', {timeZone:'America/Santiago'}).format(new Date(value));
export function packageCounts(orders, current=new Date()) {
  const today=chileDay(current),onDay=value=>value&&chileDay(value)===today;
  return {
    arrived:orders.filter(o=>onDay(o.created_at)).length,
    ready:orders.filter(o=>o.status==='packed'&&onDay(o.packed_at)).length,
    pending:orders.filter(o=>['pending','packing'].includes(o.status)).length,
    cancelled:orders.filter(o=>o.status==='cancelled'&&o.events?.some(e=>e.action==='cancelled'&&onDay(e.created_at))).length,
    blocked:orders.filter(o=>['pending','packing'].includes(o.status)&&o.stock_issues?.length).length,
  };
}
export function packageComparison(orders,current=new Date()){
 const today=chileDay(current),yesterdayDate=new Date(today+'T12:00:00Z');yesterdayDate.setUTCDate(yesterdayDate.getUTCDate()-1);
 const arrivals=orders.filter(o=>chileDay(o.created_at)===today),completed=arrivals.filter(o=>o.status==='packed').length;
 return {today:packageCounts(orders,current),yesterday:packageCounts(orders,yesterdayDate),cohortReady:completed,cohortRate:arrivals.length?Math.round(completed/arrivals.length*100):null};
}
