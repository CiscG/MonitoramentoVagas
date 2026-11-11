#!/usr/bin/env node
/**
 * Modular, consent-conscious public job-board collectors.
 * Runtime: Node.js 18+ (native fetch). No browser automation, private endpoints,
 * credential bypass, CAPTCHA solving, or LinkedIn/Indeed scraping.
 */

const DEFAULT_TIMEOUT_MS = 15_000;
const USER_AGENT = 'TecOpsJobCollector/1.0 (+public job-board API client)';

function clean(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(clean).filter(Boolean).join('\n');
  if (typeof value === 'object') return clean(value.name || value.value || value.description || '');
  return String(value).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'").replace(/\s+/g, ' ').trim();
}

function normalizeModality(...values) {
  const value = values.map(clean).join(' ').toLocaleLowerCase('pt-BR');
  if (/\b(hybrid|h[ií]brid[oa])\b/.test(value)) return 'Híbrido';
  if (/\b(on[ -]?site|in[ -]?office|presencial|office based)\b/.test(value)) return 'Presencial';
  if (/\b(remote|remot[oa]|work from home|home office)\b/.test(value)) return 'Remoto';
  return 'Não informada';
}

function locationFrom(job) {
  const location = job.location || job.jobLocation || job.address || job.locations || job.city || '';
  if (typeof location === 'string') return clean(location);
  if (Array.isArray(location)) return location.map(locationFrom).filter(Boolean).join(', ');
  if (location && typeof location === 'object') {
    const address = location.address || location;
    return [address.addressLocality, address.addressRegion, address.addressCountry].map(clean).filter(Boolean).join(', ')
      || clean(location.name);
  }
  return '';
}

function normalizeJob(job, { source, company = '', fallbackUrl = '' } = {}) {
  const title = clean(job.title || job.text || job.name || job.position);
  const url = clean(job.absolute_url || job.hostedUrl || job.applyUrl || job.url || job.jobUrl || fallbackUrl);
  if (!title || !/^https:\/\//i.test(url)) return null;
  const description = clean(job.content || job.description || job.descriptionPlain || job.descriptionHtml || job.requirements || '');
  const location = locationFrom(job) || clean(job.workplaceType || job.workplace || '');
  const modality = normalizeModality(job.workplaceType, job.workplace, job.remote, job.location, description, title);
  const org = job.company && typeof job.company === 'object' ? clean(job.company.name) : clean(job.company || job.organization || company);
  const id = clean(job.id || job.requisitionId || job.shortcode || url);
  const tags = Array.isArray(job.categories) ? job.categories.map(clean).filter(Boolean) : [];
  return {
    id: `${source.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-')}-${id}`,
    cargo: title,
    empresa: org || company || 'Empresa não informada',
    local: location || 'Local não informado',
    modalidade: modality,
    descricao: description,
    requisitos: clean(job.qualifications || job.requirements || ''),
    publicadoEm: clean(job.publishedAt || job.createdAt || job.datePosted || job.updatedAt),
    fonte: source,
    link: url,
    tags
  };
}

async function requestJson(url, { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function arrayAt(data, key) {
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.[key]) ? data[key] : [];
}

// Greenhouse's documented public Job Board API.
async function collectGreenhouse({ boardToken, company = '', fetchImpl, timeoutMs } = {}) {
  if (!boardToken) throw new Error('boardToken é obrigatório');
  const data = await requestJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs?content=true`, { fetchImpl, timeoutMs });
  return arrayAt(data, 'jobs').map(job => normalizeJob(job, { source: 'Greenhouse', company })).filter(Boolean);
}

// Lever's documented public postings API.
async function collectLever({ site, company = '', fetchImpl, timeoutMs } = {}) {
  if (!site) throw new Error('site (slug do job board Lever) é obrigatório');
  const data = await requestJson(`https://api.lever.co/v0/postings/${encodeURIComponent(site)}?mode=json`, { fetchImpl, timeoutMs });
  return arrayAt(data, '').map(job => normalizeJob({ ...job, title: job.text, location: job.categories?.location, description: job.description, requirements: job.additional }, { source: 'Lever', company })).filter(Boolean);
}

// Ashby's documented public job posting API.
async function collectAshby({ boardName, company = '', fetchImpl, timeoutMs } = {}) {
  if (!boardName) throw new Error('boardName é obrigatório');
  const data = await requestJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(boardName)}`, { fetchImpl, timeoutMs });
  return arrayAt(data, 'jobs').map(job => normalizeJob({ ...job, title: job.title, location: job.location, workplaceType: job.workplaceType, description: job.descriptionPlain || job.descriptionHtml, publishedAt: job.publishedAt, url: job.jobUrl }, { source: 'Ashby', company })).filter(Boolean);
}

function collectJsonLdJobs(value, output = []) {
  if (Array.isArray(value)) value.forEach(item => collectJsonLdJobs(item, output));
  else if (value && typeof value === 'object') {
    const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
    if (types.includes('JobPosting')) output.push(value);
    if (value['@graph']) collectJsonLdJobs(value['@graph'], output);
  }
  return output;
}

// Public career pages only: reads JSON-LD JobPosting markup, not hidden APIs.
async function collectPublicCareerPage({ url, company = '', source = 'Página de carreiras', fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!url || !/^https:\/\//i.test(url)) throw new Error('URL HTTPS pública é obrigatória');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { headers: { Accept: 'text/html', 'User-Agent': USER_AGENT }, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const scripts = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    const jobs = [];
    for (const match of scripts) {
      try { jobs.push(...collectJsonLdJobs(JSON.parse(match[1]))); } catch { /* malformed page metadata: continue to other blocks */ }
    }
    return jobs.map(job => normalizeJob({ ...job, url: job.url || job.sameAs || url }, { source, company, fallbackUrl: url })).filter(Boolean);
  } finally {
    clearTimeout(timer);
  }
}

const publicPageSource = source => async config => collectPublicCareerPage({ ...config, source });

// Each configured source is isolated. A failed board yields a diagnostic but
// never prevents the other boards' results from being returned.
async function collectAll(config = {}, { fetchImpl = fetch } = {}) {
  const collectors = [
    ...(config.greenhouse || []).map(item => ({ name: `Greenhouse:${item.boardToken}`, run: () => collectGreenhouse({ ...item, fetchImpl }) })),
    ...(config.lever || []).map(item => ({ name: `Lever:${item.site}`, run: () => collectLever({ ...item, fetchImpl }) })),
    ...(config.ashby || []).map(item => ({ name: `Ashby:${item.boardName}`, run: () => collectAshby({ ...item, fetchImpl }) })),
    ...(config.gupyPublicPages || []).map(item => ({ name: `Gupy:${item.company || item.url}`, run: () => publicPageSource('Gupy')(item) })),
    ...(config.workablePublicPages || []).map(item => ({ name: `Workable:${item.company || item.url}`, run: () => publicPageSource('Workable')(item) })),
    ...(config.solidesPublicPages || []).map(item => ({ name: `Sólides:${item.company || item.url}`, run: () => publicPageSource('Sólides')(item) })),
    ...(config.companyCareerPages || []).map(item => ({ name: `Carreiras:${item.company || item.url}`, run: () => publicPageSource(item.source || 'Página oficial de carreiras')(item) }))
  ];

  const outcomes = await Promise.allSettled(collectors.map(source => source.run()));
  const jobs = [];
  const diagnostics = outcomes.map((outcome, index) => {
    const source = collectors[index].name;
    if (outcome.status === 'rejected') return { source, success: false, count: 0, error: String(outcome.reason?.message || outcome.reason) };
    jobs.push(...outcome.value);
    return { source, success: true, count: outcome.value.length, error: null };
  });
  const unique = [...new Map(jobs.map(job => [job.link, job])).values()];
  return { jobs: unique, diagnostics, fallbackUsed: diagnostics.some(item => !item.success) || jobs.length === 0 };
}

module.exports = {
  collectGreenhouse,
  collectLever,
  collectAshby,
  collectPublicCareerPage,
  collectAll,
  normalizeJob,
  normalizeModality
};
