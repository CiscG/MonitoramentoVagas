# TecOps — pipeline modular do n8n (A–G)

> **Estado:** arquivos preparados para importação. O repositório não permite acessar sua instância n8n, cadastrar credenciais ou ativar workflows remotamente. Todos são importados **inativos** por segurança.

## Arquitetura

```text
G — Agenda (diário 07:00 / segunda-feira 08:00, America/Sao_Paulo)
   |
   +-- Ler estado/histórico PostgreSQL e revisão concorrente
   |
   +-- A — Coleta (fontes e normalização)
   +-- B — Filtragem (local, modalidade, cargo, stack, experiência)
   +-- C — Validação da candidatura (novas + até 30 oportunidades históricas)
   +-- D — Classificação da compatibilidade (0–100)
   +-- E — Deduplicação e eventos (nova, atualizada, repetida, encerrada)
   |
   +-- Commit PostgreSQL: jobs, histórico e logs (transação) 
   |
   +-- Em execução semanal:
         F — Relatório consolidado (semana anterior em pt-BR)
         +-- Arquivar em PostgreSQL e espelhar no GitHub Pages
         +-- Enviar e-mail (inclusive quando não houver vaga nova confirmada)
```

| Arquivo | Objetivo | Saída esperada |
|---|---|---|
| `A-coleta.json` | Busca em GitHub BR, Himalayas, Adzuna e Jooble, incluindo Game Dev/estágio | `jobs`, `diagnostics`, contexto compartilhado |
| `B-filtragem.json` | Filtros de perfil configuráveis | `jobs`, `filterStats` |
| `C-validacao.json` | Verifica evidências da candidatura, em vez de presumir abertura por HTTP 200 | `jobs`, `validationStats` |
| `D-classificacao.json` | Calcula score heurístico 0–100 | `compatibility_score`, `compatibility_notes` |
| `E-deduplicacao.json` | Cruza histórico, canonical URL, ID externo, empresa/cargo e hash | `data`, `events`, `dedupStats` |
| `F-relatorio.json` | Relatório semanal em português com seis seções obrigatórias, atualizações e vagas sem confirmação | `report`, `reportText`, `reportHtml`, `reportSubject` |
| `G-agendamento.json` | Orquestra, persiste em PostgreSQL e espelha o site no GitHub | execução diária e semanal |

## Implantação segura (versão PostgreSQL)

**A fonte de verdade é o PostgreSQL, não o JSON do GitHub.**
Antes de atualizar G, execute `database/001_jobs.sql` e `database/002_pipeline_runtime.sql` e faça o bootstrap do histórico.
Confira o roteiro de instalação completo: [Migração PostgreSQL e operação resiliente](../database/OPERACAO_POSTGRES_N8N.md).

1. Faça backup da instância do n8n, workflows e dos dados do GitHub.
2. Prepare o PostgreSQL e execute o bootstrap; nunca sobrescreva o histórico com JSON vazio.
3. Atualize A, C e G (mantenha os IDs dos subworkflows), vincule as credenciais **Postgres**, **GitHub** e **SMTP**. B, D, E e F seguem utilizáveis.
4. Em A, configure o **Custom Auth** da Adzuna (qs.app_id + qs.app_key); os três nós Jooble usam gateway interno Docker com credencial Header Auth; configure e teste o serviço antes de ativar G. Consulte [instalação Adzuna e Jooble](../docs/INTEGRACOES_ADZUNA_JOOBLE.md).
5. Importe H, configure sua credencial Postgres e selecione H como **Error workflow** de G e, quando necessário, dos subworkflows.
6. Teste em ambiente separado, confira `tecops_execution_logs`, `jobs`, `tecops_pipeline_state`, a página publicada e o e-mail semanal.
7. Desative os fluxos legados e só então ative G na produção.

`G` continua com IDs de A–F configuráveis por instância. Depois de atualizar um subworkflow existente, confira se G aponta para o ID correto. As credenciais **não fazem parte dos JSON exportados** e devem ser associadas no n8n.

## Critérios e configuração

- **Agendamento:** `0 7 * * *` (todos os dias, 07:00) e `0 8 * * 1` (segunda-feira, 08:00), com timezone `America/Sao_Paulo`. Altere as expressões Cron no G se desejar outros intervalos. A execução semanal também realiza a busca.
- **Perfil:** edite o código do nó **Contexto da execução** no G para personalizar `profile.locations`, `workModes`, `roleKeywords`, `technologies`, `jobLevels`, `maxExperienceYears` e `includeRemote`. Listas vazias desabilitam a restrição específica, sem prejudicar a pontuação do D. Perfis mais restritos também limitam quais vagas novas entram no histórico; recomenda-se começar com filtros amplos.
- **Verificação histórica:** até **30 vagas não encerradas por execução**, quando a última verificação ocorreu há mais de 23 horas (`historyVerificationLimit` no perfil pode ser ajustado entre 0 e 50). Respostas 404/410 ou falhas de acesso não são automaticamente tratadas como encerramento confirmado; a situação fica pendente ou fonte indisponível.
- **Classificação:** pontuação heurística de 0–100 baseada em tecnologias, formação, projetos, nível, localização e área. Não garante elegibilidade.
- **Deduplicação:** preserva o ID e `first_seen_at` da vaga original. Republicações semelhantes não são contadas como oportunidades novas; fontes, links e identificadores alternativos são mantidos no histórico. Eventos são persistidos em `eventosHistorico`.
- **Persistência:** o PostgreSQL armazena estado, vagas e logs de forma transacional. O arquivo `data/vagas.json` mantém a visão pública (até 400 exibidas, demais em `historicoVagas`). A conexão PostgreSQL depende de instalação e credenciais na instância.
- **Relatórios:** o F considera o intervalo de segunda-feira 00:00 UTC anterior a segunda-feira 00:00 UTC da semana seguinte. Na segunda-feira de envio, resume a semana encerrada (a classificação de datas usa UTC; o gatilho opera em São Paulo). Organiza seis seções obrigatórias: desenvolvimento júnior, estágios em desenvolvimento, QA/testes, integração de sistemas, oportunidades anteriores e encerradas. Inclui seções complementares para outras vagas, atualizações e não verificadas.
- **Sem novidades:** o F produz explicitamente **“Nenhuma nova vaga confirmada foi encontrada nesta semana.”**. O G executa o envio semanal **mesmo assim**, desde que SMTP e destinatário estejam corretamente configurados.
- **Arquivo semanal:** `data/relatorios-semanais.json` guarda snapshots por `weekKey`, sem duplicar a mesma semana. A publicação exige SHA do arquivo lido e falha em caso de conflito 409/422. Reexecuções da mesma semana devem ser revisadas para evitar reenvio duplicado de e-mail.

## Limitações que exigem validação local

O pipeline foi criado com base nas definições n8n existentes. **Não houve execução em sua instância n8n**, nem envio real de e-mail: credenciais, execução dos subworkflows e links das plataformas só podem ser confirmados depois da importação.

O n8n pode restringir expressões `$env` dependendo da implantação. Se ocorrer, configure remetente/destinatário diretamente no nó SMTP, com acesso restrito, e nunca no código público. Alguns anúncios exigem autenticação ou bloqueiam requisições automáticas; classifique como **não verificados**, não como abertos.

Em execuções paralelas, o GitHub pode recusar o PUT com 409/422. O G interrompe a publicação para preservar o histórico: deve-se **reler o SHA** e reexecutar, nunca forçar uma sobrescrita. Para alto volume, convém evoluir para PostgreSQL com uma camada de publicação somente-leitura.

## Testes

Execute no checkout do repositório:

```bash
node --test tests/workflow-modular.test.cjs
node --test tests/workflow-dedup.test.cjs
```

Testes sintáticos e simulações com dados fictícios não substituem testes de autenticação e envio na instância n8n.

## Solução de erro no E: histórico indisponível

O workflow E precisa de `previous.vagas` (e do contexto `github.jobsSha` para publicação pelo G). Caso o subworkflow E seja executado sozinho, ou o encadeamento não forneça `previous`, ele agora verifica o campo e recupera `data/vagas.json` diretamente da API do GitHub. Antes de consolidar, valida JSON, formato e SHA. **Não cria histórico vazio como substituto.**

Depois de importar a versão atualizada de `E-deduplicacao.json`, associe a credencial **GitHub API** com acesso de leitura ao nó **Recuperar histórico GitHub**. Se o n8n já possuir o E importado, atualize o workflow existente (evite criar uma segunda cópia que não seja chamada pelo G). Se importar uma nova cópia, atualize o ID selecionado no nó `Executar E — deduplicação` do G.

Execute o G para verificar o encadeamento completo. A recuperação é um fallback; a forma normal continua sendo o G repassar o histórico através de A, B, C e D. Caso o GitHub esteja inacessível ou retorne JSON inválido, o E continuará bloqueando a consolidação, **para evitar perda de dados**.

## Relatório detalhado do workflow F

O e-mail HTML, o texto e o registro `report.records` são gerados a partir dos dados persistidos no histórico. As seis seções principais são: **(1)** vagas de desenvolvimento júnior (não identificadas como estágio), **(2)** estágios em desenvolvimento, **(3)** QA e automação de testes, **(4)** integração de sistemas e correlatas, **(5)** oportunidades anteriormente encontradas e **(6)** vagas encerradas. As vagas novas confirmadas são distribuídas nas quatro primeiras seções. Oportunidades que não se encaixam nas quatro áreas, atualizações e vagas não verificadas aparecem em seções complementares.

Cada entrada informa cargo, empresa, modalidade, localidade, salário, tecnologias, formação exigida, experiência obrigatória/desejável, prazo de inscrição, score de compatibilidade, razão da classificação, notas do score, data da última verificação e link de candidatura. **Não se supõem dados ausentes**: são marcados como `Não informado`. Salário só exibe moeda quando fornecida; os requisitos de formação só vêm de campos explícitos, não de inferência sobre o cargo.

**Links oficiais:** a URL oficial da candidatura é exibida somente quando a fonte traz campo inequívoco (por exemplo `official_application_url`) ou confirmação explícita (`linkOficialConfirmado`). Links de issues GitHub e agregadores são mostrados separadamente como **link do anúncio na fonte**, sem afirmar que são links oficiais. O nível júnior sem indicação de estágio não confirma, por si só, contratação CLT ou regime efetivo; confira o anúncio.

As listas `report.sections.new`, `continued`, `closed`, `updated` e `unverified` permanecem no JSON do relatório para compatibilidade com o histórico já armazenado. Os registros detalhados ficam em `report.records`. Não há necessidade de alterar o nó SMTP do G, pois ele já consome `reportHtml` e `reportSubject` do F.

Para aplicar a alteração, atualize o **workflow F já importado** no n8n, mantendo o mesmo ID referenciado em G. Se importar uma cópia como workflow novo, reconfigure no G o nó `Executar F — relatório` para o ID novo. Não é necessário reimportar os demais workflows apenas para mudar o layout do relatório.

## Requisições, retries, logs e credenciais

O C usa **Loop Over Items** com uma vaga por lote, **Merge** e **IF** para controlar novas tentativas; aguarda 2 segundos entre verificações e usa backoff progressivo de 2, 4 e 8 segundos ou `Retry-After` numérico. O A intercala pausas de 2 segundos entre fontes e usa as tentativas nativas do HTTP Request. Limites de provedores são configuráveis e devem respeitar as respectivas cotas reais. Logs e falhas são gravados em PostgreSQL pelo G e H; nunca inclua tokens no texto de erro. Para instruções e limitações operacionais: [database/OPERACAO_POSTGRES_N8N.md](../database/OPERACAO_POSTGRES_N8N.md).

## Buscas locais no Rio Grande do Sul

A coleta também consulta **Adzuna RS Desenvolvimento/Estágio/QA/Integração**, além das buscas remotas existentes. Configure os quatro HTTP Request novos com a mesma credencial Custom Auth da Adzuna e atualize A, B, D e G. O G ativa `rsOnlyForNonRemote`: híbridas/presenciais somente quando a localidade informada for do RS. Consulte o [guia de ampliação regional](../docs/AMPLIACAO_BUSCAS_RS.md) antes de publicar.

## Ativação da Jooble via gateway interno

O workflow A chama `http://tecops-jooble-gateway:8787/search` em três consultas, autenticadas por **HTTP Header Auth** `X-TecOps-Token`. O gateway exige chave regional `JOOBLE_BR_API_KEY` e token `GATEWAY_SHARED_TOKEN` armazenados no `.env` local, ignorado pelo Git. Não há resposta artificial de desativação. Sem gateway/credenciais, o nó retorna falha explícita; não confundir isso com ausência de vagas. Consulte [o guia detalhado](../docs/INTEGRACOES_ADZUNA_JOOBLE.md).
