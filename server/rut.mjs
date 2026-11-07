export function validRut(value){const rut=String(value??'').replace(/[.\s-]/g,'').toUpperCase();if(!/^\d{7,8}[0-9K]$/.test(rut))return false;const body=rut.slice(0,-1);if(/^0+$/.test(body))return false;let sum=0,multiplier=2;for(const digit of [...body].reverse()){sum+=Number(digit)*multiplier;multiplier=multiplier===7?2:multiplier+1;}const result=11-sum%11;return rut.at(-1)===(result===11?'0':result===10?'K':String(result));}

export const normalizeRut=value=>String(value??'').replace(/[.\s-]/g,'').toUpperCase();
export function canonicalRut(value){const r=normalizeRut(value);return r?r.slice(0,-1)+'-'+r.slice(-1):'';}
