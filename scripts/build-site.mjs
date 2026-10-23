import {cp,mkdir,rm,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const output=resolve(root,'dist');
if(!output.startsWith(root+sep))throw new Error('Build output must stay inside the project folder.');
await import('./generate-product-pages.mjs');
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
for(const path of ['index.html','product.html','studio.html','laser.html','team.html','404.html','style.css','product.css','studio.css','catalog.json','images','src/storefront.js','src/card-viewer.js','src/model-viewer.js','src/product-page.js','src/team.js','src/studio.js','src/laser.js','products'])
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

const siteUrl=(process.env.SITE_URL||'https://forma-object-marketplace-gs4q.onrender.com').replace(/\/$/,'');
async function htmlFiles(dir){const entries=await readdir(dir,{withFileTypes:true});const files=[];for(const entry of entries){const full=resolve(dir,entry.name);if(entry.isDirectory())files.push(...await htmlFiles(full));else if(entry.name.endsWith('.html'))files.push(full);}return files;}
for(const file of await htmlFiles(output)){
  const relative=file.slice(output.length+1).replaceAll('\\','/');
  const isHidden=['team.html','404.html','product.html'].includes(relative);
  let route=relative.endsWith('/index.html')?`/${relative.slice(0,-'index.html'.length)}`:relative==='index.html'?'/':`/${relative}`;
  let html=await readFile(file,'utf8');
  html=html.replace(/<link\s+rel=["']canonical["'][^>]*>/gi,'');
  html=html.replace(/<meta\s+property=["']og:(?:url|type|title|description)["'][^>]*>/gi,'');
  html=html.replace(/<meta\s+name=["']robots["'][^>]*>/gi,'');
  const description=html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i)?.[1]||'FORMA Object Lab — 3D printing and small-batch design objects.';
  const title=html.match(/<title>(.*?)<\/title>/i)?.[1]||'FORMA Object Lab';
  const headBits=isHidden
    ? '<meta name="robots" content="noindex,nofollow">'
    : `<meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="${siteUrl}${route}"><meta property="og:url" content="${siteUrl}${route}"><meta property="og:type" content="website"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}">`;
  html=html.replace('</head>',`${headBits}</head>`);
  if(relative==='index.html'){
    const organization={"@context":"https://schema.org","@type":"Organization",name:"FORMA Object Lab",url:`${siteUrl}/`,logo:`${siteUrl}/images/architect-miniature.webp`};
    const website={"@context":"https://schema.org","@type":"WebSite",name:"FORMA Object Lab",url:`${siteUrl}/`,inLanguage:["ru","de","en"]};
    html=html.replace('</head>',`<script type="application/ld+json">${JSON.stringify(organization)}</script><script type="application/ld+json">${JSON.stringify(website)}</script></head>`);
  }
  await writeFile(file,html);
}
const sitemapPages=['/','/studio.html','/laser.html'];
for(const file of await htmlFiles(resolve(output,'products'))){
  const relative=file.slice(output.length+1).replaceAll('\\','/');
  sitemapPages.push(`/${relative.replace(/index\.html$/,'')}`);
}
const sitemap=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...new Set(sitemapPages)].map(route=>`  <url><loc>${siteUrl}${route}</loc></url>`).join('\n')}\n</urlset>\n`;
await writeFile(resolve(output,'sitemap.xml'),sitemap);
await writeFile(resolve(output,'robots.txt'),`User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`);

