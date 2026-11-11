# TecOps — pipeline modular do n8n (A–G)

> **Estado:** arquivos preparados para importação. O repositório não permite acessar sua instância n8n, cadastrar credenciais ou ativar workflows remotamente. Todos são importados **inativos** por segurança.

## Arquitetura

```text
G — Agenda (diário 07:00 / segunda-feira 08:00, America/Sao_Paulo)
   |
   +-- Ler histórico data/vagas.json + arquivo data/relatorios-semanais.json
   |
   +-- A — Coleta (fontes e normalização)
   +-- B — Filtragem (local, modalidade, cargo, stack, experiência)
   +-- C — Validação da candidatura (novas + até 30 oportunidades históricas)
   +-- D — Classificação da compatibilidade (0–100)
   +-- E — Deduplicação e eventos (nova, atualizada, repetida, encerrada)
   |
   +-- Publicar data/vagas.json com SHA atual (GitHub API)
   |
   +-- Em execução semanal:
         F — Relatório consolidado (semana anterior em pt-BR)
         +-- Arquivar em data/relatorios-semanais.json
         +-- Enviar e-mail (inclusive quando não houver vaga nova confirmada)
```

| Arquivo | Objetivo | Saída esperada |
|---|---|---|
| `A-coleta.json` | Busca em GitHub BR, Himalayas, Adzuna e Jooble, incluindo Game Dev/estágio | `jobs`, `diagnostics`, contexto compartilhado |
| `B-filtragem.json` | Filtros de perfil configuráveis | `jobs`, `filterStats` |
| `C-validacao.json` | Verifica evidências da candidatura, em vez de presumir abertura por HTTP 200 | `jobs`, `validationStats` |
| `D-classificacao.json` | Calcula score heurístico 0–100 | `compatibility_score`, `compatibility_notes` |
| `E-deduplicacao.json` | Cruza histórico, canonical URL, ID externo, empresa/cargo e hash | `data`, `events`, `dedupStats` |
| `F-relatorio.json` | Relatório semanal em português de cinco categorias | `report`, `reportText`, `reportHtml`, `reportSubject` |
| `G-agendamento.json` | Orquestra a sequência, persiste histórico e envia relatório SMTP | execução diária e semanal |

## Implantação segura

1. Faça **backup** de seus workflows em uso e dos arquivos `data/vagas.json` e `data/relatorios-semanais.json` antes de ativar o novo pipeline.
2. **Mescle a branch aprovada na `main`**. O workflow G grava na branch `main` via API; não rode sua versão de teste contra uma branch de produção sem alterar essa configuração.
3. Importe os seis subworkflows **A, B, C, D, E, F** em `n8n > Workflows > Import from File`. Mantenha todos **inativos**: são chamados pelo G através do gatilho **Execute Sub-workflow Trigger**. Nas opções de cada subworkflow, permita execução pelo G.
4. Importe o **G**, também inativo. Em seus seis nós `Executar A` a `Executar F`, **substitua os placeholders `CONFIGURE_WORKFLOW_A_ID` ... `CONFIGURE_WORKFLOW_F_ID`** pelos IDs reais dos seis workflows importados (ou selecione o workflow na interface). Os IDs são diferentes em cada instância.
5. Atribua sua credencial **GitHub API** (somente `Contents: Read and write` neste repositório) aos quatro nós GitHub do G: **Ler vagas históricas**, **Ler relatórios anteriores**, **Publicar histórico de vagas** e **Arquivar relatório no GitHub**. Revise que a branch de publicação seja `main`.
6. Atribua a credencial SMTP (criada diretamente no n8n) ao nó **Enviar relatório semanal por e-mail**. Configure o remetente e destinatário via `TE COPS`? **Não**: utilize os nomes exatos `TECOPS_REPORT_EMAIL_FROM` e `TECOPS_REPORT_EMAIL_TO` como variáveis de ambiente do processo n8n ou substitua as expressões do nó pelos endereços nas configurações do n8n. Nunca adicione senhas ou destinatários pessoais ao repositório Git.
7. Revise os HTTP Request das fontes no A e configure os tokens necessários da Adzuna/Jooble via variáveis de ambiente de sua instância n8n. Se uma fonte falhar, o diagnóstico é mantido; o histórico anterior não é eliminado.
8. Execute **G manualmente** com mocks e controle das saídas antes de ativar. Em um teste real, o G realiza gravações na API do GitHub e um teste da ramificação semanal poderá enviar e-mail: revise destinatário e use uma caixa de teste.
9. Quando os testes estiverem corretos, desative **os workflows legados** `monitor-vagas-workflow.json` e `validar-status-candidaturas-workflow.json` no n8n para não competir pela escrita de `data/vagas.json`. Só então ative **G**.
10. Observe pelo menos uma execução diária e uma semanal no histórico de execuções do n8n.

## Critérios e configuração

- **Agendamento:** `0 7 * * *` (todos os dias, 07:00) e `0 8 * * 1` (segunda-feira, 08:00), com timezone `America/Sao_Paulo`. Altere as expressões Cron no G se desejar outros intervalos. A execução semanal também realiza a busca.
- **Perfil:** edite o código do nó **Contexto da execução** no G para personalizar `profile.locations`, `workModes`, `roleKeywords`, `technologies`, `jobLevels`, `maxExperienceYears` e `includeRemote`. Listas vazias desabilitam a restrição específica, sem prejudicar a pontuação do D. Perfis mais restritos também limitam quais vagas novas entram no histórico; recomenda-se começar com filtros amplos.
- **Verificação histórica:** até **30 vagas não encerradas por execução**, quando a última verificação ocorreu há mais de 23 horas (`historyVerificationLimit` no perfil pode ser ajustado entre 0 e 50). Respostas 404/410 ou falhas de acesso não são automaticamente tratadas como encerramento confirmado; a situação fica pendente ou fonte indisponível.
- **Classificação:** pontuação heurística de 0–100 baseada em tecnologias, formação, projetos, nível, localização e área. Não garante elegibilidade.
- **Deduplicação:** preserva o ID e `first_seen_at` da vaga original. Republicações semelhantes não são contadas como oportunidades novas; fontes, links e identificadores alternativos são mantidos no histórico. Eventos são persistidos em `eventosHistorico`.
- **Persistência:** `data/vagas.json` conserva até 400 oportunidades exibidas, demais em `historicoVagas`. O projeto dispõe de um esquema PostgreSQL opcional em `database/`, mas **a conexão não está ativa** e o G mantém GitHub JSON como origem operacional.
- **Relatórios:** o F considera o intervalo de segunda-feira 00:00 UTC anterior a segunda-feira 00:00 UTC da semana seguinte. Na segunda-feira de envio, resume a semana encerrada (a classificação de datas usa UTC; o gatilho opera em São Paulo). Identifica novidades confirmadas, vagas de relatórios anteriores ainda verificadas como abertas, encerramentos, atualizações e vagas que não puderam ser verificadas.
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
