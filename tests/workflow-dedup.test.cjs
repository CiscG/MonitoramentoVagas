'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const workflow = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'n8n/monitor-vagas-workflow.json'), 'utf8'));
const script = workflow.nodes.find(n => n.name === 'Consolidar historico').parameters.jsCode;
const validators = [
  'Validar Frontend BR','Validar Backend BR','Validar Himalayas',
  'Validar Adzuna','Validar Jooble','Validar Himalayas Game Dev',
  'Validar Himalayas Estagio','Validar Adzuna Game Dev','Validar Adzuna Estagio',
  'Validar Jooble BR Game Dev','Validar Jooble BR Estagio'
];
function collect(previous, active, rawJobs) {
  const checks = Object.fromEntries(validators.map(name => [name, {
    ok: true, jobs: name === active ? rawJobs : [],
    checkedAt: '2026-11-11T16:00:00.000Z'
  }]));
  const context = {
    Buffer, URL,
    $: name => ({ first: () => ({ json: checks[name] }) }),
    $input: { first: () => ({ json: {
      sha: 'sha-do-arquivo-original',
      content: Buffer.from(JSON.stringify(previous)).toString('base64')
    } }) }
  };
  const output = vm.runInNewContext('(function(){\n' + script + '\n})()', context, { timeout: 2500 })[0].json;
  return { ...output, payload: output.content
    ? JSON.parse(Buffer.from(output.content, 'base64').toString('utf8')) : null };
}
const desc = 'Junior developer for backend APIs using Python Docker PostgreSQL integration tests and robust software engineering.';
const posting = (id, url) => ({
  id, title: 'Junior Backend Developer', company: 'Empresa A', description: desc,
  location: 'Santa Rosa - RS', html_url: url, created_at: '2026-11-10T10:00:00.000Z'
});

test('id externo e URL canônica não geram vaga nova a cada execução', () => {
  const a = collect({ vagas: [] }, 'Validar Backend BR', [posting(1, 'https://jobs.example.com/1?utm_source=one')]);
  assert.equal(a.novos, 1);
  assert.equal(a.total, 1);
  const b = collect(a.payload, 'Validar Backend BR', [posting(1, 'https://jobs.example.com/1?utm_source=two')]);
  assert.equal(b.novos, 0);
  assert.equal(b.total, 1);
  assert.equal(b.payload.vagas[0].first_seen_at, a.payload.vagas[0].first_seen_at);
});

test('mesmo cargo, empresa, local e descrição em outra fonte é republicação', () => {
  const a = collect({ vagas: [] }, 'Validar Backend BR', [posting(1, 'https://jobs.example.com/1')]);
  const b = collect(a.payload, 'Validar Frontend BR', [posting(55, 'https://careers.example.com/55')]);
  assert.equal(b.novos, 0);
  assert.equal(b.totalHistorico, 1);
  assert.equal(b.payload.vagas[0].id, a.payload.vagas[0].id);
  assert.equal(b.payload.vagas[0].republicacoes, 1);
  assert.equal(b.payload.vagas[0].fonte, 'Backend BR');
  const c = collect(b.payload, 'Validar Backend BR', [posting(1, 'https://jobs.example.com/1')]);
  assert.equal(c.novos, 0);
  assert.equal(c.totalHistorico, 1);
});

test('mesma empresa e cargo com descrição diferente não é automaticamente deduplicado', () => {
  const a = collect({ vagas: [] }, 'Validar Backend BR', [posting(1, 'https://jobs.example.com/1')]);
  const other = { ...posting(2, 'https://careers.example.com/2'),
    description: 'Junior developer responsible for embedded systems and custom firmware with C programming and microcontrollers.' };
  const b = collect(a.payload, 'Validar Frontend BR', [other]);
  assert.equal(b.novos, 1);
  assert.equal(b.totalHistorico, 2);
});

test('histórico excedente permanece persistido fora da listagem de 400', () => {
  const previous = { vagas: Array.from({ length: 401 }, (_, i) => ({
    id: 'historico-' + i, cargo: 'Developer ' + i, empresa: 'Org ' + i,
    fonte: 'Arquivo legado', descricao: 'Antiga vaga ' + i,
    link: 'https://old.example.com/' + i, primeiraIdentificacao: '2026-11-01T00:00:00.000Z'
  })) };
  const result = collect(previous, 'Validar Backend BR', []);
  assert.equal(result.total, 400);
  assert.equal(result.totalHistorico, 401);
  assert.equal(result.payload.historicoVagas.length, 1);
  const next = collect(result.payload, 'Validar Backend BR', []);
  assert.equal(next.totalHistorico, 401);
  assert.equal(next.novos, 0);
});

test('todas as fontes indisponíveis não sobrescrevem o histórico', () => {
  const previous = { vagas: [{ id: 'antiga', fonte: 'Legado' }] };
  const checks = Object.fromEntries(validators.map(name => [name, { ok: false, error: 'timeout' }]));
  const context = {
    Buffer, URL, $: name => ({ first: () => ({ json: checks[name] }) }),
    $input: { first: () => ({ json: {
      sha: 'sha-original', content: Buffer.from(JSON.stringify(previous)).toString('base64')
    } }) }
  };
  const result = vm.runInNewContext('(function(){\n' + script + '\n})()', context, { timeout: 2500 })[0].json;
  assert.equal(result.changed, false);
  assert.equal(result.content, null);
  assert.equal(result.preserveHistory, true);
});
