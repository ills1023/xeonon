import {cp,mkdir,rm,readFile,writeFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const output=resolve(root,'dist');
if(!output.startsWith(root+sep))throw new Error('Build output must stay inside the project folder.');
await import('./generate-product-pages.mjs');
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
for(const path of ['index.html','product.html','team.html','404.html','style.css','product.css','catalog.json','images','products','clips.stl','dock_headphones.stl','src/storefront.js','src/card-viewer.js','src/product-page.js','src/team.js'])
  await cp(resolve(root,path),resolve(output,path),{recursive:true,force:true});
let localConfig={};
try {
  const source=await readFile(resolve(root,'config.js'),'utf8');
  const url=source.match(/supabaseUrl\s*:\s*['"]([^'"]*)['"]/);
  const key=source.match(/supabaseAnonKey\s*:\s*['"]([^'"]*)['"]/);
  if(url)localConfig.supabaseUrl=url[1];
  if(key)localConfig.supabaseAnonKey=key[1];
} catch {}
const publicConfig={
  supabaseUrl:process.env.SUPABASE_URL||localConfig.supabaseUrl||'',
  supabaseAnonKey:process.env.SUPABASE_ANON_KEY||localConfig.supabaseAnonKey||''
};
await writeFile(resolve(output,'config.js'),`window.FORMA_CONFIG = ${JSON.stringify(publicConfig)};\n`);
console.log(`Static storefront built at ${output}`);

