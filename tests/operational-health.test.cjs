'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const js=fs.readFileSync(path.join(root,'app.js'),'utf8');
const wf=name=>JSON.parse(fs.readFileSync(path.join(root,'n8n',name+'.json'),'utf8'));

function functionSource(startName,endName){
 const start=js.indexOf('function '+startName+'('),end=js.indexOf('function '+endName+'(',start);
 assert.ok(start>=0&&end>start,startName);
 return js.slice(start,end);
}
const health=new Function(functionSource('monitoringStatus','displayMonitoring')+'; return monitoringStatus;')();

test('monitoramento distingue data de mudança e última sincronização',()=>{
 assert.match(html,/id="monitor-sync"/);
 assert.match(html,/id="monitor-change"/);
 assert.match(html,/id="monitor-sources"/);
 assert.match(html,/id="monitor-source-list"/);
 assert.match(js,/dateValue\(data\.ultimaSincronizacao\)/);
 assert.match(js,/fmt\(data\.atualizadoEm\)/);
});
test('diagnósticos: sucesso, parcial, desatualizado, desconhecido',()=>{
 const now=Date.parse('2026-11-13T12:00:00Z');
 const fresh={ultimaSincronizacao:'2026-11-13T11:00:00Z',
 diagnosticosFontes:[{name:'Github',ok:true},{name:'Adzuna',ok:true}]};
 assert.equal(health(fresh,now).state,'ok');
 assert.equal(health({...fresh,diagnosticosFontes:[{ok:true},{ok:false}]},now).state,'partial');
 assert.equal(health({...fresh,ultimaSincronizacao:'2026-11-11T12:00:00Z'},now).state,'stale');
 assert.equal(health({ultimaSincronizacao:'2026-11-13T11:00:00Z'},now).state,'unknown');
 assert.equal(health({...fresh,ultimaSincronizacao:'3000-01-01T00:00:00Z'},now).state,'unknown');
});
test('preferir score do pipeline e calcular provisoriamente no legado',()=>{
 const f=functionSource('compatibility','scoreTier');
 const compatibility=new Function('experienceInfo','technologyScore','educationScore','practicalExperienceScore',
  'experienceLevelScore','modalityScore','areaScore',
  f+'; return compatibility;')(
   ()=> 'EXPERIENCIA_NAO_INFORMADA',
   ()=>10,()=>5,()=>5,()=>5,()=>5,()=>4
  );
 let actual=compatibility({compatibility_score:87,compatibility_notes:'Servidor'});
 assert.equal(actual.score,87);assert.equal(actual.origin,'pipeline');
 actual=compatibility({compatibility_score:0});
 assert.equal(actual.score,0);assert.equal(actual.origin,'pipeline');
 actual=compatibility({compatibility_score:null});
 assert.equal(actual.origin,'provisional');
 assert.equal(actual.score,34);
});
test('JSONs de workflow legado não possuem caminho até PUT público',()=>{
 const legacy=[
 ['monitor-vagas-workflow','Mudou alguma vaga?','Publicar vagas.json'],
 ['validar-status-candidaturas-workflow','Classificar e preparar resultados','Salvar status no GitHub']
 ];
 for(const [name,from,to] of legacy){
  const w=wf(name);
  assert.equal(w.active,false);
  assert.ok(w.nodes.some(n=>n.name===to),'nó preservado para auditoria');
  assert.ok(!(w.connections[from]?.main||[]).flat().some(x=>x.node===to));
 }
});
test('SQL de diagnóstico não executa operações que alteram o estado',()=>{
 const sql=fs.readFileSync(path.join(root,'database/004_diagnostico_operacional.sql'),'utf8');
 assert.match(sql,/BEGIN READ ONLY;/i);
 assert.match(sql,/SELECT revision,updated_at/i);
 const statements=sql.replace(/--[^\n]*/g,'').split(';').map(x=>x.trim()).filter(Boolean);
 assert.equal(statements[0].toUpperCase(),'BEGIN READ ONLY');
 assert.equal(statements.at(-1).toUpperCase(),'COMMIT');
 for(const statement of statements.slice(1,-1)) assert.match(statement,/^SELECT\b/i);
});
