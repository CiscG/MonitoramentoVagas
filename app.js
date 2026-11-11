let vagas = [];
const quickSearchTags = new Set();
const $ = id => document.getElementById(id);
const text = value => value == null ? '' : String(value).trim();
const normalize = value => text(value).toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Editable preference profile. Candidate base location is Santa Rosa, RS.
// A match score ranks relevance; it does not assert years of professional
// developer experience or treat support/project experience as no experience.
const jobPreferences = {
  candidateLocation: 'Santa Rosa, Rio Grande do Sul',
  locations: [
    { key: 'all', label: 'Todas as localidades', points: 0 },
    { key: 'remote', label: 'Remoto — Brasil', points: 100 },
    { key: 'santa-rosa', label: 'Santa Rosa e região', points: 95 },
    { key: 'rio-grande-do-sul', label: 'Rio Grande do Sul', points: 80 },
    { key: 'santa-maria', label: 'Santa Maria', points: 65 },
    { key: 'santo-angelo', label: 'Santo Ângelo', points: 65 },
    { key: 'ijui', label: 'Ijuí', points: 65 },
    { key: 'sao-leopoldo', label: 'São Leopoldo', points: 45 },
    { key: 'porto-alegre', label: 'Porto Alegre', points: 40 }
  ],
  roles: {
    high: { points: 40, terms: ['desenvolvedor backend junior', 'desenvolvedora backend junior', 'backend developer junior', 'desenvolvedor java junior', 'desenvolvedora java junior', 'desenvolvedor python junior', 'desenvolvedora python junior', 'desenvolvedor c# junior', 'desenvolvedor .net junior', 'desenvolvedor full stack junior', 'desenvolvedora full stack junior', 'programador junior', 'programadora junior'] },
    intermediate: { points: 25, terms: ['estagio em desenvolvimento', 'estagio backend', 'estagio em programacao', 'analista de qa junior', 'analista de testes junior', 'qa automation junior', 'analista de integracao junior'] },
    secondary: { points: 10, terms: ['desenvolvedor unity', 'desenvolvedora unity', 'desenvolvedor de jogos junior', 'desenvolvedora de jogos junior', 'sistemas embarcados', 'aplicacoes iot', 'iot developer'] }
  },
  technologies: {
    'Java': ['java 17', 'java', 'spring boot', 'maven', 'junit', 'hibernate', 'apis rest'],
    'C# / .NET': ['c#', 'csharp', '.net', 'asp.net core', 'entity framework', 'sql server'],
    'Python': ['python', 'django', 'flask', 'fastapi', 'pytest', 'pandas'],
    'Banco de dados': ['postgresql', 'mysql', 'sql server', 'oracle', 'sqlite'],
    'Infraestrutura e desenvolvimento': ['linux', 'docker', 'git', 'github actions', 'ci/cd', 'api rest', 'json'],
    'QA': ['postman', 'selenium', 'cypress', 'playwright', 'robot framework', 'junit', 'pytest'],
    'Unity': ['unity', 'c#', 'desenvolvimento de jogos', 'simulacao', 'aplicacoes interativas']
  }
};

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
function jobModalityKey(job) {
  const details = normalize([job.modalidade, job.cargo, job.local, job.descricao].map(text).join(' '));
  if (/\b(hibrid[oa]s?|hybrid)\b/.test(details)) return 'hibrido';
  if (/\b(presencial|on[ -]?site|in[ -]?office|office based)\b/.test(details)) return 'presencial';
  return modalityKey(job.modalidade);
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
  [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
    .forEach(value => select.add(new Option(value, value)));
  if ([...select.options].some(option => option.value === selected)) select.value = selected;
}
function jobCategories(job) {
  return [...new Set([job.area, ...(Array.isArray(job.areas) ? job.areas : [])].map(text).filter(Boolean))];
}
function jobSearchText(job) {
  return normalize([
    job.cargo, job.empresa, job.descricao, job.local, job.nivel, job.modalidade, job.fonte, job.area,
    ...(Array.isArray(job.areas) ? job.areas : []), ...(Array.isArray(job.tags) ? job.tags : []),
    ...(Array.isArray(job.tecnologias) ? job.tecnologias : []), ...(Array.isArray(job.especializacoes) ? job.especializacoes : [])
  ].map(text).join(' '));
}
function locationScore(job) {
  const location = normalize([job.local, job.cargo, job.descricao].map(text).join(' '));
  const modality = jobModalityKey(job);
  if (modality === 'remoto') return 100;
  if (location.includes('santa rosa')) return 95;
  if (location.includes('rio grande do sul') || /(^|[\s,/-])rs($|[\s,/-])/.test(location)) return 80;
  if (location.includes('santa maria')) return 65;
  if (location.includes('santo angelo')) return 65;
  if (location.includes('ijui')) return 65;
  if (location.includes('sao leopoldo')) return 45;
  if (location.includes('porto alegre')) return 40;
  // Unknown in-person location has a substantial commute penalty; hybrid is
  // penalized less because it may require fewer commute days.
  if (modality === 'presencial') return 5;
  if (modality === 'hibrido') return 25;
  return 20;
}
function roleScore(job) {
  const title = normalize(job.cargo);
  const roleMatch = terms => terms.some(term => title.includes(normalize(term)));
  if (roleMatch(jobPreferences.roles.high.terms)) return jobPreferences.roles.high.points;
  if (roleMatch(jobPreferences.roles.intermediate.terms)) return jobPreferences.roles.intermediate.points;
  if (roleMatch(jobPreferences.roles.secondary.terms)) return jobPreferences.roles.secondary.points;
  return 0;
}
function technologyMatches(job) {
  const content = jobSearchText(job);
  return Object.entries(jobPreferences.technologies)
    .map(([group, terms]) => ({ group, matches: terms.filter(term => content.includes(normalize(term))) }))
    .filter(group => group.matches.length);
}
function matchScore(job) {
  const techScore = Math.min(technologyMatches(job).reduce((sum, item) => sum + Math.min(item.matches.length, 2), 0) * 3, 24);
  const modalityAdjustment = jobModalityKey(job) === 'presencial' && locationScore(job) < 70 ? -15 : 0;
  return roleScore(job) + locationScore(job) + techScore + modalityAdjustment;
}
function addPreferenceFilters() {
  const filters = document.querySelector('.filters');
  if (!filters) return;
  if (!$('priority-location')) {
    const locationSelect = el('select');
    locationSelect.id = 'priority-location';
    locationSelect.setAttribute('aria-label', 'Prioridade de localização');
    locationSelect.replaceChildren(new Option('Todas as prioridades de local', ''), ...jobPreferences.locations.slice(1).map(item => new Option(item.label, item.key)));
    filters.append(locationSelect);
    locationSelect.addEventListener('change', render);
  }
  if (!$('category')) {
    const categorySelect = el('select');
    categorySelect.id = 'category';
    categorySelect.setAttribute('aria-label', 'Filtrar categoria');
    filters.append(categorySelect);
    categorySelect.addEventListener('change', render);
  }
  if (!$('profile-match')) {
    const label = el('label', 'profile-filter');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox'; checkbox.id = 'profile-match';
    checkbox.addEventListener('change', render);
    label.append(checkbox, document.createTextNode(' Priorizar vagas compatíveis com meu perfil (localidade, cargo e tecnologias)'));
    label.style.gridColumn = '1 / -1';
    filters.append(label);
  }
}
function addQuickSearchTags() {
  const filters = document.querySelector('.filters');
  if (!filters || filters.querySelector('[data-quick-search-tags]')) return;
  const group = el('div');
  group.dataset.quickSearchTags = '';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Tags rápidas de pesquisa');
  Object.assign(group.style, { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', gridColumn: '1 / -1', marginTop: '4px' });
  group.append(el('span', '', 'Tags rápidas:'));
  [['remoto', 'Remoto'], ['hibrido', 'Híbrido'], ['presencial', 'Presencial']].forEach(([key, title]) => {
    const button = el('button', '', title);
    button.type = 'button'; button.dataset.quickSearchTag = key; button.setAttribute('aria-pressed', 'false');
    Object.assign(button.style, { border: '1px solid #cbd5e1', borderRadius: '999px', padding: '6px 12px', background: '#fff', cursor: 'pointer' });
    button.addEventListener('click', () => {
      if (quickSearchTags.has(key)) quickSearchTags.delete(key); else quickSearchTags.add(key);
      button.setAttribute('aria-pressed', String(quickSearchTags.has(key)));
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
  const priorityLocation = $('priority-location')?.value || '';
  const category = normalize($('category')?.value || '');
  const prioritizeProfile = Boolean($('profile-match')?.checked);
  const period = $('period')?.value || '';
  const sort = $('sort')?.value || 'recent';
  const now = Date.now();
  const cutoff = period === '24h' ? now - 86400000 : period === '7d' ? now - 7 * 86400000 : null;
  const filtered = vagas.filter(job => {
    const content = jobSearchText(job);
    const jobLocation = normalize([job.local, job.cargo, job.descricao].map(text).join(' '));
    const categories = jobCategories(job);
    const modality = jobModalityKey(job);
    const matchesSearch = !search || search.split(/\s+/).every(term => content.includes(term));
    const matchesLevel = !level || levelKey(job.nivel) === levelKey(level);
    const matchesMode = !mode || modality === mode;
    const matchesSource = !source || text(job.fonte) === source;
    const matchesLocation = !location || text(job.local) === location;
    const matchesPriorityLocation = !priorityLocation || priorityLocation === 'remote' && modality === 'remoto'
      || priorityLocation === 'santa-rosa' && (jobLocation.includes('santa rosa') || modality === 'remoto')
      || priorityLocation === 'rio-grande-do-sul' && (jobLocation.includes('rio grande do sul') || /(^|[\s,/-])rs($|[\s,/-])/.test(jobLocation) || modality === 'remoto')
      || priorityLocation === 'santa-maria' && (jobLocation.includes('santa maria') || modality === 'remoto')
      || priorityLocation === 'santo-angelo' && (jobLocation.includes('santo angelo') || modality === 'remoto')
      || priorityLocation === 'ijui' && (jobLocation.includes('ijui') || modality === 'remoto')
      || priorityLocation === 'sao-leopoldo' && (jobLocation.includes('sao leopoldo') || modality === 'remoto')
      || priorityLocation === 'porto-alegre' && (jobLocation.includes('porto alegre') || modality === 'remoto');
    const matchesCategory = !category || categories.some(item => normalize(item) === category);
    const selectedModes = ['remoto', 'hibrido', 'presencial'].filter(item => quickSearchTags.has(item));
    const matchesQuickMode = !selectedModes.length || selectedModes.includes(modality);
    const matchesProfile = !prioritizeProfile || roleScore(job) > 0 || technologyMatches(job).length > 0 || locationScore(job) >= 70;
    const published = dateValue(job.publicadoEm);
    const matchesPeriod = cutoff === null || (published !== null && published >= cutoff && published <= now);
    return matchesSearch && matchesLevel && matchesMode && matchesSource && matchesLocation && matchesPriorityLocation
      && matchesCategory && matchesQuickMode && matchesProfile && matchesPeriod;
  });
  filtered.sort((a, b) => {
    if (prioritizeProfile && matchScore(a) !== matchScore(b)) return matchScore(b) - matchScore(a);
    if (sort === 'company') return text(a.empresa).localeCompare(text(b.empresa), 'pt-BR', { sensitivity: 'base' });
    if (sort === 'title') return text(a.cargo).localeCompare(text(b.cargo), 'pt-BR', { sensitivity: 'base' });
    return (dateValue(b.publicadoEm) || 0) - (dateValue(a.publicadoEm) || 0);
  });
  const count = $('count');
  if (count) count.textContent = `${filtered.length} de ${vagas.length} ${vagas.length === 1 ? 'vaga' : 'vagas'}`;
  const box = $('jobs');
  if (!box) return;
  box.replaceChildren();
  if (!filtered.length) { box.append(el('p', 'empty', 'Nenhuma vaga encontrada com os filtros atuais.')); return; }
  filtered.forEach(job => {
    const card = el('article', 'job');
    const tags = el('div', 'tags');
    [job.nivel || 'Não informado', jobModalityKey(job) === 'hibrido' ? 'Híbrido' : jobModalityKey(job) === 'presencial' ? 'Presencial' : job.modalidade || 'Não informado', job.fonte || 'Não informado']
      .forEach(tag => tags.append(el('span', 'tag', text(tag))));
    card.append(tags, el('h3', '', text(job.cargo) || 'Cargo não informado'));
    const techMatches = technologyMatches(job);
    const score = matchScore(job);
    const match = el('p', 'match-score', `Aderência: ${score} pontos · Local ${locationScore(job)}/100 · Cargo ${roleScore(job)}/40`);
    match.style.cssText = 'font-size:.85rem;color:#475569;margin:.4rem 0';
    card.append(match);
    if (techMatches.length) card.append(el('p', 'match-tech', `Tecnologias: ${techMatches.map(group => group.group).join(' · ')}`));
    card.append(el('div', 'meta', `${text(job.empresa) || 'Empresa não informada'} · ${text(job.local) || 'Local não informado'} · ${formatDate(job.publicadoEm)}`),
      el('p', 'description', text(job.descricao) || 'Consulte os requisitos no anúncio original.'));
    if (/^https:\/\//i.test(text(job.link))) {
      const link = el('a', 'apply', 'Ver oportunidade'); link.href = text(job.link); link.target = '_blank'; link.rel = 'noopener noreferrer'; card.append(link);
    }
    box.append(card);
  });
}
function clearFilters() {
  ['search', 'level', 'mode', 'source', 'location', 'priority-location', 'category', 'period'].forEach(id => { if ($(id)) $(id).value = ''; });
  quickSearchTags.clear();
  document.querySelectorAll('[data-quick-search-tag]').forEach(button => button.setAttribute('aria-pressed', 'false'));
  if ($('profile-match')) $('profile-match').checked = false;
  if ($('sort')) $('sort').value = 'recent';
  render();
}
async function load() {
  try {
    const response = await fetch(`./data/vagas.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    vagas = Array.isArray(data.vagas) ? data.vagas.filter(job => job && typeof job === 'object') : [];
    if ($('updated')) {
      const timestamp = dateValue(data.atualizadoEm);
      $('updated').textContent = timestamp === null ? 'Aguardando a primeira sincronização' : `Atualizado em ${new Date(timestamp).toLocaleString('pt-BR')}`;
    }
    if ($('total')) $('total').textContent = String(vagas.length);
    if ($('remote')) $('remote').textContent = String(vagas.filter(job => jobModalityKey(job) === 'remoto').length);
    if ($('intern')) $('intern').textContent = String(vagas.filter(job => levelKey(job.nivel) === 'estagio').length);
    populateSelect('source', vagas.map(job => job.fonte), 'Todas as fontes');
    populateSelect('location', vagas.map(job => job.local), 'Todas as localizações');
    populateSelect('category', vagas.flatMap(jobCategories), 'Todas as categorias');
    render();
  } catch (error) {
    if ($('updated')) $('updated').textContent = 'Falha ao atualizar os dados';
    const box = $('jobs');
    if (box && !vagas.length) box.replaceChildren(el('p', 'empty error', 'Não foi possível carregar as vagas. Tente atualizar a página.'));
    else render();
    console.error(error);
  }
}
addPreferenceFilters();
addQuickSearchTags();
['search', 'level', 'mode', 'source', 'location', 'priority-location', 'category', 'period', 'sort'].forEach(id => {
  const control = $(id);
  if (control) control.addEventListener(id === 'search' ? 'input' : 'change', render);
});
if ($('clear-filters')) $('clear-filters').addEventListener('click', clearFilters);
load();
setInterval(load, 5 * 60 * 1000);
