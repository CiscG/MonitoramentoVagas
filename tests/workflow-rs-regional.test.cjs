'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..','n8n');
const wf=name=>JSON.parse(fs.readFileSync(path.join(root,name+'.json'),'utf8'));
const node=(w,name)=>{const n=w.nodes.find(x=>x.name===name);assert.ok(n,name);return n;};
const code=(w,name)=>node(w,name).parameters.jsCode;
function run(js,packet){return new Function('$input',js)({first:()=>({json:packet})})[0].json;}
const A=wf('A-coleta'),B=wf('B-filtragem'),D=wf('D-classificacao'),G=wf('G-agendamento');
const profile={rsOnlyForNonRemote:true,allowUnknownLocation:false,includeRemote:true,
 locations:['Santa Rosa','Rio Grande do Sul','RS'],workModes:[],
 jobLevels:['Estágio','Júnior','Trainee','Não informada']};
function fakeJob(id,mode,location,more={}){
 return {id,cargo:'Desenvolvedor Backend Júnior',nivel:'Júnior',
  modalidade:mode,local:location,tecnologias:['Python'],descricao:'APIs Python',...more};
}
test('B aceita vagas remotas e híbridas/presenciais comprovadas no RS',()=>{
 const input=[fakeJob('remote','Remoto','Brasil'),fakeJob('porto','Híbrido','Porto Alegre, RS'),
 fakeJob('ijui','Presencial','Ijuí'),fakeJob('caxias','Presencial','Caxias do Sul'),
 fakeJob('out','Presencial','São Paulo, SP'),fakeJob('hybrid-out','Híbrido','Curitiba, PR'),
 fakeJob('unknown','Presencial','Não informada'),fakeJob('remote-unknown','Remoto','Não informada'),
 fakeJob('structured','Híbrido','Porto Alegre',{location_area:['Brasil','Rio Grande do Sul','Porto Alegre']})];
 const result=run(code(B,'Filtrar vagas'),{profile,jobs:input});
 assert.deepEqual(result.jobs.map(x=>x.id),['remote','porto','ijui','caxias','remote-unknown','structured']);
 assert.equal(result.filterStats.reasons.location,3);
 assert.equal(result.filterStats.applied.rsOnlyForNonRemote,true);
});
test('B não confunde RS com letras de outras palavras e não aceita localidade não comprovada',()=>{
 const input=[fakeJob('non-rs','Presencial','cursos em São Paulo'),
   fakeJob('regional','Presencial','Rio Grande do Sul'),
   fakeJob('out-other','Híbrido','Rio Grande do Norte')];
 const result=run(code(B,'Filtrar vagas'),{profile,jobs:input});
 assert.deepEqual(result.jobs.map(x=>x.id),['regional']);
});
test('A tem quatro consultas Adzuna regionais com credencial e Wait entre elas',()=>{
 const searches=['RS Desenvolvimento','RS Estágio','RS QA','RS Integração'];
 for(const suffix of searches){
   const http=node(A,'Vagas Adzuna '+suffix);
   assert.equal(http.type,'n8n-nodes-base.httpRequest');
   assert.equal(http.parameters.authentication,'genericCredentialType');
   assert.equal(http.parameters.genericAuthType,'httpCustomAuth');
   assert.equal(new URL(http.parameters.url).searchParams.get('where'),'Rio Grande do Sul');
   assert.equal(new URL(http.parameters.url).searchParams.get('results_per_page'),'20');
   assert.ok(!/app_key|app_id/i.test(http.parameters.url));
   assert.ok(node(A,'Validar Adzuna '+suffix));
 }
 assert.equal(A.connections['Aguardar limite — RS 4'].main[0][0].node,'Normalizar coleta');
});
test('A normaliza localização estruturada e deduplica consultas regionais',()=>{
 const raw=(id,title,mode,location)=>({id,title,
  company:{display_name:'Empresa Exemplo'},redirect_url:'https://jobs.example.com/'+id,
  location,workplaceType:mode,description:'Programação e APIs em Python',
  created:'2026-11-11T00:00:00Z'});
 const same=raw(99,'Desenvolvedor Python Júnior','Hybrid',{
  display_name:'Porto Alegre',area:['Brasil','Rio Grande do Sul','Porto Alegre']});
 const other=raw(101,'Analista QA Júnior','On-site',{
  display_name:'Santa Rosa, Rio Grande do Sul',area:['Brasil','Rio Grande do Sul','Santa Rosa']});
 const responses={
  'Validar Adzuna RS Desenvolvimento':[same],
  'Validar Adzuna RS Estágio':[],
  'Validar Adzuna RS QA':[same,other],
  'Validar Adzuna RS Integração':[]
 };
 const $=name=>({first:()=>({json:name==='Entrada A'?{run:{kind:'daily'},profile}:
    {ok:Boolean(responses[name]),jobs:responses[name]||[],statusCode:200}})});
 const result=new Function('$','URL',code(A,'Normalizar coleta'))($,URL)[0].json;
 assert.equal(result.jobs.length,2);
 const first=result.jobs.find(j=>j.id==='adzuna-99');
 assert.ok(first);
 assert.equal(first.modalidade,'Híbrido');
 assert.match(first.local,/Porto Alegre.*Rio Grande do Sul/);
 assert.equal(first.buscasCorrespondentes.length,2);
 assert.equal(result.jobs.find(j=>j.id==='adzuna-101').modalidade,'Presencial');
});
test('G mantém buscas remotas e habilita a restrição estadual para não remotas',()=>{
 const p=run(code(G,'Contexto da execução'),{run:{kind:'daily',id:'1'}}).profile;
 assert.equal(p.includeRemote,true);
 assert.equal(p.rsOnlyForNonRemote,true);
 assert.equal(p.allowUnknownLocation,false);
 assert.ok(p.locations.includes('Rio Grande do Sul'));
});
test('D reconhece localidade declarada na hierarquia da Adzuna para dar score regional',()=>{
 const base=fakeJob('base','Híbrido','Porto Alegre',{
  location_area:['Brasil','Rio Grande do Sul','Porto Alegre']});
 const result=run(code(D,'Calcular compatibilidade'),{profile,jobs:[base]});
 assert.match(result.jobs[0].compatibility_notes,/local 12\/15/);
});
