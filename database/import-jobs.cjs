#!/usr/bin/env node
'use strict';
/*
 * Importação opcional do JSON atual para PostgreSQL. Idempotente:
 * - funções / esquema definidos por database/001_jobs.sql;
 * - não altera data/vagas.json e não substitui a coleta n8n;
 * - um snapshot do arquivo original é guardado por hash SHA-256.
 *
 * Instalação: cd database && npm install
 * Execução: DATABASE_URL='postgresql://...' node database/import-jobs.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const clean = value => value == null ? '' : String(value).trim();
const normalized = value => clean(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g, ' ').trim();
const instant = value => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
function canonicalUrl(raw) {
  const input = clean(raw);
  if (!/^https?:\/\//i.test(input)) return null;
  try {
    const url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    for (const name of [...url.searchParams.keys()]) {
      if (/^(utm_.+|gclid|fbclid|mc_cid|mc_eid|ref_src)$/i.test(name)) url.searchParams.delete(name);
    }
    url.searchParams.sort();
    return url.toString().replace(/\?$/, '');
  } catch { return null; }
}
function contentHash(value) {
  const body = normalized(value);
  if (!body) return '';
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < body.length; i++) {
    h = BigInt.asUintN(64, (h ^ BigInt(body.charCodeAt(i))) * 0x100000001b3n);
  }
  return 'fnv1a64:' + h.toString(16).padStart(16, '0');
}
function numeric(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function normalizeLegacyJob(job) {
  if (!job || typeof job !== 'object' || Array.isArray(job)) throw new TypeError('Vaga inválida');
  const source = clean(job.source || job.fonte);
  const id = clean(job.id);
  if (!id || !source) throw new TypeError('Vaga sem id/fonte');
  const title = clean(job.title || job.cargo) || 'Cargo não informado';
  const company = clean(job.company || job.empresa) || 'Empresa não informada';
  const description = clean(job.description || job.descricao);
  const originalUrl = clean(job.application_url || job.link || job.source_url);
  const canonical = canonicalUrl(job.canonical_url || job.urlNormalizada || originalUrl);
  const prefix = source.toLowerCase().replace(/\W+/g, '-') + '-';
  const external = clean(job.external_id) || (id.startsWith(prefix) ? id.slice(prefix.length) : '');
  const technologies = Array.isArray(job.technologies) ? job.technologies
    : Array.isArray(job.tecnologias) ? job.tecnologias : [];
  const result = {
    id, external_id: external || null, title, company, description,
    requirements: clean(job.requirements || job.requisitos) || null, technologies,
    job_level: clean(job.job_level || job.nivel) || null,
    job_type: clean(job.job_type || job.tipoVaga) || null,
    employment_type: clean(job.employment_type || job.tipoContrato) || null,
    work_mode: clean(job.work_mode || job.modalidade) || null,
    location: clean(job.location || job.local) || null,
    salary_min: numeric(job.salary_min ?? job.salarioMinimo),
    salary_max: numeric(job.salary_max ?? job.salarioMaximo),
    salary_currency: clean(job.salary_currency || job.moedaSalario) || null,
    experience_requirement: clean(job.experience_requirement || job.experiencia) || null,
    application_url: originalUrl || null, source,
    source_url: clean(job.source_url || job.link) || null,
    published_at: instant(job.published_at || job.publicadoEm),
    deadline: instant(job.deadline || job.expiraEm),
    first_seen_at: instant(job.first_seen_at || job.primeiraIdentificacao || job.capturadoEm || job.publicadoEm),
    last_seen_at: instant(job.last_seen_at || job.ultimaIdentificacao || job.capturadoEm || job.primeiraIdentificacao),
    last_verified_at: instant(job.last_verified_at || job.ultimaVerificacaoCandidatura),
    application_status: clean(job.application_status || job.statusCandidatura) || 'PENDING_VALIDATION',
    compatibility_score: numeric(job.compatibility_score),
    compatibility_notes: clean(job.compatibility_notes) || null,
    content_hash: clean(job.content_hash) || contentHash(description),
    canonical_url: canonical
  };
  if (result.compatibility_score !== null && result.compatibility_score > 100)
    result.compatibility_score = null;
  if (!result.first_seen_at) result.first_seen_at = instant(new Date().toISOString());
  if (!result.last_seen_at || result.last_seen_at < result.first_seen_at)
    result.last_seen_at = result.first_seen_at;
  return result;
}
async function importFile({ filePath, connectionString, dryRun = false, skipSnapshot = false }) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  if (!data || !Array.isArray(data.vagas)) throw new Error('Arquivo sem lista vagas');
  const all = [...(Array.isArray(data.historicoVagas) ? data.historicoVagas : []), ...data.vagas];
  const rows = all.map(normalizeLegacyJob);
  const reportKey = 'vagas-json:' + crypto.createHash('sha256').update(raw).digest('hex');
  if (dryRun) return { dryRun: true, jobsRead: rows.length, reportKey, persisted: false };
  if (!connectionString) throw new Error('Configure DATABASE_URL no ambiente (nunca comite credenciais)');
  // Dependência somente carregada em modo persistente.
  const { Client } = require('pg');
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('BEGIN');
    let inserted = 0, reused = 0;
    for (const row of rows) {
      const response = await client.query('SELECT * FROM tecops_upsert_job($1::jsonb)', [JSON.stringify(row)]);
      if (response.rows[0]?.is_new) inserted++;
      else reused++;
    }
    if (!skipSnapshot) {
      await client.query(
        'INSERT INTO report_snapshots (report_key, jobs_count, payload) VALUES ($1, $2, $3::jsonb) ON CONFLICT (report_key) DO NOTHING',
        [reportKey, rows.length, raw]
      );
    }
    await client.query('COMMIT');
    return { jobsRead: rows.length, inserted, reused, snapshot: skipSnapshot ? null : reportKey, persisted: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}
if (require.main === module) {
  const args = process.argv.slice(2);
  const flag = key => args.includes(key);
  const named = args.find(arg => arg.startsWith('--file='));
  const filePath = path.resolve(named ? named.slice('--file='.length) : path.join(__dirname, '..', 'data', 'vagas.json'));
  importFile({
    filePath, connectionString: process.env.DATABASE_URL,
    dryRun: flag('--dry-run'), skipSnapshot: flag('--skip-snapshot')
  }).then(value => console.log(JSON.stringify(value, null, 2)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { canonicalUrl, contentHash, normalizeLegacyJob, importFile };
