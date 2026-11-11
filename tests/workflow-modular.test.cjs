'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const base = path.resolve(__dirname, '..', 'n8n');
const names = {
 A:'A-coleta.json', B:'B-filtragem.json', C:'C-validacao.json',
 D:'D-classificacao.json', E:'E-deduplicacao.json',
 F:'F-relatorio.json', G:'G-agendamento.json'
};
const workflows = Object.fromEntries(Object.entries(names).map(([letter, filename])=>
 [letter,JSON.parse(fs.readFileSync(path.join(base,filename),'utf8'))]));
const js = (letter,nodeName) => {
 const node=workflows[letter].nodes.find(n=>n.name===nodeName);
 assert.ok(node, 'Nó obrigatório: '+letter+'/'+nodeName);
 return node.parameters.jsCode;
};
function execute(code, packet, extra={}) {
 const scope = {Buffer, URL, $input:{first:()=>({json:packet})}, ...extra};
 return vm.runInNewContext('(function(){\n'+code+'\n})()',scope,{timeout:2000})[0].json;
}
const job=(id,url,overrides={})=>({
 id,cargo:'Desenvolvedor Backend Júnior',empresa:'Empresa X',
 descricao:'Desenvolvimento de APIs em Python FastAPI Docker PostgreSQL para engenharia de software e testes com Git',
 fonte:'Backend BR',local:'Santa Rosa RS',nivel:'Júnior',
 modalidade:'Remoto',link:url,publicadoEm:'2026-11-10T10:00:00Z',
 primeiraIdentificacao:'2026-11-10T10:00:00Z',
 statusCandidatura:'ACTIVE',ultimaVerificacaoCandidatura:new Date().toISOString(),
 ...overrides
});
test('sete workflows válidos, com dependências internas resolvidas',()=>{
 assert.equal(Object.keys(workflows).length,7);
 for(const [letter,workflow] of Object.entries(workflows)){
  assert.equal(workflow.active,false,'Importação exige ativação manual: '+letter);
  const nodes=new Set(workflow.nodes.map(n=>n.name));
  for(const [source,links] of Object.entries(workflow.connections||{})){
   assert.ok(nodes.has(source),letter+' nó de origem '+source);
   for(const edge of (links.main||[]).flat())assert.ok(nodes.has(edge.node),letter+' alvo '+edge.node);
  }
  for(const node of workflow.nodes.filter(n=>n.type==='n8n-nodes-base.code')){
   assert.doesNotThrow(()=>new vm.Script('(function(){\n'+node.parameters.jsCode+'\n})'),letter+'/'+node.name);
  }
 }
});
test('B: local, modalidade, cargo, tecnologia e experiência são filtros configuráveis',()=>{
 const input={jobs:[
  job('a','https://example.com/a',{tecnologias:['Python'],experienciaObrigatoriaAnos:0}),
  job('b','https://example.com/b',{local:'Outra cidade',modalidade:'Presencial'}),
  job('c','https://example.com/c',{tecnologias:['Python'],experienciaObrigatoriaAnos:5})
 ],profile:{locations:['Santa Rosa'],workModes:['Remoto','Presencial'],roleKeywords:['Backend'],
 technologies:['Python'],maxExperienceYears:2}};
 const result=execute(js('B','Filtrar vagas'),input);
 assert.equal(result.filterStats.received,3);
 assert.equal(result.filterStats.accepted,1);
 assert.equal(result.jobs[0].id,'a');
});
test('C: lista vazia preserva payload e não solicita páginas',()=>{
 const initial={jobs:[],previous:{vagas:[]}};
 const prepared=execute(js('C','Preparar verificações'),initial);
 assert.equal(prepared.skip,true);
 const branch=workflows.C.connections['Há vagas para verificar?'];
 assert.equal(branch.main[0][0].node,'Consolidar verificações');
});
test('D: cálculo entre 0 e 100 preserva justificativa e prioriza habilidades',()=>{
 const a=execute(js('D','Calcular compatibilidade'),{jobs:[
  job('a','https://example.com/a',{tecnologias:['Python','Docker','SQL'],nivel:'Júnior'}),
  job('b','https://example.com/b',{cargo:'Auxiliar administrativo',nivel:'Pleno',descricao:'Administração de escritório',tecnologias:[]})
 ]});
 assert.equal(a.jobs.length,2);
 assert.ok(a.jobs[0].compatibility_score>=a.jobs[1].compatibility_score);
 assert.ok(a.jobs.every(x=>x.compatibility_score>=0&&x.compatibility_score<=100));
 assert.ok(a.jobs.every(x=>x.compatibility_notes));
});
test('E: republicação não entra como nova; eventos e identidade persistem',()=>{
 const script=js('E','Consolidar identidades e eventos');
 const first=execute(script,{previous:{vagas:[],historicoVagas:[],eventosHistorico:[]},
  diagnostics:[{ok:true}],jobs:[job('backend-br-1','https://example.com/1')]});
 assert.equal(first.dedupStats.new,1);
 const second=execute(script,{previous:first.data,diagnostics:[{ok:true}],
  jobs:[job('backend-br-2','https://careers.example.com/2')]});
 assert.equal(second.dedupStats.new,0);
 assert.equal(second.data.totalHistorico,1);
 assert.equal(second.data.vagas[0].id,first.data.vagas[0].id);
 const closed=execute(script,{previous:second.data,diagnostics:[{ok:true}],
  jobs:[job('backend-br-2','https://careers.example.com/2',{statusCandidatura:'CLOSED'})]});
 assert.equal(closed.dedupStats.closed,1);
 assert.ok(closed.data.eventosHistorico.some(x=>x.tipo==='encerrada'));
});
test('E: excedentes são arquivados, não eliminados',()=>{
 const older=Array.from({length:403},(_,i)=>job('old-'+i,'https://example.com/'+i,
  {empresa:'Org '+i,primeiraIdentificacao:'2026-01-01T00:00:00Z'}));
 const result=execute(js('E','Consolidar identidades e eventos'),{
  previous:{vagas:older.slice(0,400),historicoVagas:older.slice(400),eventosHistorico:[]},
  jobs:[],diagnostics:[{ok:true}]
 });
 assert.equal(result.data.totalHistorico,403);
 assert.equal(result.data.vagas.length,400);
 assert.equal(result.data.historicoVagas.length,3);
});
test('F: relatório vazio menciona explicitamente nenhuma nova vaga confirmada',()=>{
 const result=execute(js('F','Montar relatório consolidado'),{
  data:{vagas:[],historicoVagas:[],eventosHistorico:[]},
  reportsArchive:{reports:[]}
 });
 assert.equal(result.report.counts.new,0);
 assert.match(result.reportText,/Nenhuma nova vaga confirmada foi encontrada nesta semana/);
 for(const label of ['Novas oportunidades','continuam abertas','encerradas','atualizadas','não puderam ser verificadas'])
  assert.match(result.reportText,new RegExp(label,'i'));
});
test('G: gatilhos diário e semanal e email após relatório, sem IF de vagas novas',()=>{
 const d=workflows.G;
 assert.ok(d.nodes.find(n=>n.name==='Agendamento diário'));
 assert.ok(d.nodes.find(n=>n.name==='Agendamento semanal'));
 const branch=d.connections['É execução semanal?'];
 assert.equal(branch.main[0][0].node,'Executar F — relatório');
 assert.equal(d.connections['Confirmar relatório PostgreSQL'].main[0][0].node,
  'Enviar relatório semanal por e-mail');
 assert.ok(d.nodes.find(n=>n.type==='n8n-nodes-base.emailSend'));
});

test('E: recupera histórico ausente somente após validação de SHA e JSON',()=>{
 const workflow=workflows.E;
 const branch=workflow.connections['Histórico presente na entrada?'];
 assert.equal(branch.main[0][0].node,'Consolidar identidades e eventos');
 assert.equal(branch.main[1][0].node,'Recuperar histórico GitHub');
 const code=js('E','Anexar histórico recuperado');
 const history={vagas:[{id:'antiga',fonte:'Backend BR',cargo:'Vaga preservada'}],historicoVagas:[]};
 const payload={jobs:[],github:{},run:{kind:'daily'}};
 const file={sha:'old-file-sha',content:Buffer.from(JSON.stringify(history)).toString('base64')};
 const $=name=>({first:()=>({json:name==='Entrada E'?payload:{}})});
 const scope={Buffer,$,$input:{first:()=>({json:file})}};
 const result=vm.runInNewContext('(function(){\n'+code+'\n})()',scope,{timeout:2000})[0].json;
 assert.equal(result.previous.vagas.length,1);
 assert.equal(result.previous.vagas[0].id,'antiga');
 assert.equal(result.github.jobsSha,'old-file-sha');
 assert.equal(result.historyRecoveredFromGitHub,true);
 assert.throws(()=>{
   const altered={...file,sha:'other-sha'};
   const withMismatch={...payload,github:{jobsSha:'previous-sha'}};
   vm.runInNewContext('(function(){\n'+code+'\n})()',{
     Buffer,$:()=>({first:()=>({json:withMismatch})}),
     $input:{first:()=>({json:altered})}
   },{timeout:2000});
 },/SHA divergente/);
 assert.throws(()=>vm.runInNewContext('(function(){\n'+code+'\n})()',{
   Buffer,$,$input:{first:()=>({json:{sha:'ok',content:Buffer.from('{}').toString('base64')}})}
 },{timeout:2000}),/não contém o array vagas/);
});

test('F: seis categorias obrigatórias, todos os campos e ausências sem inferência',()=>{
 const now=new Date();
 const monday=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));
 monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);
 const recent=new Date(monday.getTime()-3*86400000).toISOString();
 const old=new Date(monday.getTime()-25*86400000).toISOString();
 const checked=new Date().toISOString();
 const common={
  empresa:'Empresa X',modalidade:'Remoto',local:'Brasil',tecnologias:['Python','Docker'],
  fonte:'Backend BR',compatibility_score:85,
  compatibility_notes:'Tecnologias + localidade compatíveis',
  justificativaClassificacao:'Classificado pela área',
  statusCandidatura:'ACTIVE',ultimaVerificacaoCandidatura:checked,
  primeiraIdentificacao:recent,
  link:'https://github.com/backend-br/vagas/issues/1'
 };
 const jobs=[
  {id:'junior',cargo:'Desenvolvedor Backend Júnior',nivel:'Júnior',...common},
  {id:'intern',cargo:'Estágio em Desenvolvimento Web',nivel:'Estágio',...common},
  {id:'qa',cargo:'Analista de QA Júnior',area:'QA e Testes',...common},
  {id:'integration',cargo:'Desenvolvedor de Integração Júnior',area:'Integração de Sistemas',...common},
  {id:'other',cargo:'Desenvolvedor Unity',...common},
  {id:'previous',cargo:'Desenvolvedor Frontend Júnior',...common,primeiraIdentificacao:old},
  {id:'closed',cargo:'Desenvolvedor Back-end Júnior',...common,statusCandidatura:'CLOSED',primeiraIdentificacao:old},
  {id:'unknown',cargo:'Analista de QA',...common,statusCandidatura:'SOURCE_UNAVAILABLE'}
 ];
 const packet={data:{vagas:jobs,events:[],eventosHistorico:[
  ...['junior','intern','qa','integration','other'].map(id=>({id,tipo:'nova',em:recent})),
  {id:'closed',tipo:'encerrada',em:recent}
 ]},reportsArchive:{reports:[]}};
 const result=execute(js('F','Montar relatório consolidado'),packet);
 const sections=result.report.sections;
 for(const [key,id] of [
  ['juniorDevelopment','junior'],['internships','intern'],['qaTesting','qa'],
  ['systemIntegration','integration'],['previous','previous'],['closed','closed'],
  ['otherNew','other'],['unverified','unknown']
 ]) assert.ok(sections[key].includes(id),key+' deve incluir '+id);
 for(const category of ['Vagas efetivas de desenvolvimento júnior','Estágios em desenvolvimento',
  'QA e automação de testes','Integração de sistemas e áreas correlatas',
  'Oportunidades anteriormente encontradas','Vagas encerradas'])
  assert.ok(result.reportText.includes(category),category);
 const item=result.report.records.juniorDevelopment[0];
 for(const field of ['cargo','empresa','modalidade','localidade','salario','tecnologias',
  'formacaoExigida','experiencia','prazoInscricao','compatibilidade',
  'motivoClassificacao','motivoCompatibilidade','ultimaValidacao','urlOficial'])
  assert.ok(Object.prototype.hasOwnProperty.call(item,field),'campo ausente: '+field);
 assert.equal(item.salario,'Não informado');
 assert.equal(item.formacaoExigida,'Não informada');
 assert.equal(item.experiencia,'Não informada');
 assert.equal(item.urlOficial,null);
 assert.equal(item.urlFonte,'https://github.com/backend-br/vagas/issues/1');
 assert.ok(result.reportHtml.includes('Link oficial para candidatura'));
 assert.ok(result.reportHtml.includes('Link do anúncio na fonte'));
 assert.equal(result.report.counts.new,5);
});
test('F: informação explícita é renderizada; URL do anúncio não vira oficial',()=>{
 const now=new Date(),monday=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));
 monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);
 const recent=new Date(monday.getTime()-3*86400000).toISOString();
 const data={vagas:[{
  id:'verified',cargo:'Estágio em Desenvolvimento Frontend',empresa:'ABC',nivel:'Estágio',
  modalidade:'Híbrido',local:'Porto Alegre',fonte:'Himalayas',tecnologias:['JavaScript'],
  formacaoExigida:'Cursando Sistemas de Informação',experienciaDesejavelAnos:1,
  salary_min:1500,salary_max:2000,salary_currency:'BRL',
  expiraEm:'2027-01-31',compatibility_score:90,
  compatibility_notes:'Foco em tecnologias declaradas',primeiraIdentificacao:recent,
  statusCandidatura:'ACTIVE',ultimaVerificacaoCandidatura:new Date().toISOString(),
  application_url:'https://aggregator.example.com/redirect',
  official_application_url:'https://careers.example.com/apply'
 }],eventosHistorico:[{id:'verified',tipo:'nova',em:recent}]};
 const out=execute(js('F','Montar relatório consolidado'),{data,reportsArchive:{reports:[]}});
 const item=out.report.records.internships[0];
 assert.match(item.salario,/1.500/);
 assert.match(item.salario,/2.000/);
 assert.equal(item.formacaoExigida,'Cursando Sistemas de Informação');
 assert.equal(item.experiencia,'Desejável: 1 ano(s)');
 assert.equal(item.urlOficial,'https://careers.example.com/apply');
 assert.equal(item.compatibilidade,'90/100');
 assert.ok(item.ultimaValidacao!=='Não informado');
});
