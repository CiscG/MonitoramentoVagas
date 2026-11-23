# Expansão de buscas e contratos de subworkflows — 23/11/2026

## Problema investigado

Nas execuções do n8n fornecidas pelo usuário, o workflow G era marcado como **Succeeded**, mas não avançava até o commit PostgreSQL. Testes isolados do B retornaram `received:0` e o C devolveu `jobs:[]` sem contexto `run`/`pg`. Isso é compatível com execução manual sem entrada, uso de versão antiga ou perda de envelope; **não prova por si só que as APIs estejam vazias**. A alteração impede que esse tipo de saída seja confundido com execução completa.

## O que mudou

### A — Mais seis consultas direcionadas

| Fonte | Busca | Escopo |
|---|---|---|
| Himalayas QA | `quality assurance` entry-level | Brasil / remotas |
| Himalayas Full Stack | `full stack` entry-level | Brasil / remotas |
| Adzuna Remoto QA | `qa automation` | Brasil, com modalidade verificada pelo filtro B |
| Adzuna Remoto Full Stack | `desenvolvedor full stack junior` | Brasil, com modalidade verificada pelo filtro B |
| Adzuna RS Game Dev | `desenvolvedor jogos` | Rio Grande do Sul |
| Jooble RS QA | `qa junior automacao testes` | Rio Grande do Sul |

As 15 consultas originais continuam. São **21 consultas por ciclo**, com pausas de 2s, validação de formato e erros por fonte. As novas consultas Adzuna usam a **mesma credencial HTTP Custom Auth**; a nova Jooble usa a **mesma Header Auth do gateway**. Configure as credenciais dos novos nós no n8n; exports não guardam chaves.

**Não considerar toda vaga da busca Brasil remota**: B continua exigindo RS identificado para modalidade desconhecida/híbrida/presencial. Vagas de resultado nacional apenas passam quando a modalidade identificada for remota, ou o anúncio for no RS.

### A — Auditoria de normalização

`Normalizar coleta` retorna:
- `rawCount`: anúncios recebidos das APIs com resposta OK
- `collectionStats.raw`, `normalized`, `unique`, `deduplicated`, `rejectedByNormalization`
- `collectionStats.perSource`: contagem bruta, normalizada e rejeitada em cada fonte que respondeu
- `diagnostics`: status HTTP/erro/campo `quantity` de **todas** as fontes

O normalizador também reconhece explicitamente títulos em português como *Analista de Integração de Sistemas Júnior* e *Analista de Automação de Testes Júnior*, sem incluir categorias genéricas de vendas e marketing. Duplicatas obtidas em consultas diferentes da mesma fonte mantêm um ID estável e acumulam `buscasCorrespondentes`.

### G — Falhas explícitas

Cinco novos nós `Verificar contrato — A/B/C/D/E` exigem:
- `jobs` como array (inclusive `[]` quando vazio);
- `run.id`, `run.kind`, `profile`, `pg.revision`;
- `diagnostics` e `rawCount` em A, `filterStats` em B, `validationStats` em C, `classifiedAt` em D, `data.vagas/historicoVagas/eventosHistorico` em E.

Os nós `Execute Workflow` do G usam `Always Output Data` **somente com guardas que lançam erro** se o subworkflow não retornar um envelope válido. Isso transforma a falsa execução verde em um erro claro, **não** cria vagas nem grava um objeto vazio no PostgreSQL. Uma lista legítima `jobs:[]` passa por A/B/C sem inventar resultados e o histórico segue sendo tratado pelo E.

## Implantação no Ubuntu Server e n8n

**Antes de atualizar:**

```bash
cd ~/MonitoramentoVagas
mkdir -p ~/tecops-backups
pg_dump -h 127.0.0.1 -U tecops_user -d tecops -W -Fc -f ~/tecops-backups/tecops-$(date +%Y%m%d-%H%M%S).dump
```

1. Depois de **mesclar o PR**, `git pull --ff-only` no servidor.
2. Exporte as versões instaladas de **TecOps A** e **TecOps G** (backup dos JSONs ativos).
3. Atualize **os workflows existentes**, preservando os IDs já usados pelo G. Importe/cole a versão atualizada de `n8n/A-coleta.json` e `n8n/G-agendamento.json`. Se a importação criar IDs novos, associe os nós `Executar A/B/C/D/E` aos IDs reais dos workflows existentes. Nunca deixe `CONFIGURE_WORKFLOW_X_ID` como valor literal.
4. Verifique e vincule as credenciais aos três novos nós Adzuna e ao novo nó Jooble. Teste o gateway e a conta Adzuna individualmente sem compartilhar segredos.
5. Salve e **publique** A e G, se houver versões de produção pendentes.
6. Confirme que **os dois workflows legados estão despublicados**: o coletor antigo de 60min e o validador de 6h.
7. Execute manualmente **G** (não A/B isolados) e observe:
   - A: `collectionStats` e `diagnostics`.
   - B: `filterStats.received` igual à quantidade de vagas normalizadas que recebeu de A.
   - C: `validationStats`, incluindo `checked:0` quando não houver vagas para validar.
   - G: `Verificar contrato` A–E verdes; `Persistir PostgreSQL` `committed_result.committed:true`; publicação GitHub processada.
8. Confirme `revision` e `updated_at` no PostgreSQL e `ultimaSincronizacao` no JSON público. Não execute `bootstrap-runtime.cjs` novamente.

### Verificações seguras

```bash
psql -h 127.0.0.1 -U tecops_user -d tecops -W \
  -c "SELECT revision, updated_at FROM tecops_pipeline_state;"
node --test tests/*.test.cjs
```

## Limites e compromissos

- Os testes de CI usam dados de exemplo; **não validam credenciais nem confirmam novas vagas reais**.
- O G executa mais chamadas (6 adicionais); verifique cota contratada e a duração de execução das APIs. O `HTTP 429` deve permanecer nos diagnósticos, sem retentativas infinitas.
- Não existe mudança de SQL, PostgreSQL, histórico, GITHUB_TOKEN ou credenciais em arquivos versionados.
- Os coletores opcionais Greenhouse/Lever/Ashby permanecem disponíveis, mas só devem ser habilitados após cadastrar boards públicos verificados e integrar explicitamente o resultado ao A; não serão apresentados como fontes ativas sem configuração.
