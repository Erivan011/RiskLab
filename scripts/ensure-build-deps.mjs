import {spawnSync} from 'node:child_process';
// The existing Render build command is `npm run build`. Install the lockfile
// only when its build dependencies are absent (e.g. production-only installs).
try {for(const name of ['vite','@tailwindcss/postcss','react','recharts'])import.meta.resolve(name);}
catch {const result=spawnSync('npm',['ci','--include=dev'],{stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);}
