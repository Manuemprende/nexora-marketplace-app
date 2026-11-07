import {createHash} from 'node:crypto';
export const dropeaIdempotencyKey=(stamp,id)=>'meibo_'+createHash('sha256').update(JSON.stringify([stamp,id])).digest('hex');
