let vagas=[];
const $=id=>document.getElementById(id);
const fmt=date=>{if(!date)return 'Data não informada';const d=new Date(date);return Number.isNaN(d.getTime())?'Data não informada':d.toLocaleDateString('pt-BR')};
function el(tag,cls,txt){const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e}
function render(){const q=$('search').value.toLocaleLowerCase('pt-BR').trim(),lvl=$('level').value,mod=$('mode').value,src=$('source').value;
 const found=vagas.filter(v=>[v.cargo,v.empresa,v.descricao,v.local].join(' ').toLocaleLowerCase('pt-BR').includes(q)&&(!lvl||v.nivel===lvl)&&(!mod||v.modalidade===mod)&&(!src||v.fonte===src));
 $('count').textContent=`${found.length} resultados`;const box=$('jobs');box.replaceChildren();
 if(!found.length){box.append(el('p','empty','Nenhuma vaga encontrada com os filtros atuais.'));return;}
 for(const v of found){const card=el('article','job');const tags=el('div','tags');for(const t of [v.nivel,v.modalidade,v.fonte])tags.append(el('span','tag',t||'Não informado'));card.append(tags,el('h3','',v.cargo||'Cargo não informado'),el('div','meta',`${v.empresa||'Empresa não informada'} · ${v.local||'Local não informado'} · ${fmt(v.publicadoEm)}`),el('p','description',v.descricao||'Consulte os requisitos no anúncio original.'));if(/^https:\/\//.test(v.link||'')){const a=el('a','apply','Ver oportunidade');a.href=v.link;a.target='_blank';a.rel='noopener noreferrer';card.append(a)}box.append(card)}
}
async function load(){try{const r=await fetch(`./data/vagas.json?t=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const data=await r.json();vagas=Array.isArray(data.vagas)?data.vagas:[];$('updated').textContent=data.atualizadoEm?`Atualizado em ${new Date(data.atualizadoEm).toLocaleString('pt-BR')}`:'Aguardando a primeira sincronização';$('total').textContent=vagas.length;$('remote').textContent=vagas.filter(x=>x.modalidade==='Remoto').length;$('intern').textContent=vagas.filter(x=>x.nivel==='Estágio').length;render()}catch(err){$('updated').textContent='Falha ao atualizar os dados';$('jobs').replaceChildren(el('p','empty','Não foi possível carregar as vagas. Tente atualizar a página.'));console.error(err)}}
for(const id of ['search','level','mode','source'])$(id).addEventListener(id==='search'?'input':'change',render);
load();setInterval(load,5*60*1000);
