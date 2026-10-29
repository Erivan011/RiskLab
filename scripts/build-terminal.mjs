import {build} from 'vite';
import {readFile,writeFile,readdir,copyFile,rm} from 'node:fs/promises';
await build({root:'frontend',configFile:'frontend/vite.config.mjs'});
const html=await readFile('web/react-build/index.html','utf8');
for(const f of await readdir('web/react-build'))if(f!=='index.html')await copyFile('web/react-build/'+f,'web/'+f);
await writeFile('web/terminal.html',html);
await rm('web/react-build',{recursive:true});
