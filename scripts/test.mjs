import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
const tests=readdirSync('tests').filter(f=>f.endsWith('.test.mjs')).map(f=>`tests/${f}`);
const child=spawn(process.execPath,['--test',...tests],{stdio:'inherit',env:{...process.env,NEXORA_TEST_FIXTURES:'1'}});
child.on('exit',code=>process.exit(code??1));
child.on('error',error=>{console.error(error);process.exit(1);});
