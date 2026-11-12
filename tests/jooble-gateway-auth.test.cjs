'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createServer,validPayload,safeTokenEqual}=require('../services/jooble-gateway/server.cjs');
const workflow=JSON.parse(fs.readFileSync(path.join(__dirname,'../n8n/A-coleta.json'),'utf8'));
const nodes=Object.fromEntries(workflow.nodes.map(n=>[n.name,n]));
const secret='secret-token-only-in-test-very-long-and-random';

test('gateway valida keywords, location, paginação, sem aceitar URL arbitrária',()=>{
 assert.deepEqual(validPayload({keywords:'  junior developer ',location:' Rio Grande do Sul ',page:1}),
  {keywords:'junior developer',location:'Rio Grande do Sul',page:1});
 assert.equal(validPayload({keywords:'',location:'Brasil'}),null);
 assert.equal(validPayload({keywords:'qa',location:'RS',page:0}),null);
 assert.deepEqual(validPayload({keywords:'qa',location:'RS',internal:'http://127.0.0.1'}),
  {keywords:'qa',location:'RS'});
 assert.ok(safeTokenEqual(secret,secret));
 assert.equal(safeTokenEqual(secret,'not-a-match'),false);
});

test('workflow utiliza três consultas reais da Jooble sem chave exportada',()=>{
 const searches=[
 ['Vagas Jooble','desenvolvedor junior'],
 ['Vagas Jooble BR Game Dev','desenvolvedor jogos unity'],
 ['Vagas Jooble BR Estagio','estagio desenvolvimento software']
 ];
 for(const [name,keywords] of searches){
  const node=nodes[name];
  assert.ok(node,name);
  assert.equal(node.type,'n8n-nodes-base.httpRequest');
  assert.equal(node.parameters.url,'http://tecops-jooble-gateway:8787/search');
  assert.equal(node.parameters.genericAuthType,'httpHeaderAuth');
  assert.equal(JSON.parse(node.parameters.jsonBody).keywords,keywords);
  assert.equal(node.parameters.options.response.response.fullResponse,true);
  assert.equal(node.parameters.options.response.response.neverError,true);
  assert.equal(node.retryOnFail,true);
  assert.equal(node.credentials,undefined);
  assert.doesNotMatch(JSON.stringify(node),/JOOBLE_BR_API_KEY|GATEWAY_SHARED_TOKEN|br\.jooble\.org\/api\/[a-z0-9]{16,}/);
 }
});

async function startServer(fakeFetch){
 const server=createServer({apiKey:'jooble-test-only-key-123',sharedToken:secret,fetchImpl:fakeFetch});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=server.address().port;
 return {server,url:'http://127.0.0.1:'+port+'/search'};
}
test('gateway bloqueia autenticação ausente e encaminha busca autorizada',async()=>{
 let calls=0;
 const {server,url}=await startServer(async(upstream,options)=>{
  calls++;
  assert.equal(upstream,'https://br.jooble.org/api/jooble-test-only-key-123');
  assert.equal(options.method,'POST');
  assert.deepEqual(JSON.parse(options.body),{keywords:'estagio desenvolvimento',location:'Rio Grande do Sul',page:1,ResultOnPage:20});
  return {ok:true,json:async()=>({jobs:[{title:'Vaga apenas de teste',link:'https://example.org/job'}],totalCount:1})};
 });
 try{
  const unauthorized=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({keywords:'qa',location:'Brasil'})});
  assert.equal(unauthorized.status,401);
  assert.equal(calls,0);
  const authorized=await fetch(url,{method:'POST',headers:{'content-type':'application/json','x-tecops-token':secret},
   body:JSON.stringify({keywords:'estagio desenvolvimento',location:'Rio Grande do Sul',page:1,ResultOnPage:20})});
  assert.equal(authorized.status,200);
  const json=await authorized.json();
  assert.equal(json.jobs.length,1);
  assert.equal(json.totalCount,1);
  assert.equal(calls,1);
 } finally{await new Promise(resolve=>server.close(resolve))}
});
test('gateway não publica chaves em resposta de erro do upstream',async()=>{
 const {server,url}=await startServer(async()=>({ok:false,status:403}));
 try{
  const response=await fetch(url,{method:'POST',
   headers:{'content-type':'application/json','x-tecops-token':secret},
   body:JSON.stringify({keywords:'programador',location:'Brasil'})});
  assert.equal(response.status,403);
  const serialized=JSON.stringify(await response.json());
  assert.doesNotMatch(serialized,/jooble-test-only-key-123|secret-token-only-in-test/);
 } finally{await new Promise(resolve=>server.close(resolve))}
});
test('nós Adzuna orientam configuração quando HTTP 401',()=>{
 const n=nodes['Validar Adzuna'];
 const fn=new Function('$input',n.parameters.jsCode);
 const r=fn({all:()=>[{json:{statusCode:401,body:{message:'Unauthorized'}}}]})[0].json;
 assert.equal(r.ok,false);
 assert.equal(r.statusCode,401);
 assert.match(r.error,/app_id\/app_key/);
 assert.deepEqual(r.jobs,[]);
});
