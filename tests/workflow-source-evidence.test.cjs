'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const workflow=letter=>JSON.parse(fs.readFileSync(path.join(root,'n8n',letter+'.json'),'utf8'));
const code=(letter,name)=>{
 const n=workflow(letter).nodes.find(x=>x.name===name);
 assert.ok(n,name);return n.parameters.jsCode;
};
function evalCode(source,context){
 return vm.runInNewContext('(function(){\n'+source+'\n})()',{Buffer,URL,...context},{timeout:2500});
}
const realGithubIssue={
 // Metadata checked against the GitHub issue API, 2026-11-11.
 id:'backend-br-6264105358',fonte:'Backend BR',
 cargo:'[Remoto] Desenvolvedor(a) Back-end Júnior - Python / AI Coding & Agentic AI - MKdigital',
 empresa:'Não informada',
 link:'https://github.com/backend-br/vagas/issues/12493',
 descricao:'Desenvolvimento de software backend com Python e APIs, oportunidade júnior.'
};
const issueApi={
 state:'open',state_reason:null,closed_at:null,
 title:realGithubIssue.cargo,
 html_url:realGithubIssue.link
};
function interpret(job,kind,codeNum,body){
 const p={job,index:0,originalUrl:job.link,validationKind:kind,checkedUrl:
   kind==='github_issue'?'https://api.github.com/repos/backend-br/vagas/issues/12493':
     'https://himalayas.app/jobs/api/companies/example/jobs/example'};
 const input={$input:{all:()=>[{json:{statusCode:codeNum,body}}]},
 $: name=>({first:()=>({json:{jobs:[job]}}),all:()=>name==='Preparar verificações'?[{json:p}]:[]})};
 return evalCode(code('C-validacao','Consolidar verificações'),input)[0].json.jobs[0];
}
test('dados de issue real aberta: NÃO declarar candidatura confirmada',()=>{
 const item=interpret(realGithubIssue,'github_issue',200,issueApi);
 assert.equal(item.application_status,'PENDING_VALIDATION');
 assert.match(item.motivoVerificacaoCandidatura,/não comprova inscrições abertas/i);
 assert.equal(item.urlVerificada,realGithubIssue.link);
});
test('issue fechada: apenas encerramento da publicação, conforme API',()=>{
 const item=interpret(realGithubIssue,'github_issue',200,{...issueApi,state:'closed',closed_at:'2026-11-11T00:00:00Z'});
 assert.equal(item.application_status,'CLOSED');
 assert.match(item.motivoVerificacaoCandidatura,/issue fechada/i);
});
test('HTML genérico com texto de encerramento não confirma a situação da vaga',()=>{
 const item=interpret(realGithubIssue,'html',200,
  '<html><body><h1>Exemplo de vagas</h1><p>Applications are closed para anúncios antigos.</p></body></html>');
 assert.equal(item.application_status,'PENDING_VALIDATION');
 assert.match(item.motivoVerificacaoCandidatura,/revisão manual necessária/i);
});
test('Himalayas: só 200 com job confirma anúncio ativo; 410 significa fechado',()=>{
 const himalaya={id:'himalayas-abc',fonte:'Himalayas',link:'https://himalayas.app/companies/example/jobs/example'};
 assert.equal(interpret(himalaya,'himalayas_job',200,{job:{guid:himalaya.link}}).application_status,'ACTIVE');
 assert.equal(interpret(himalaya,'himalayas_job',200,{}).application_status,'PENDING_VALIDATION');
 assert.equal(interpret(himalaya,'himalayas_job',410,{}).application_status,'CLOSED');
 assert.equal(interpret(himalaya,'himalayas_job',404,{}).application_status,'SOURCE_UNAVAILABLE');
});
test('preparador cria endpoints oficiais apenas para GitHub issues e Himalayas identificados',()=>{
 const github={...realGithubIssue};
 const himalaya={id:'himalayas-a',fonte:'Himalayas',guid:'https://himalayas.app/companies/example/jobs/example',link:'https://apply.example.com/'};
 const context={$input:{first:()=>({json:{jobs:[github,himalaya],previous:{vagas:[],historicoVagas:[]}}})}};
 const result=evalCode(code('C-validacao','Preparar verificações'),context).map(x=>x.json);
 assert.equal(result[0].validationKind,'github_issue');
 assert.equal(result[0].checkedUrl,'https://api.github.com/repos/backend-br/vagas/issues/12493');
 assert.equal(result[1].validationKind,'himalayas_job');
 assert.equal(result[1].checkedUrl,'https://himalayas.app/jobs/api/companies/example/jobs/example');
 assert.equal(result[1].originalUrl,'https://apply.example.com/');
});
test('G semanal e diário têm gatilhos explícitos; F preserva links da fonte',()=>{
 const g=workflow('G-agendamento');
 const next=name=>g.connections[name]?.main?.[0]?.[0]?.node;
 assert.equal(next('Agendamento diário'),'Definir execução diária');
 assert.equal(next('Agendamento semanal'),'Definir execução semanal');
 const check=code('G-agendamento','Contexto da execução');
 const result=evalCode(check,{$input:{first:()=>({json:{run:{kind:'weekly',id:'1'}}})}})[0].json;
 assert.equal(result.run.kind,'weekly');
 const f=code('F-relatorio','Montar relatório consolidado');
 assert.match(f,/urlCandidaturaFonte/);
 assert.match(f,/job.source_url \|\| job.guid/);
});
test('workflow E não marca atualização só por novo score de compatibilidade',()=>{
 const e=code('E-deduplicacao','Consolidar identidades e eventos');
 const signature=e.slice(e.indexOf('function signature(v){'),e.indexOf('function registerEvent',e.indexOf('function signature(v){')));
 assert.ok(!signature.includes('compatibility_score'));
 assert.ok(!signature.includes('urlsAlternativas'));
});
test('nenhum JSON exportado contém identificadores de credenciais ou tokens literais',()=>{
 for(const letter of ['A-coleta','B-filtragem','C-validacao','D-classificacao',
  'E-deduplicacao','F-relatorio','G-agendamento','H-log-erros']){
  const w=workflow(letter);
  for(const n of w.nodes){
   assert.ok(!n.credentials,'Credencial incorporada ao export: '+letter+'/'+n.name);
   if(n.type==='n8n-nodes-base.httpRequest')
     assert.doesNotMatch(n.parameters.url||'',/app_key=|[?&]access_token=|jooble\.org\/api\/[A-Za-z0-9]{16,}/);
  }
 }
});
