'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'style.css'),'utf8');
const script=fs.readFileSync(path.join(root,'app.js'),'utf8');

test('aplicação frontend continua JavaScript válido',()=>{
 assert.doesNotThrow(()=>new Function('document','fetch','Option','setInterval',script));
});
test('interface expõe controles essenciais e sem IDs duplicados',()=>{
 const required=['updated','total','remote','local','intern','search','level','mode','source',
   'location','period','sort','priority-location','category','experience-filter',
   'score-range','profile-match','clear-filters','quick-tags','jobs','count','filter-summary'];
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 for(const id of required)assert.ok(ids.includes(id),'controle ausente: '+id);
 assert.equal(new Set(ids).size,ids.length,'IDs HTML duplicados');
});
test('frontend preserva carregamento seguro do arquivo real',()=>{
 assert.match(script,/fetch\(\`\.\x2fdata\x2fvagas\.json\?t=/);
 assert.match(script,/Array\.isArray\(data\.vagas\)/);
 assert.match(script,/textContent\s*=/);
 assert.match(script,/noopener noreferrer/);
});
test('filtros anteriores continuam implementados',()=>{
 for(const token of ['priority-location','experience-filter','score-range','profile-match',
  'quickSearchTags','populateSelect','compatibility(job)','jobCategories(job)']){
  assert.ok(script.includes(token),token);
 }
 for(const mode of ['Remoto','Híbrido','Presencial'])assert.ok(html.includes(mode));
});
test('interface contém hierarquia semântica, status e acessibilidade',()=>{
 assert.match(html,/<main\b/);
 assert.match(html,/class="skip-link"/);
 assert.match(html,/aria-live="polite"/);
 assert.match(html,/id="oportunidades"/);
 assert.match(html,/<aside\b[^>]*id="filtros"/);
 assert.match(script,/el\('details','job-details'\)/);
 assert.match(script,/APPLICATION_STATUS\[status\]/);
 assert.match(script,/aria-valuenow/);
});
test('CSS tem telas responsivas e regras de acessibilidade',()=>{
 assert.match(css,/@media\(max-width:900px\)/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(css, /prefers-reduced-motion/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/\.cards\s*\{/);
});
