let vagas = [];
const quickSearchTags = new Set();
const $ = id => document.getElementById(id);
const text = value => value == null ? '' : String(value).trim();
const normalize = value => text(value).toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Keep the document and visible brand consistent with the requested rename.
document.title = 'TecOps — oportunidades em tecnologia';
const pageHeading = document.querySelector('header h1');
if (pageHeading) pageHeading.textContent = 'TecOps';

function el(tag, cls, content) {
  const element = document.createElement(tag);
  if (cls) element.className = cls;
  if (content !== undefined) element.textContent = content;
  return element;
}

function formatDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('pt-BR') : 'Data não informada';
}

function levelKey(value) {
  const level = normalize(value);
  if (!level) return 'nao-informado';
  if (level.includes('estag')) return 'estagio';
  if (level.includes('trainee')) return 'trainee';
  if (level.includes('junior') || level === 'jr') return 'junior';
  return level;
}

function modalityKey(value) {
  const mode = normalize(value);
  if (mode.includes('hibrid') || mode.includes('hybrid')) return 'hibrido';
  if (mode.includes('presencial') || mode.includes('on-site') || mode.includes('onsite') || mode === 'office') return 'presencial';
  if (mode.includes('remot') || mode.includes('home office') || mode.includes('homeoffice')) return 'remoto';
  return mode;
}

// Some providers label every result as remote. Prefer explicit modality wording
// in the title/location/description so hybrid and onsite jobs are not hidden.
function jobModalityKey(job) {
  const details = normalize([job.modalidade, job.cargo, job.local, job.descricao].map(text).join(' '));
  if (/\b(hibrid[oa]s?|hybrid)\b/.test(details)) return 'hibrido';
  if (/\b(presencial|on[ -]?site|in[ -]?office|office based)\b/.test(details)) return 'presencial';
  return modalityKey(job.modalidade);
}

function isRioGrandeDoSul(value) {
  const location = normalize(value);
  return location.includes('rio grande do sul') || /(^|[\s,/-])rs($|[\s,/-])/.test(location);
}

function jobCategories(job) {
  const values = [job.area, ...(Array.isArray(job.areas) ? job.areas : [])];
  return [...new Set(values.map(text).filter(Boolean))];
}

function jobSearchText(job) {
  return normalize([
    job.cargo, job.empresa, job.descricao, job.local, job.nivel,
    job.modalidade, job.fonte, job.area,
    ...(Array.isArray(job.areas) ? job.areas : []),
    ...(Array.isArray(job.tags) ? job.tags : []),
    ...(Array.isArray(job.tecnologias) ? job.tecnologias : []),
    ...(Array.isArray(job.especializacoes) ? job.especializacoes : [])
  ].map(text).join(' '));
}

function dateValue(value) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function populateSelect(id, values, placeholder) {
  const select = $(id);
  if (!select) return;
  const selected = select.value;
  select.replaceChildren(new Option(placeholder, ''));
  [...new Set(values.map(text).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
    .forEach(value => select.add(new Option(value, value)));
  if ([...select.options].some(option => option.value === selected)) select.value = selected;
}

function populateModalityFilter() {
  const select = $('mode');
  if (!select) return;
  const selected = modalityKey(select.value);
  select.replaceChildren(
    new Option('Todas as modalidades', ''),
    new Option('Remoto', 'remoto'),
    new Option('Híbrido', 'hibrido'),
    new Option('Presencial', 'presencial')
  );
  if (['remoto', 'hibrido', 'presencial'].includes(selected)) select.value = selected;
}

function addCategoryFilter() {
  const filters = document.querySelector('.filters');
  if (!filters || $('category')) return;
  const select = el('select');
  select.id = 'category';
  select.setAttribute('aria-label', 'Filtrar categoria');
  filters.append(select);
  select.addEventListener('change', render);
}

function refreshQuickSearchTags() {
  document.querySelectorAll('[data-quick-search-tag]').forEach(button => {
    const active = quickSearchTags.has(button.dataset.quickSearchTag);
    button.setAttribute('aria-pressed', String(active));
    button.style.background = active ? '#2563eb' : '#fff';
    button.style.color = active ? '#fff' : '#1f2937';
    button.style.borderColor = active ? '#2563eb' : '#cbd5e1';
  });
}

function addQuickSearchTags() {
  const filters = document.querySelector('.filters');
  if (!filters || filters.querySelector('[data-quick-search-tags]')) return;
  const group = el('div');
  group.dataset.quickSearchTags = '';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Tags rápidas de pesquisa');
  Object.assign(group.style, { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', gridColumn: '1 / -1', marginTop: '4px' });
  const label = el('span', '', 'Tags rápidas:');
  Object.assign(label.style, { fontSize: '0.85rem', fontWeight: '600', color: '#475569' });
  group.append(label);
  [
    ['remoto', 'Remoto'], ['hibrido', 'Híbrido'], ['presencial', 'Presencial'],
    ['santa-rosa', 'Santa Rosa'], ['rio-grande-do-sul', 'Rio Grande do Sul (RS)']
  ].forEach(([key, title]) => {
    const button = el('button', '', title);
    button.type = 'button';
    button.dataset.quickSearchTag = key;
    button.setAttribute('aria-pressed', 'false');
    Object.assign(button.style, { border: '1px solid #cbd5e1', borderRadius: '999px', padding: '6px 12px', background: '#fff', color: '#1f2937', cursor: 'pointer', font: 'inherit', fontSize: '0.85rem' });
    button.addEventListener('click', () => {
      if (quickSearchTags.has(key)) quickSearchTags.delete(key);
      else quickSearchTags.add(key);
      refreshQuickSearchTags();
      render();
    });
    group.append(button);
  });
  filters.append(group);
}

function render() {
  const search = normalize($('search')?.value);
  const level = $('level')?.value || '';
  const mode = modalityKey($('mode')?.value || '');
  const source = $('source')?.value || '';
  const location = $('location')?.value || '';
  const category = normalize($('category')?.value || '');
  const period = $('period')?.value || '';
  const sort = $('sort')?.value || 'recent';
  const now = Date.now();
  const cutoff = period === '24h' ? now - 24 * 60 * 60 * 1000 : period === '7d' ? now - 7 * 24 * 60 * 60 * 1000 : null;

  const filtered = vagas.filter(job => {
    const categories = jobCategories(job);
    const modality = jobModalityKey(job);
    const jobLocation = normalize(job.local);
    const matchesSearch = !search || search.split(/\s+/).every(term => jobSearchText(job).includes(term));
    const matchesLevel = !level || levelKey(job.nivel) === levelKey(level);
    const matchesMode = !mode || modality === mode;
    const matchesSource = !source || text(job.fonte) === source;
    const matchesLocation = !location || text(job.local) === location;
    const matchesCategory = !category || categories.some(value => normalize(value) === category);
    const selectedModalities = ['remoto', 'hibrido', 'presencial'].filter(key => quickSearchTags.has(key));
    const matchesQuickMode = !selectedModalities.length || selectedModalities.includes(modality);
    const matchesSantaRosa = !quickSearchTags.has('santa-rosa') || jobLocation.includes('santa rosa');
    const matchesRioGrandeDoSul = !quickSearchTags.has('rio-grande-do-sul') || isRioGrandeDoSul(job.local);
    const published = dateValue(job.publicadoEm);
    const matchesPeriod = cutoff === null || (published !== null && published >= cutoff && published <= now);
    return matchesSearch && matchesLevel && matchesMode && matchesSource && matchesLocation
      && matchesCategory && matchesQuickMode && matchesSantaRosa && matchesRioGrandeDoSul && matchesPeriod;
  });

  filtered.sort((a, b) => {
    if (sort === 'company') return text(a.empresa).localeCompare(text(b.empresa), 'pt-BR', { sensitivity: 'base' });
    if (sort === 'title') return text(a.cargo).localeCompare(text(b.cargo), 'pt-BR', { sensitivity: 'base' });
    const dateA = dateValue(a.publicadoEm);
    const dateB = dateValue(b.publicadoEm);
    if (dateA === null && dateB === null) return 0;
    if (dateA === null) return 1;
    if (dateB === null) return -1;
    return dateB - dateA;
  });

  const count = $('count');
  if (count) count.textContent = `${filtered.length} de ${vagas.length} ${vagas.length === 1 ? 'vaga' : 'vagas'}`;
  const box = $('jobs');
  if (!box) return;
  box.replaceChildren();
  if (!filtered.length) {
    box.append(el('p', 'empty', 'Nenhuma vaga encontrada com os filtros atuais.'));
    return;
  }
  filtered.forEach(job => {
    const card = el('article', 'job');
    const tags = el('div', 'tags');
    [job.nivel || 'Não informado', jobModalityKey(job) === 'hibrido' ? 'Híbrido' : jobModalityKey(job) === 'presencial' ? 'Presencial' : job.modalidade || 'Não informado', job.fonte || 'Não informado']
      .forEach(tag => tags.append(el('span', 'tag', text(tag))));
    card.append(tags, el('h3', '', text(job.cargo) || 'Cargo não informado'),
      el('div', 'meta', `${text(job.empresa) || 'Empresa não informada'} · ${text(job.local) || 'Local não informado'} · ${formatDate(job.publicadoEm)}`),
      el('p', 'description', text(job.descricao) || 'Consulte os requisitos no anúncio original.'));
    if (/^https:\/\//i.test(text(job.link))) {
      const link = el('a', 'apply', 'Ver oportunidade');
      link.href = text(job.link);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      card.append(link);
    }
    box.append(card);
  });
}

function clearFilters() {
  ['search', 'level', 'mode', 'source', 'location', 'category', 'period'].forEach(id => { if ($(id)) $(id).value = ''; });
  quickSearchTags.clear();
  refreshQuickSearchTags();
  if ($('sort')) $('sort').value = 'recent';
  render();
}

async function load() {
  try {
    const response = await fetch(`./data/vagas.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    vagas = Array.isArray(data.vagas) ? data.vagas.filter(job => job && typeof job === 'object') : [];
    const updated = $('updated');
    if (updated) {
      const timestamp = dateValue(data.atualizadoEm);
      updated.textContent = timestamp === null ? 'Aguardando a primeira sincronização' : `Atualizado em ${new Date(timestamp).toLocaleString('pt-BR')}`;
    }
    if ($('total')) $('total').textContent = String(vagas.length);
    if ($('remote')) $('remote').textContent = String(vagas.filter(job => jobModalityKey(job) === 'remoto').length);
    if ($('intern')) $('intern').textContent = String(vagas.filter(job => levelKey(job.nivel) === 'estagio').length);
    populateSelect('source', vagas.map(job => job.fonte), 'Todas as fontes');
    populateSelect('location', vagas.map(job => job.local), 'Todas as localizações');
    populateSelect('category', vagas.flatMap(jobCategories), 'Todas as categorias');
    render();
  } catch (error) {
    const updated = $('updated');
    if (updated) updated.textContent = 'Falha ao atualizar os dados';
    const box = $('jobs');
    if (box && !vagas.length) box.replaceChildren(el('p', 'empty error', 'Não foi possível carregar as vagas. Tente atualizar a página.'));
    else render();
    console.error(error);
  }
}

addCategoryFilter();
addQuickSearchTags();
populateModalityFilter();
['search', 'level', 'mode', 'source', 'location', 'category', 'period', 'sort'].forEach(id => {
  const control = $(id);
  if (control) control.addEventListener(id === 'search' ? 'input' : 'change', render);
});
if ($('clear-filters')) $('clear-filters').addEventListener('click', clearFilters);
load();
setInterval(load, 5 * 60 * 1000);
