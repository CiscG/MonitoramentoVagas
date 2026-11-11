'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { canonicalUrl, contentHash, normalizeLegacyJob } = require('../import-jobs.cjs');

test('URLs retiram rastreadores, fragments e normalizam parâmetros', () => {
  assert.equal(
    canonicalUrl('https://example.com/jobs/123?utm_source=feed&b=2&a=1#apply'),
    'https://example.com/jobs/123?a=1&b=2'
  );
  assert.equal(canonicalUrl('javascript:alert(1)'), null);
});

test('hash da descrição é estável para maiúsculas/acentos/espaços', () => {
  assert.equal(contentHash('Desenvolvimento de API'), contentHash('DESENVOLVIMENTO   DE ÁPI'));
  assert.notEqual(contentHash('Python com Django'), contentHash('Python com Flask'));
  assert.equal(contentHash(''), '');
});

test('mapeia campos legados e preserva identificadores e primeira captura', () => {
  const row = normalizeLegacyJob({
    id: 'himalayas-42', fonte: 'Himalayas', cargo: 'Dev Júnior',
    empresa: 'Empresa A', descricao: 'Desenvolvimento backend com Python',
    link: 'https://example.com/vaga?utm_medium=email',
    publicadoEm: '2026-11-10T14:00:00.000Z',
    primeiraIdentificacao: '2026-11-11T14:00:00.000Z',
    ultimaIdentificacao: '2026-11-12T14:00:00.000Z',
    tecnologias: ['Python'], statusCandidatura: 'ACTIVE'
  });
  assert.equal(row.external_id, '42');
  assert.equal(row.title, 'Dev Júnior');
  assert.equal(row.company, 'Empresa A');
  assert.equal(row.canonical_url, 'https://example.com/vaga');
  assert.deepEqual(row.technologies, ['Python']);
  assert.equal(row.first_seen_at, '2026-11-11T14:00:00.000Z');
  assert.equal(row.application_status, 'ACTIVE');
  assert.match(row.content_hash, /^fnv1a64:[0-9a-f]{16}$/);
});

test('score opcional respeita 0–100; dados vazios não se tornam zero', () => {
  const common = { id: 'test-1', fonte: 'Teste', cargo: 'QA' };
  assert.equal(normalizeLegacyJob(common).compatibility_score, null);
  assert.equal(normalizeLegacyJob({ ...common, compatibility_score: 0 }).compatibility_score, 0);
  assert.equal(normalizeLegacyJob({ ...common, compatibility_score: 101 }).compatibility_score, null);
});
