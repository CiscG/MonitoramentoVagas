let vagas = [];
const quickSearchTags = new Set();
const $ = id => document.getElementById(id);
const text = value => value == null ? '' : String(value).trim();
const normalize = value => text(value).toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Editable candidate profile and scoring weights (sum to exactly 100).
const jobPreferences = {
  candidateLocation: 'Santa Rosa, Rio Grande do Sul',
  locations: [
    { key: 'remote', label: 'Remoto — Brasil', points: 15 },
    { key: 'santa-rosa', label: 'Santa Rosa e região', points: 15 },
    { key: 'rio-grande-do-sul', label: 'Rio Grande do Sul', points: 12 },
    { key: 'santa-maria', label: 'Santa Maria', points: 9 },
    { key: 'santo-angelo', label: 'Santo Ângelo', points: 9 },
    { key: 'ijui', label: 'Ijuí', points: 9 },
    { key: 'sao-leopoldo', label: 'São Leopoldo', points: 6 },
    { key: 'porto-alegre', label: 'Porto Alegre', points: 6 }
  ],
  roles: {
    high: { terms: ['desenvolvedor backend junior', 'desenvolvedora backend junior', 'backend developer junior', 'desenvolvedor java junior', 'desenvolvedora java junior', 'desenvolvedor python junior', 'desenvolvedora python junior', 'desenvolvedor c# junior', 'desenvolvedor .net junior', 'desenvolvedor full stack junior', 'desenvolvedora full stack junior', 'programador junior', 'programadora junior'] },
    intermediate: { terms: ['estagio em desenvolvimento', 'estagio backend', 'estagio em programacao', 'analista de qa junior', 'analista de testes junior', 'qa automation junior', 'analista de integracao junior'] },
    secondary: { terms: ['desenvolvedor unity', 'desenvolvedora unity', 'desenvolvedor de jogos junior', 'desenvolvedora de jogos junior', 'sistemas embarcados', 'aplicacoes iot', 'iot developer'] }
  },
  technologies: {
    Java: ['java 17', 'java', 'spring boot', 'maven', 'junit', 'hibernate', 'apis rest'],
    'C# / .NET': ['c#', 'csharp', '.net', 'asp.net core', 'entity framework', 'sql server'],
    Python: ['python', 'django', 'flask', 'fastapi', 'pytest', 'pandas'],
    'Banco de dados': ['postgresql', 'mysql', 'sql server', 'oracle', 'sqlite'],
    'Infraestrutura e desenvolvimento': ['linux', 'docker', 'git', 'github actions', 'ci/cd', 'api rest', 'json'],
    QA: ['postman', 'selenium', 'cypress', 'playwright', 'robot framework', 'junit', 'pytest'],
    Unity: ['unity', 'c#', 'desenvolvimento de jogos', 'simulacao', 'aplicacoes interativas']
  }
};

const EXPERIENCE = {
  SEM_EXPERIENCIA: { label: 'Aceita iniciantes', rank: 0 },
  EXPERIENCIA_DIFERENCIAL: { label: 'Experiência é diferencial', rank: 1 },
  EXPERIENCIA_INICIAL: { label: 'Projetos/estágios aceitos', rank: 2 },
  EXPERIENCIA_NAO_INFORMADA: { label: 'Experiência não informada', rank: 3 },
  EXPERIENCIA_OBRIGATORIA: { label: 'Exige experiência formal', rank: 4 }
};
const APPLICATION_STATUS = {
  ACTIVE: 'Candidatura confirmada aberta',
  CLOSED: 'Vaga encerrada',
  EXPIRED: 'Prazo de candidatura expirado',
  PENDING_VALIDATION: 'Candidatura pendente de validação',
  SOURCE_UNAVAILABLE: 'Fonte indisponível'
};

const SCORE_RANGES = Object.freeze({
  '85-100': [85, 100],
  '70-84': [70, 84],
  '50-69': [50, 69],
  '30-49': [30, 49],
  '0-29': [0, 29]
});

document.title = 'TecOps — oportunidades em tecnologia';

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
function formatTimestamp(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('pt-BR') : 'Nunca verificada';
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
  const explicit = modalityKey(job.modalidade || job.work_mode || '');
  if (explicit) return explicit;
  const title = normalize(job.cargo || job.title);
  if (/\b(hibrid[oa]s?|hybrid)\b/.test(title)) return 'hibrido';
  if (/\b(presencial|on[ -]?site|onsite)\b/.test(title)) return 'presencial';
  if (/\b(remot[oa]s?|remote|home[ -]?office)\b/.test(title)) return 'remoto';
  return 'nao informada';
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
    job.cargo, job.empresa, job.descricao, job.requisitos, job.local, job.nivel, job.modalidade,
    job.fonte, job.area, job.experienciaClassificacao, job.classificacaoExperiencia,
    ...(Array.isArray(job.areas) ? job.areas : []), ...(Array.isArray(job.tags) ? job.tags : []),
    ...(Array.isArray(job.tecnologias) ? job.tecnologias : []), ...(Array.isArray(job.especializacoes) ? job.especializacoes : [])
  ].map(text).join(' '));
}
function classifyExperience(job) {
  const body = normalize([job.cargo, job.descricao, job.requisitos, job.experiencia].map(text).join(' '));
  if (!body.trim()) return 'EXPERIENCIA_NAO_INFORMADA';
  if (/\b(sem experiencia|nao exige experiencia|nao requer experiencia|nao precisa de experiencia|experiencia nao necessaria|no experience required|no prior experience|entry.level|accepts? beginners?|iniciantes? (sao )?bem.vindos?)\b/.test(body)) return 'SEM_EXPERIENCIA';
  const mandatory = /\b(experiencia (profissional )?(comprovada|previa|anterior) obrigatoria|experiencia profissional obrigatoria|experiencia (profissional )?(e|eh) obrigatoria|experiencia (profissional )?exigida|exige experiencia (profissional )?|requer experiencia (profissional )?|required (professional )?experience|must have (professional )?experience|minimum of? ?\d+ years? (of )?(professional )?experience|\d+\+? years? of (professional )?experience|required:.*experience|experiencia minima de \d+ anos)\b/.test(body);
  const preferred = /\b(experiencia (e|eh) (desejavel|diferencial|um diferencial|preferencial)|experiencia desejavel|sera um diferencial.*experiencia|diferencial.*experiencia|nice to have.*experience|preferred.*experience|experience is a plus|experience preferred)\b/.test(body);
  if (preferred && !mandatory) return 'EXPERIENCIA_DIFERENCIAL';
  if (mandatory) return 'EXPERIENCIA_OBRIGATORIA';
  if (/\b(projetos? (academicos?|pessoais?|proprios?)|portfolio|portifolio|estagios?|experiencia pratica|pratica em projetos|vivencia pratica|projetos relevantes|academic projects|personal projects|internship|internships|equivalent practical experience)\b/.test(body)) return 'EXPERIENCIA_INICIAL';
  return 'EXPERIENCIA_NAO_INFORMADA';
}
function experienceInfo(job) {
  const value = text(job.experienciaClassificacao || job.classificacaoExperiencia);
  return EXPERIENCE[value] ? value : classifyExperience(job);
}
function applicationStatus(job) {
  const status = text(job.statusCandidatura).toUpperCase();
  return Object.prototype.hasOwnProperty.call(APPLICATION_STATUS, status) ? status : 'PENDING_VALIDATION';
}
function locationScore(job) {
  const location = normalize([job.local, job.cargo, job.descricao].map(text).join(' '));
  const modality = jobModalityKey(job);
  if (modality === 'remoto') return 15;
  if (location.includes('santa rosa')) return 15;
  if (location.includes('rio grande do sul') || /(^|[\s,/-])rs($|[\s,/-])/.test(location)) return 12;
  if (location.includes('santa maria') || location.includes('santo angelo') || location.includes('ijui')) return 9;
  if (location.includes('sao leopoldo') || location.includes('porto alegre')) return 6;
  return modality === 'presencial' ? 0 : modality === 'hibrido' ? 4 : 3;
}
function roleScore(job) {
  const title = normalize(job.cargo);
  const matches = terms => terms.some(term => title.includes(normalize(term)));
  if (matches(jobPreferences.roles.high.terms)) return 5;
  if (matches(jobPreferences.roles.intermediate.terms)) return 4;
  if (matches(jobPreferences.roles.secondary.terms)) return 3;
  return 0;
}
function technologyMatches(job) {
  const content = jobSearchText(job);
  return Object.entries(jobPreferences.technologies)
    .filter(([, terms]) => terms.some(term => content.includes(normalize(term))))
    .map(([group]) => ({ group }));
}
function technologyScore(job) {
  const content = jobSearchText(job);
  const totalTerms = Object.values(jobPreferences.technologies).flat().length;
  const matchCount = Object.values(jobPreferences.technologies).flat().filter(term => content.includes(normalize(term))).length;
  return Math.round(30 * Math.min(1, matchCount / Math.max(1, Math.min(5, totalTerms))));
}
function educationScore(job) {
  const content = jobSearchText(job);
  const terms = ['ciencia da computacao', 'computer science', 'sistemas de informacao', 'analise e desenvolvimento de sistemas', 'jogos digitais', 'game development', 'tecnologia da informacao', 'ti'];
  return terms.some(term => content.includes(normalize(term))) ? 15 : 0;
}
function practicalExperienceScore(job) {
  const content = jobSearchText(job);
  const terms = ['projeto', 'portfolio', 'estagio', 'experiencia pratica', 'unity', 'desenvolvimento de jogos', 'api', 'integracao de sistemas', 'iot', 'aplicacao'];
  const matches = terms.filter(term => content.includes(normalize(term))).length;
  return matches === 0 ? 0 : Math.min(20, matches * 4);
}
function experienceLevelScore(job) {
  const level = levelKey(job.nivel);
  if (level === 'junior' || level === 'estagio' || level === 'trainee') return 15;
  if (level === 'nao-informado') return 7;
  return 0;
}
function modalityScore(job) {
  const modality = jobModalityKey(job);
  if (modality === 'remoto') return 15;
  if (modality === 'hibrido') return Math.min(12, locationScore(job));
  return locationScore(job);
}
function areaScore(job) {
  const title = normalize([job.cargo, job.area, ...(Array.isArray(job.areas) ? job.areas : [])].map(text).join(' '));
  return /backend|back-end|java|python|c#|\.net|full.?stack|programador|programadora|qa|testes|integracao|unity|jogos|embarcados|iot/.test(title) ? 5 : 0;
}
function compatibility(job) {
  const stored = Number(job?.compatibility_score);
  // A nota principal é a calculada pelo pipeline D; mantém cálculo antigo
  // somente para registros anteriores que não possuem score persistido.
  if (job?.compatibility_score !== undefined && job.compatibility_score !== null &&
      job.compatibility_score !== '' && Number.isFinite(stored) && stored >= 0 && stored <= 100) {
    const label=stored>=85?'Excelente compatibilidade':stored>=70?'Alta compatibilidade':
      stored>=50?'Compatibilidade intermediária':stored>=30?'Baixa compatibilidade':'Pouco compatível';
    return {score:stored,rawScore:stored,label,components:null,
      explicitRequired:experienceInfo(job)==='EXPERIENCIA_OBRIGATORIA',
      experienceClass:experienceInfo(job),origin:'pipeline'};
  }
  const components = {
    technology: technologyScore(job),
    education: educationScore(job),
    practical: practicalExperienceScore(job),
    experienceLevel: experienceLevelScore(job),
    locationModality: modalityScore(job),
    priorityArea: areaScore(job)
  };
  const rawScore = Object.values(components).reduce((sum, score) => sum + score, 0);
  const experienceClass = experienceInfo(job);
  const explicitRequired = experienceClass === 'EXPERIENCIA_OBRIGATORIA';
  const score = Math.max(0, Math.min(100, rawScore - (explicitRequired ? 20 : 0)));
  const label = score >= 85 ? 'Excelente compatibilidade' : score >= 70 ? 'Alta compatibilidade' : score >= 50 ? 'Compatibilidade intermediária' : score >= 30 ? 'Baixa compatibilidade' : 'Pouco compatível';
  return { score, rawScore, label, components, explicitRequired, experienceClass, origin:'provisional' };
}
function scoreTier(score) {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'high';
  if (score >= 50) return 'medium';
  if (score >= 30) return 'low';
  return 'minimal';
}
function addQuickSearchTags() {
  const group = $('quick-tags'); if (!group) return;
  [['remoto','Remoto'],['hibrido','Híbrido'],['presencial','Presencial']].forEach(([key,label])=>{
    const button=el('button','quick-tag',label);
    button.type='button';button.dataset.quickSearchTag=key;
    button.setAttribute('aria-pressed','false');
    button.addEventListener('click',()=>{
      if (quickSearchTags.has(key)) quickSearchTags.delete(key);
      else quickSearchTags.add(key);
      button.setAttribute('aria-pressed',String(quickSearchTags.has(key)));
      render();
    });
    group.append(button);
  });
}
function iconSvg(kind){
  const parts={
    location:'<path d="M12 21s7-5.2 7-12a7 7 0 0 0-14 0c0 6.8 7 12 7 12Z"/><circle cx="12" cy="9" r="2.3"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    external:'<path d="M13 5h6v6M19 5l-9 9"/><path d="M19 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/>'
  };
  const wrapper=document.createElement('span');wrapper.className='meta-icon';
  // Os caminhos são constantes locais, nunca dados provenientes das vagas.
  wrapper.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+(parts[kind]||'')+'</svg>';
  return wrapper.firstChild;
}
function jobCard(job) {
  const status=applicationStatus(job),match=compatibility(job),modality=jobModalityKey(job);
  const card=el('article','job');
  const topline=el('div','job-topline'),mark=el('div','company-mark');
  const company=text(job.empresa)||'Empresa não informada';
  mark.textContent=(company.match(/[\p{L}\p{N}]/u)||['?'])[0].toUpperCase();
  mark.setAttribute('aria-hidden','true');
  const companyText=el('div','company-details');
  companyText.append(el('span','company-name',company),el('span','job-source',text(job.fonte)||'Fonte não informada'));
  const score=el('div','score-chip score-tier-'+scoreTier(match.score));
  score.title=match.origin==='pipeline'?'Pontuação estimada pelo pipeline; não garante elegibilidade':'Estimativa provisória: pontuação ainda não armazenada pelo pipeline';
  score.append(el('b','',String(match.score)),el('small','','/100'));
  topline.append(mark,companyText,score);card.append(topline);
  const heading=el('h3'),title=text(job.cargo)||'Cargo não informado';
  const safeUrl=/^https:\/\//i.test(text(job.link))?text(job.link):'';
  if (safeUrl) {
    const titleLink=el('a','',title);titleLink.href=safeUrl;
    titleLink.target='_blank';titleLink.rel='noopener noreferrer';heading.append(titleLink);
  } else heading.textContent=title;
  card.append(heading);
  const metadata=el('div','job-meta');
  for(const [icon,value] of [['location',text(job.local)||'Local não informado'],['clock',formatDate(job.publicadoEm)]]){
    const field=el('span','meta-item');field.append(iconSvg(icon),document.createTextNode(value));metadata.append(field);
  }
  card.append(metadata);
  const tags=el('div','tags');
  const modeLabel=modality==='hibrido'?'Híbrido':modality==='presencial'?'Presencial':modality==='remoto'?'Remoto':'Não informada';
  tags.append(el('span','tag tag-level',text(job.nivel)||'Nível não informado'),el('span','tag tag-mode',modeLabel));
  const technologies=Array.isArray(job.tecnologias)?job.tecnologias.slice(0,2):[];
  technologies.forEach(t=>tags.append(el('span','tag tag-tech',text(t))));
  card.append(tags);
  card.append(el('p','job-description',text(job.descricao)||'Confira as informações completas na publicação original.'));
  const footer=el('div','job-footer');
  const statusShort={
    ACTIVE:'Anúncio ativo',CLOSED:'Encerrada',EXPIRED:'Prazo expirado',
    PENDING_VALIDATION:'Aguardando confirmação',SOURCE_UNAVAILABLE:'Fonte indisponível'
  };
  const statusBadge=el('span','status-pill status-'+status.toLowerCase(),statusShort[status]||'Não verificada');
  statusBadge.title=APPLICATION_STATUS[status]||'Status não informado';
  footer.append(statusBadge);
  if(safeUrl){
    const button=el('a','job-link');button.href=safeUrl;
    button.target='_blank';button.rel='noopener noreferrer';
    button.append(document.createTextNode('Ver vaga'),iconSvg('external'));footer.append(button);
  }
  card.append(footer);
  const details=el('details','job-details');details.append(el('summary','','Mais detalhes da oportunidade'));
  const detailBody=el('div','job-detail-grid');
  const meter=el('div','match-meter');meter.setAttribute('role','meter');
  meter.setAttribute('aria-label','Compatibilidade estimada');
  meter.setAttribute('aria-valuenow',String(match.score));
  meter.setAttribute('aria-valuemin','0');meter.setAttribute('aria-valuemax','100');
  const fill=el('span','match-meter-fill');fill.style.width=match.score+'%';meter.append(fill);
  detailBody.append(el('p','',match.label+' · '+match.score+' de 100 pontos'+(match.origin==='provisional'?' (estimativa provisória)':'')),meter);
  if(match.origin==='pipeline'&&text(job.compatibility_notes))detailBody.append(el('p','',text(job.compatibility_notes)));
  const statusInfo=el('p');
  statusInfo.append(el('strong','', 'Verificação: '),document.createTextNode(APPLICATION_STATUS[status]+'. '+(text(job.motivoVerificacaoCandidatura)||'Situação da candidatura ainda não confirmada.')));
  detailBody.append(statusInfo);
  const stamp=el('p');stamp.append(el('strong','', 'Última verificação: '),document.createTextNode(formatTimestamp(job.ultimaVerificacaoCandidatura)));detailBody.append(stamp);
  const xp=EXPERIENCE[experienceInfo(job)];
  const xpRow=el('p');xpRow.append(el('strong','','Experiência: '),document.createTextNode(xp.label));detailBody.append(xpRow);
  if(match.explicitRequired)detailBody.append(el('div','job-detail-alert','Atenção: a publicação indica exigência de experiência formal. Confira os requisitos antes de se candidatar.'));
  const groups=technologyMatches(job);
  if(groups.length){const tech=el('p');tech.append(el('strong','','Tecnologias relacionadas: '),document.createTextNode(groups.map(g=>g.group).join(' · ')));detailBody.append(tech)}
  details.append(detailBody);card.append(details);return card;
}
function render() {
  const search = normalize($('search')?.value), level = $('level')?.value || '', mode = modalityKey($('mode')?.value || '');
  const source = $('source')?.value || '', location = $('location')?.value || '', priorityLocation = $('priority-location')?.value || '';
  const category = normalize($('category')?.value || ''), experienceFilter = $('experience-filter')?.value || '';
  const prioritizeProfile = Boolean($('profile-match')?.checked), period = $('period')?.value || '', sort = $('sort')?.value || 'compatibility';
  const scoreRange = SCORE_RANGES[$('score-range')?.value] || null;
  const now = Date.now(), cutoff = period === '24h' ? now - 86400000 : period === '7d' ? now - 7 * 86400000 : null;
  const filtered = vagas.filter(job => {
    const content = jobSearchText(job), jobLocation = normalize([job.local, job.cargo, job.descricao].map(text).join(' '));
    const categories = jobCategories(job), modality = jobModalityKey(job), expClass = experienceInfo(job), status = applicationStatus(job);
    const matchesSearch = !search || search.split(/\s+/).every(term => content.includes(term));
    const matchesLevel = !level || levelKey(job.nivel) === levelKey(level), matchesMode = !mode || modality === mode;
    const matchesSource = !source || text(job.fonte) === source, matchesLocation = !location || text(job.local) === location;
    const matchesPriorityLocation = !priorityLocation || priorityLocation === 'remote' && modality === 'remoto'
      || priorityLocation === 'santa-rosa' && (jobLocation.includes('santa rosa') || modality === 'remoto')
      || priorityLocation === 'rio-grande-do-sul' && (jobLocation.includes('rio grande do sul') || /(^|[\s,/-])rs($|[\s,/-])/.test(jobLocation) || modality === 'remoto')
      || priorityLocation === 'santa-maria' && (jobLocation.includes('santa maria') || modality === 'remoto')
      || priorityLocation === 'santo-angelo' && (jobLocation.includes('santo angelo') || modality === 'remoto')
      || priorityLocation === 'ijui' && (jobLocation.includes('ijui') || modality === 'remoto')
      || priorityLocation === 'sao-leopoldo' && (jobLocation.includes('sao leopoldo') || modality === 'remoto')
      || priorityLocation === 'porto-alegre' && (jobLocation.includes('porto alegre') || modality === 'remoto');
    const matchesCategory = !category || categories.some(item => normalize(item) === category), matchesExperience = !experienceFilter || expClass === experienceFilter;
    const selectedModes = ['remoto', 'hibrido', 'presencial'].filter(item => quickSearchTags.has(item)), matchesQuickMode = !selectedModes.length || selectedModes.includes(modality);
    const matchesProfile = !prioritizeProfile || roleScore(job) > 0 || technologyMatches(job).length > 0 || locationScore(job) >= 12;
    const matchScore = scoreRange ? compatibility(job).score : null;
    const matchesScore = !scoreRange || (matchScore >= scoreRange[0] && matchScore <= scoreRange[1]);
    const published = dateValue(job.publicadoEm), matchesPeriod = cutoff === null || (published !== null && published >= cutoff && published <= now);
    return matchesSearch && matchesLevel && matchesMode && matchesSource && matchesLocation && matchesPriorityLocation && matchesCategory && matchesExperience && matchesQuickMode && matchesProfile && matchesPeriod && matchesScore;
  });
  filtered.sort((a, b) => {
    const statusRank = { ACTIVE: 0, PENDING_VALIDATION: 1, SOURCE_UNAVAILABLE: 2, CLOSED: 3, EXPIRED: 4 };
    const statusA = applicationStatus(a), statusB = applicationStatus(b);
    const isClosed = status => status === 'CLOSED' || status === 'EXPIRED';
    if (sort === 'compatibility' || prioritizeProfile) {
      // Encerradas/expiradas nunca ultrapassam oportunidades potencialmente disponíveis.
      const closedDifference = Number(isClosed(statusA)) - Number(isClosed(statusB));
      if (closedDifference) return closedDifference;
      const scoreDifference = compatibility(b).score - compatibility(a).score;
      if (scoreDifference) return scoreDifference;
    }
    const statusDifference = statusRank[statusA] - statusRank[statusB];
    if (statusDifference) return statusDifference;
    const expDifference = EXPERIENCE[experienceInfo(a)].rank - EXPERIENCE[experienceInfo(b)].rank;
    if (expDifference) return expDifference;
    if (sort === 'company') return text(a.empresa).localeCompare(text(b.empresa), 'pt-BR', { sensitivity: 'base' });
    if (sort === 'title') return text(a.cargo).localeCompare(text(b.cargo), 'pt-BR', { sensitivity: 'base' });
    return (dateValue(b.publicadoEm) || 0) - (dateValue(a.publicadoEm) || 0);
  });
  const count = $('count'); if (count) count.textContent = `${filtered.length} de ${vagas.length} ${vagas.length === 1 ? 'vaga' : 'vagas'}`;
  const summary=$('filter-summary');
  if(summary)summary.textContent=filtered.length===vagas.length?'Mostrando todas as oportunidades':'Busca refinada pelos filtros selecionados';
  const box = $('jobs'); if (!box) return; box.setAttribute('aria-busy','false'); box.replaceChildren();
  if (!filtered.length) {
    const empty=el('div','empty');
    empty.append(el('span','empty-icon','⌕'),el('strong','','Nenhuma oportunidade encontrada'),el('p','','Tente alterar os filtros ou pesquisar por outra tecnologia.'));
    const reset=el('button','','Limpar filtros');reset.type='button';reset.addEventListener('click',clearFilters);
    empty.append(reset);box.append(empty);return;
  }
  filtered.forEach(job => box.append(jobCard(job)));
}
function clearFilters() {
  ['search', 'level', 'mode', 'source', 'location', 'priority-location', 'category', 'experience-filter', 'score-range', 'period'].forEach(id => { if ($(id)) $(id).value = ''; });
  quickSearchTags.clear(); document.querySelectorAll('[data-quick-search-tag]').forEach(button => button.setAttribute('aria-pressed', 'false'));
  if ($('profile-match')) $('profile-match').checked = false; if ($('sort')) $('sort').value = 'compatibility'; render();
}
function monitoringStatus(data, now=Date.now()){
 const diagnostics=Array.isArray(data?.diagnosticosFontes)?data.diagnosticosFontes:[];
 const last=Date.parse(data?.ultimaSincronizacao||'');
 const valid=Number.isFinite(last)&&last<=now+300000;
 const stale=!valid||now-last>36*60*60*1000;
 const ok=diagnostics.filter(d=>d?.ok===true).length;
 const fail=diagnostics.filter(d=>d?.ok===false).length;
 let state='unknown',label='Sem diagnóstico confirmado';
 if(!stale&&diagnostics.length){state=fail?'partial':'ok';label=fail?'Sincronização parcial':'Fontes consultadas sem erro informado';}
 else if(valid){state='stale';label='Sincronização desatualizada';}
 return {state,label,successful:ok,failed:fail,diagnostics,lastSync:valid?last:null};
}
function displayMonitoring(data){
 const status=monitoringStatus(data);
 const badge=$('monitor-status');
 if(badge){badge.className='monitor-state monitor-'+status.state;badge.textContent=status.label;}
 const sync=$('monitor-sync'),change=$('monitor-change');
 const fmt=value=>{const d=Date.parse(value||'');return Number.isFinite(d)?new Date(d).toLocaleString('pt-BR'):'Não informada';};
 if(sync)sync.textContent=fmt(data.ultimaSincronizacao);
 if(change)change.textContent=fmt(data.atualizadoEm);
 const sources=$('monitor-sources');
 if(sources)sources.textContent=status.diagnostics.length?
   status.successful+' OK · '+status.failed+' com falha':'Sem diagnóstico disponível';
 const counts=$('monitor-counts');
 if(counts)counts.textContent=[data.novasNaExecucao,data.atualizadasNaExecucao,data.repetidasNaExecucao].map(x=>
  Number.isFinite(Number(x))?String(Number(x)):'—').join(' / ');
 const desc=$('monitor-description');
 if(desc)desc.textContent=status.state==='stale'?
   'A última sincronização publicada ultrapassou 36 horas; isso não confirma que o n8n parou. Confira o PostgreSQL e o workflow G.':
   status.state==='unknown'?'Não há evidência suficiente de uma coleta recente no JSON público.':
   status.state==='partial'?'Algumas fontes falharam na última coleta publicada; as demais podem ter respondido normalmente.':
   'Os diagnósticos do último JSON publicado não registraram falhas de fonte. Isso não garante candidaturas abertas.';
 const container=$('monitor-source-list');
 if(container){
  container.replaceChildren();
  if(!status.diagnostics.length){container.append(el('p','','Sem diagnósticos de fonte publicados.'));return;}
  for(const source of status.diagnostics){
   const item=el('div','monitor-source');
   const title=el('strong','',text(source.name)||'Fonte sem nome');
   const state=source.ok===true?'Consulta OK':source.ok===false?'Falha informada':'Estado desconhecido';
   const statusText=el('span',source.ok===true?'source-ok':'source-error',state);
   const count=Number.isFinite(Number(source.quantity))?Number(source.quantity):null;
   item.append(title,statusText,el('span','',count===null?'Quantidade não informada':count+' registros informados'));
   // Não renderizar mensagens brutas de erro para evitar possíveis segredos.
   if(source.ok===false&&Number.isInteger(Number(source.statusCode))&&Number(source.statusCode)>0)
     item.append(el('span','','HTTP '+Number(source.statusCode)));
   container.append(item);
  }
 }
}

async function load() {
  try {
    const response = await fetch(`./data/vagas.json?t=${Date.now()}`, { cache: 'no-store' }); if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json(); vagas = Array.isArray(data.vagas) ? data.vagas.filter(job => job && typeof job === 'object') : [];
    if ($('updated')) { const timestamp = dateValue(data.ultimaSincronizacao); $('updated').textContent = timestamp === null ? 'Sincronização não informada' : `Última sincronização publicada: ${new Date(timestamp).toLocaleString('pt-BR')}`; }
    displayMonitoring(data);
    if ($('total')) $('total').textContent = String(vagas.length);
    if ($('remote')) $('remote').textContent = String(vagas.filter(job => jobModalityKey(job) === 'remoto').length);
    if ($('intern')) $('intern').textContent = String(vagas.filter(job => levelKey(job.nivel) === 'estagio').length);
    if ($('local')) $('local').textContent=String(vagas.filter(job => ['hibrido','presencial'].includes(jobModalityKey(job))).length);
    populateSelect('source', vagas.map(job => job.fonte), 'Todas as fontes'); populateSelect('location', vagas.map(job => job.local), 'Todas as localizações'); populateSelect('category', vagas.flatMap(jobCategories), 'Todas as categorias'); render();
  } catch (error) {
    if ($('updated')) $('updated').textContent = 'Falha ao atualizar os dados'; const box = $('jobs');
    if (box && !vagas.length) box.replaceChildren(el('p', 'empty error', 'Não foi possível carregar as vagas. Tente atualizar a página.')); else render(); console.error(error);
  }
}
addQuickSearchTags();
['search', 'level', 'mode', 'source', 'location', 'priority-location', 'category', 'experience-filter', 'score-range', 'period', 'sort', 'profile-match'].forEach(id => { const control = $(id); if (control) control.addEventListener(id === 'search' ? 'input' : 'change', render); });
if ($('clear-filters')) $('clear-filters').addEventListener('click', clearFilters);
load(); setInterval(load, 5 * 60 * 1000);
