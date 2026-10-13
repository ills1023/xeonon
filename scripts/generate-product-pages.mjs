import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const staticProducts=JSON.parse(await readFile(resolve(root,'catalog.json'),'utf8'));
const siteUrl=(process.env.SITE_URL||'https://forma-object-marketplace.onrender.com').replace(/\/$/,'');
let databaseProducts=[];
const supabaseUrl=process.env.SUPABASE_URL,supabaseKey=process.env.SUPABASE_ANON_KEY;
if(supabaseUrl&&supabaseKey){
  try{
    const endpoint=new URL('/rest/v1/products',supabaseUrl);
    endpoint.searchParams.set('select','slug,title,description,category,price,weight_kg,dimensions,image_url,model_url,published');
    endpoint.searchParams.set('published','eq.true');
    const response=await fetch(endpoint,{headers:{apikey:supabaseKey,Authorization:`Bearer ${supabaseKey}`},signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error(`Supabase returned HTTP ${response.status}`);
    databaseProducts=(await response.json()).map(row=>({slug:row.slug,title:row.title,description:row.description,category:row.category,price:Number(row.price),weight:Number(row.weight_kg),dimensions:row.dimensions||{},image:row.image_url||'',model:row.model_url||''}));
  }catch(error){console.warn(`SEO product sync skipped: ${error.message}`);}
}
const bySlug=new Map(staticProducts.map(item=>[item.slug,item]));
for(const item of databaseProducts)bySlug.set(item.slug,item);
const products=[...bySlug.values()];
await rm(resolve(root,'products'),{recursive:true,force:true});
await mkdir(resolve(root,'products'),{recursive:true});
const textFor=(value,locale='en')=>typeof value==='string'?value:(value?.[locale]||value?.en||value?.ru||'');
const template=await readFile(resolve(root,'product.html'),'utf8');
const jsonSafe=value=>JSON.stringify(value).replaceAll('</','<\\/');
const homePath=resolve(root,'index.html');
let home=await readFile(homePath,'utf8');
home=home.replace(/(<script type="application\/json" id="catalogData">).*?(<\/script>)/s,(_,open,close)=>open+jsonSafe(products)+close);
await writeFile(homePath,home);
for(const original of products){
  const product={...original};
  if(product.model){try{product.modelData=(await readFile(resolve(root,product.model))).toString('base64')}catch{}}
  const title=textFor(product.title),description=textFor(product.description);
  const escapedTitle=title.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const escapedDescription=description.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const route=`/products/${product.slug}/`;
  const schema={"@context":"https://schema.org","@type":"Product",name:title,description,sku:product.slug,url:`${siteUrl}${route}`};
  if(product.image)schema.image=/^https?:\/\//i.test(product.image)?product.image:`${siteUrl}/${product.image.replace(/^\//,'')}`;
  if(Number.isFinite(Number(product.price)))schema.offers={"@type":"Offer",price:Number(product.price).toFixed(2),priceCurrency:"EUR",url:`${siteUrl}${route}`};
  let page=template.replace('<head>','<head><base href="../../">');
  page=page.replace('<title>Товар — FORMA</title>',`<title>${escapedTitle} — FORMA</title>`);
  page=page.replace('<meta name="description" content="FORMA — предметный дизайн и объекты для повседневной жизни">',`<meta name="description" content="${escapedDescription}"><meta name="robots" content="index,follow,max-image-preview:large"><meta property="og:type" content="product"><meta property="og:title" content="${escapedTitle} — FORMA"><meta property="og:description" content="${escapedDescription}"><meta property="og:url" content="${siteUrl}${route}"><link rel="canonical" href="${siteUrl}${route}"><script type="application/ld+json">${jsonSafe(schema)}</script>`);
  page=page.replace('<script type="application/json" id="productData">{}</script>',`<script type="application/json" id="productData">${jsonSafe(product)}</script>`);
  const target=resolve(root,'products',product.slug,'index.html');
  await mkdir(resolve(root,'products',product.slug),{recursive:true});
  await writeFile(target,page);
}
console.log(`Generated ${products.length} product pages.`);

