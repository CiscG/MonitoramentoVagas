'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.join(__dirname,'..','n8n');
const A=JSON.parse(fs.readFileSync(path.join(base,'A-coleta.json'),'utf8'));
const G=JSON.parse(fs.readFileSync(path.join(base,'G-agendamento.json'),'utf8'));
const node=(wf,name)=>{
 const n=wf.nodes.find(x=>x.name===name);assert.ok(n,name);return n;
};
const js=(wf,name)=>node(wf,name).parameters.jsCode;
const run=(code,ctx)=>new Function('$','URL',code)(ctx,URL)[0].json;

test('A: 21 consultas oficiais e rotas completas até Normalizar coleta',()=>{
 const searches=A.nodes.filter(n=>n.name.startsWith('Vagas '));
 assert.equal(searches.length,21);
 const expected=['Himalayas QA','Himalayas Full Stack','Adzuna Remoto QA',
  'Adzuna Remoto Full Stack','Adzuna RS Game Dev','Jooble RS QA'];
 for(const name of expected){
  const http=node(A,'Vagas '+name),valid=node(A,'Validar '+name);
  assert.equal(http.type,'n8n-nodes-base.httpRequest');
  assert.equal(valid.type,'n8n-nodes-base.code');
  assert.ok(A.connections[http.name].main[0].some(x=>x.node===valid.name));
  assert.ok(http.retryOnFail);
  if(name.startsWith('Adzuna')){
   assert.equal(http.parameters.genericAuthType,'httpCustomAuth');
   assert.doesNotMatch(http.parameters.url,/app_id|app_key/);
   assert.equal(new URL(http.parameters.url).searchParams.get('results_per_page'),'20');
  }
  if(name.startsWith('Jooble')){
   assert.equal(http.parameters.genericAuthType,'httpHeaderAuth');
   assert.equal(http.parameters.url,'http://tecops-jooble-gateway:8787/search');
   const payload=JSON.parse(http.parameters.jsonBody);
   assert.equal(payload.location,'Rio Grande do Sul');
  }
 }
 assert.equal(A.connections['Aguardar limite — busca extra 6'].main[0][0].node,'Normalizar coleta');
 const names=new Set(A.nodes.map(n=>n.name));
 assert.equal(names.size,A.nodes.length);
});
test('A: métricas revelam registros brutos, normalizados, descartados e repetidos',()=>{
 const responses={
  'Validar Adzuna RS Desenvolvimento':[{
   id:100,title:'Analista de Automação de Testes Júnior',
   company:{display_name:'Tech RS'},
   redirect_url:'https://empregos.example.org/qa/100',location:{display_name:'Porto Alegre',area:['Brasil','Rio Grande do Sul','Porto Alegre']},
   description:'Criar testes de API com Python',workplaceType:'Hybrid'
  }],
  'Validar Adzuna Remoto QA':[{
   id:100,title:'Analista de Automação de Testes Júnior',
   company:{display_name:'Tech RS'},
   redirect_url:'https://empregos.example.org/qa/100',location:{display_name:'Porto Alegre',area:['Brasil','Rio Grande do Sul','Porto Alegre']},
   description:'Criar testes de API com Python',workplaceType:'Hybrid'
  }],
  'Validar Jooble RS QA':[{
   id:20,title:'Analista de Integração de Sistemas Júnior',
   company:'Integradora',link:'https://example.org/integ/20',
   snippet:'Projetos com APIs REST, SQL e testes'
  },{
   id:21,title:'Supervisor comercial',company:'Não TI',link:'https://example.org/venda/21'
  }]
 };
 const $=name=>({first:()=>({json:name==='Entrada A'
    ?{run:{id:'500',kind:'daily'},pg:{revision:5},profile:{locations:['Rio Grande do Sul']}}
    :{ok:true,statusCode:200,checkedAt:'2026-11-23T10:00:00Z',jobs:responses[name]||[]}})});
 const result=run(js(A,'Normalizar coleta'),$);
 assert.equal(result.rawCount,4);
 assert.equal(result.collectionStats.raw,4);
 assert.equal(result.collectionStats.normalized,3);
 assert.equal(result.collectionStats.unique,2);
 assert.equal(result.collectionStats.deduplicated,1);
 assert.equal(result.collectionStats.rejectedByNormalization,1);
 assert.equal(result.jobs.length,2);
 assert.ok(result.jobs.some(x=>x.cargo.includes('Automação de Testes')));
 assert.ok(result.jobs.some(x=>x.cargo.includes('Integração de Sistemas')));
 assert.equal(result.run.id,'500');
 assert.equal(result.pg.revision,5);
 assert.equal(result.diagnostics.length,21);
});
test('G: saída ausente de subworkflow nunca gera Succeeded silencioso',()=>{
 const stages=[
  ['A — coleta','Executar A — coleta','Executar B — filtragem'],
  ['B — filtragem','Executar B — filtragem','Executar C — validação'],
  ['C — validação','Executar C — validação','Executar D — classificação'],
  ['D — classificação','Executar D — classificação','Executar E — deduplicação'],
  ['E — deduplicação','Executar E — deduplicação','Preparar transação PostgreSQL']
 ];
 const core={run:{id:'500',kind:'daily'},profile:{},pg:{revision:8},jobs:[]};
 for(const [stage,from,to] of stages){
  const name='Verificar contrato — '+stage,check=js(G,name);
  const func=new Function('$input',check);
  assert.equal(node(G,from).alwaysOutputData,true);
  assert.equal(G.connections[from].main[0][0].node,name);
  assert.equal(G.connections[name].main[0][0].node,to);
  const withStage=stage.startsWith('A')?{diagnostics:[],rawCount:0}:
   stage.startsWith('B')?{filterStats:{received:0}}:
   stage.startsWith('C')?{validationStats:{checked:0}}:
   stage.startsWith('D')?{classifiedAt:'2026-11-23T10:00:00Z'}:
   {data:{vagas:[],historicoVagas:[],eventosHistorico:[]}};
  assert.throws(()=>func({all:()=>[{json:{}}]}),/jobs ausente/);
  assert.throws(()=>func({all:()=>[{json:{...core,...withStage,pg:undefined}}]}),/pg.revision ausente/);
  assert.deepEqual(func({all:()=>[{json:{...core,...withStage}}]}).length,1);
 }
});
