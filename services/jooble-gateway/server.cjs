#!/usr/bin/env node
'use strict';
// Proxy interno de escopo fixo para a API REST regional da Jooble.
// Nunca imprime a chave da Jooble, o token interno ou a URL upstream.
const http = require('node:http');
const { timingSafeEqual } = require('node:crypto');

const MAX_BODY_BYTES = 4096;
const JOOBLE_BASE = 'https://br.jooble.org/api/';

function safeTokenEqual(actual, expected) {
  if (!actual || !expected) return false;
  const first = Buffer.from(String(actual));
  const second = Buffer.from(String(expected));
  return first.length === second.length && timingSafeEqual(first, second);
}
function validPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keywords = value.keywords, location = value.location;
  if (typeof keywords !== 'string' || !keywords.trim() || keywords.length > 120
    || typeof location !== 'string' || !location.trim() || location.length > 120) return null;
  // Evita proxy aberto e requisições arbitrárias: encaminha somente parâmetros da API.
  const result = { keywords: keywords.trim(), location: location.trim() };
  if (value.page !== undefined) {
    if (!Number.isInteger(value.page) || value.page < 1 || value.page > 20) return null;
    result.page = value.page;
  }
  if (value.ResultOnPage !== undefined) {
    if (!Number.isInteger(value.ResultOnPage) || value.ResultOnPage < 1 || value.ResultOnPage > 50) return null;
    result.ResultOnPage = value.ResultOnPage;
  }
  if (value.radius !== undefined) {
    if (!['0','4','8','16','26','40','80'].includes(String(value.radius))) return null;
    result.radius = String(value.radius);
  }
  return result;
}
function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store','content-length':Buffer.byteLength(payload)});
  res.end(payload);
}
function createServer({ apiKey, sharedToken, fetchImpl = globalThis.fetch } = {}) {
  if (typeof apiKey !== 'string' || apiKey.trim().length < 8) throw new Error('JOOBLE_BR_API_KEY não configurada.');
  if (typeof sharedToken !== 'string' || sharedToken.length < 24) throw new Error('GATEWAY_SHARED_TOKEN não configurado (mínimo 24 caracteres).');
  if (typeof fetchImpl !== 'function') throw new Error('fetch indisponível.');
  return http.createServer(async (req,res) => {
    if (req.method === 'GET' && req.url === '/health') {
      return send(res,200,{ready:true});
    }
    if (req.url !== '/search' || req.method !== 'POST') return send(res,404,{error:'Rota indisponível.'});
    if (!safeTokenEqual(req.headers['x-tecops-token'], sharedToken))
      return send(res,401,{error:'Credencial interna inválida.'});
    if (!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))
      return send(res,415,{error:'Corpo JSON obrigatório.'});
    let input='';
    try {
      for await (const part of req) {
        input += part.toString('utf8');
        if (Buffer.byteLength(input)>MAX_BODY_BYTES) {
          return send(res,413,{error:'Corpo excede limite permitido.'});
        }
      }
      const payload=validPayload(JSON.parse(input));
      if (!payload) return send(res,400,{error:'Parâmetros keywords/location/page inválidos.'});
      let upstream;
      try {
        upstream=await fetchImpl(JOOBLE_BASE+encodeURIComponent(apiKey),{
          method:'POST',
          headers:{'content-type':'application/json','accept':'application/json'},
          body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)
        });
      } catch {
        return send(res,502,{error:'Não foi possível consultar a Jooble.'});
      }
      if (!upstream.ok) {
        const code=[403,404,429].includes(upstream.status)?upstream.status:502;
        return send(res,code,{error:code===403?'Chave Jooble recusada pela API regional.':
          code===429?'Quota Jooble excedida.':'Falha na API Jooble.',upstreamStatus:upstream.status});
      }
      let json;
      try { json=await upstream.json(); }catch{return send(res,502,{error:'Resposta inválida da Jooble.'});}
      if (!json || !Array.isArray(json.jobs))return send(res,502,{error:'Resposta Jooble sem array jobs.'});
      return send(res,200,{jobs:json.jobs,totalCount:Number.isFinite(json.totalCount)?json.totalCount:json.jobs.length});
    }catch {
      if (!res.writableEnded) return send(res,400,{error:'JSON de requisição inválido.'});
    }
  });
}
if(require.main===module){
  try {
    const server=createServer({apiKey:process.env.JOOBLE_BR_API_KEY,
      sharedToken:process.env.GATEWAY_SHARED_TOKEN});
    const port=Number(process.env.PORT||8787);
    server.listen(port,'0.0.0.0',()=>{ process.stdout.write('TecOps Jooble gateway iniciado na rede interna.\n'); });
  } catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
}
module.exports={createServer,validPayload,safeTokenEqual};
