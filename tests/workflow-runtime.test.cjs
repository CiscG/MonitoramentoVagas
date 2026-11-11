'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'..');
const load=p=>JSON.parse(fs.readFileSync(path.join(base,p),'utf8'));
const A=load('n8n/A-coleta.json'), C=load('n8n/C-validacao.json');
const G=load('n8n/G-agendamento.json'), H=load('n8n/H-log-erros.json');
const node=(w,name)=>{const result=w.nodes.find(n=>n.name===name);assert.ok(result,name);return result};
const ends=(w,src)=>w.connections[src]?.main?.flat().map(x=>x.node)||[];
test('G: postgres autoritativo, logs e backup GitHub após transação',()=>{
 for(const name of ['Ler estado PostgreSQL','Persistir PostgreSQL','Arquivar relatório PostgreSQL'])
  assert.equal(node(G,name).type,'n8n-nodes-base.postgres');
 assert.equal(node(G,'Merge — contexto e estado').type,'n8n-nodes-base.merge');
 assert.ok(ends(G,'Confirmar transação PostgreSQL').includes('É execução semanal?'));
 assert.ok(ends(G,'Enviar relatório semanal por e-mail').includes('Ler versão pública GitHub'));
 assert.ok(ends(G,'É execução semanal?').includes('Executar F — relatório'));
 assert.ok(ends(G,'É execução semanal?').includes('Ler versão pública GitHub'));
 assert.ok(ends(G,'Confirmar relatório PostgreSQL').includes('Enviar relatório semanal por e-mail'));
 for(const queryNode of G.nodes.filter(n=>n.type==='n8n-nodes-base.postgres'))
  assert.ok(!queryNode.credentials,'export não deve conter credenciais');
});
test('C: processamento item a item e retentativa progressiva HTTP',()=>{
 const loop=node(C,'Loop Over Items — 1 vaga');
 assert.equal(loop.type,'n8n-nodes-base.splitInBatches');
 assert.equal(loop.parameters.batchSize,1);
 assert.equal(node(C,'Merge — requisição e HTTP').type,'n8n-nodes-base.merge');
 assert.equal(node(C,'IF — tentar novamente?').type,'n8n-nodes-base.if');
 assert.equal(node(C,'Backoff 2/4/8s — Retry-After').type,'n8n-nodes-base.wait');
 const retryCode=node(C,'Verificar retry progressivo').parameters.jsCode;
 const fn=new Function('$input',retryCode);
 const simulate=(status,attempt,header)=>fn({all:()=>[{json:{
  checkedUrl:'https://careers.example.com/job',statusCode:status,attempt,headers:header||{}
 }}]})[0].json;
 assert.equal(simulate(429,0).retryDelaySeconds,2);
 assert.equal(simulate(429,1).retryDelaySeconds,4);
 assert.equal(simulate(429,2).retryDelaySeconds,8);
 assert.equal(simulate(429,3).shouldRetry,false);
 assert.equal(simulate(503,0,{'retry-after':'15'}).retryDelaySeconds,15);
 assert.equal(simulate(200,0).shouldRetry,false);
});
test('A: Adzuna autentica por credencial e Jooble não exporta token no path',()=>{
 const adzuna=A.nodes.filter(n=>n.name.startsWith('Vagas Adzuna'));
 const jooble=A.nodes.filter(n=>n.name.startsWith('Vagas Jooble'));
 assert.equal(adzuna.length,3);assert.equal(jooble.length,3);
 for(const n of adzuna){
  assert.equal(n.parameters.genericAuthType,'httpCustomAuth');
  assert.equal(n.parameters.authentication,'genericCredentialType');
  assert.doesNotMatch(n.parameters.url,/app_key=|app_id=|\$env\./);
  assert.equal(n.retryOnFail,true);
 }
 for(const n of jooble){
  assert.equal(n.type,'n8n-nodes-base.code');
  assert.doesNotMatch(JSON.stringify(n),/JOOBLE_API_KEY|\/api\/[a-zA-Z0-9]{16,}/);
 }
 assert.ok(A.nodes.some(n=>n.type==='n8n-nodes-base.wait'));
});
test('H: erros são sanitizados antes de gravar no banco',()=>{
 assert.equal(node(H,'Erro no workflow').type,'n8n-nodes-base.errorTrigger');
 assert.equal(node(H,'Registrar erro PostgreSQL').type,'n8n-nodes-base.postgres');
 const fn=new Function('$input',node(H,'Sanitizar diagnóstico').parameters.jsCode);
 const result=fn({first:()=>({json:{workflow:{name:'TecOps G'},
 execution:{id:'42',lastNodeExecuted:'API',error:{message:'https://api.example.com/?api_key=secreto-123&token=abcd'}}}})})[0].json;
 assert.doesNotMatch(result.message,/secreto-123|abcd/);
 assert.match(result.message,/REDACTED/);
 assert.equal(result.runKey,'42');
});
test('migração contém transação, controle de revisão, logs e snapshots',()=>{
 const sql=fs.readFileSync(path.join(base,'database/002_pipeline_runtime.sql'),'utf8');
 for(const token of ['CREATE TABLE IF NOT EXISTS tecops_pipeline_state',
  'CREATE TABLE IF NOT EXISTS tecops_execution_logs',
  'CREATE OR REPLACE FUNCTION tecops_commit_pipeline',
  'CREATE OR REPLACE FUNCTION tecops_archive_weekly_report',
  'pg_advisory_xact_lock','p_expected_revision','tecops_upsert_job','report_snapshots'])
  assert.ok(sql.includes(token),token);
 const bootstrap=fs.readFileSync(path.join(base,'database/bootstrap-runtime.cjs'),'utf8');
 assert.ok(bootstrap.includes('Estado já inicializado'));
 assert.ok(bootstrap.includes('ROLLBACK'));
 assert.ok(bootstrap.includes('BEGIN'));
});
