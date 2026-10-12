import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const products=JSON.parse(await readFile(resolve(root,'catalog.json'),'utf8'));
const template=await readFile(resolve(root,'product.html'),'utf8');
const jsonSafe=value=>JSON.stringify(value).replaceAll('</','<\\/');
const homePath=resolve(root,'index.html');
let home=await readFile(homePath,'utf8');
home=home.replace(/(<script type="application\/json" id="catalogData">).*?(<\/script>)/s,(_,open,close)=>open+jsonSafe(products)+close);
await writeFile(homePath,home);
for(const original of products){
  const product={...original};
  if(product.model){try{product.modelData=(await readFile(resolve(root,product.model))).toString('base64')}catch{}}
  const escapedTitle=product.title.en.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const escapedDescription=product.description.en.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const route=`/products/${product.slug}/`;
  const schema={"@context":"https://schema.org","@type":"Product",name:product.title.en,description:product.description.en,sku:product.slug};
  if(product.image)schema.image=`/${product.image}`;
  let page=template.replace('<head>','<head><base href="../../">');
  page=page.replace('<title>Товар — FORMA</title>',`<title>${escapedTitle} — FORMA</title>`);
  page=page.replace('<meta name="description" content="FORMA — предметный дизайн и объекты для повседневной жизни">',`<meta name="description" content="${escapedDescription}"><meta property="og:type" content="product"><meta property="og:title" content="${escapedTitle} — FORMA"><meta property="og:description" content="${escapedDescription}"><script type="application/ld+json">${JSON.stringify(schema)}</script>`);
  page=page.replace('<script type="application/json" id="productData">{}</script>',`<script type="application/json" id="productData">${jsonSafe(product)}</script>`);
  const target=resolve(root,'products',product.slug,'index.html');
  await mkdir(resolve(root,'products',product.slug),{recursive:true});
  await writeFile(target,page);
}
console.log(`Generated ${products.length} product pages.`);

