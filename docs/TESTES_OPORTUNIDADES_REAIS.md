# Relatório de auditoria com oportunidades reais

Referência: repositório `CiscG/MonitoramentoVagas`, arquivo `data/vagas.json`, consultado em **11/11/2026**.

## Critério de verificação

O histórico publicado não é uma prova de que todas as candidaturas permanecem abertas. Mantivemos a diferença entre **vaga registrada**, **anúncio verificado na fonte** e **candidatura confirmada**. Este documento **não declara** que as 14 vagas são novas ou estão aceitando inscrições.

- Registros no JSON: **14**.
- Vagas arquivadas no mesmo JSON: **0**.
- Status do JSON: **PENDING_VALIDATION**.
- Fontes presentes nos registros: **Backend BR, Himalayas**.
- Acesso ao PostgreSQL e ao n8n da instância do usuário: **não realizado** nesta auditoria. O estado real do banco pode divergir do JSON de site.

## Evidência externa verificada

O item **Backend BR #12493** possui título **"[Remoto] Desenvolvedor(a) Back-end Júnior - Python / AI Coding & Agentic AI - MKdigital"**. A API pública GitHub Issues retornou `state=open`, `closed_at=null`, com publicação em `2026-11-07T20:58:13Z` e endereço https://github.com/backend-br/vagas/issues/12493. A resposta também confirma que o item não é um pull request.

**Conclusão sustentada:** a publicação estava aberta na consulta feita em 11/11/2026. **Não** foi comprovado que o formulário externo de candidatura ainda aceitava inscrições. O novo workflow C usa `PENDING_VALIDATION` para essa situação.

O item **Frontend BR #8571** (https://github.com/frontendbr/vagas/issues/8571) também respondeu `state=open`, mas o conteúdo é um agrupamento de **13 anúncios** numa única issue. Por isso o sistema não deve automaticamente tratá-la como uma única vaga individual de desenvolvimento júnior, nem inventar as 13 vagas estruturadas. Ela foi usada como teste de **limitação do modelo de coleta**, não como confirmação de candidatura.

## Relação de registros existentes

| Nº | Cargo registrado | Fonte | Status registrado | Link |
|---:|---|---|---|---|
| 1 | [Remoto] Desenvolvedor(a) Back-end Júnior - Python / AI Coding & Agentic AI - MKdigital | Backend BR | PENDING_VALIDATION | [Anúncio](https://github.com/backend-br/vagas/issues/12493) |
| 2 | Back-end JR l Pesquisa e Desenvolvimento | Himalayas | PENDING_VALIDATION | [Anúncio](https://himalayas.app/companies/bigdatacorp/jobs/back-end-jr-l-pesquisa-e-desenvolvimento?utm_source=api) |
| 3 | Desenvolvedor Full Stack  - Junior | Himalayas | PENDING_VALIDATION | [Anúncio](https://himalayas.app/companies/bip-brasil/jobs/desenvolvedor-full-stack-junior?utm_source=api) |
| 4 | Pessoa Desenvolvedora de IA/RPA  - Junior | Himalayas | PENDING_VALIDATION | [Anúncio](https://himalayas.app/companies/bip-brasil/jobs/pessoa-desenvolvedora-de-ia-rpa-junior?utm_source=api) |
| 5 | ServiceNow Developer | Himalayas | PENDING_VALIDATION | [Anúncio](https://himalayas.app/companies/cloud-people/jobs/servicenow-developer?utm_source=api) |
| 6 | AI Full-Stack Developer, New Grad | Himalayas | PENDING_VALIDATION | [Anúncio](https://himalayas.app/companies/concurrences/jobs/ai-full-stack-developer-new-grad?utm_source=api) |
| 7 | Analista Backend Java Júnior | Himalayas | PENDING_VALIDATION | [Anúncio](https://himalayas.app/companies/evoluservices-meios-de-pagamentos/jobs/analista-backend-java-junior?utm_source=api) |
| 8 | Web Developer | Himalayas | PENDING_VALIDATION | [Anúncio](https://himalayas.app/companies/my-va-support-inc/jobs/web-developer?utm_source=api) |
| 9 | PESSOA DESENVOLVEDORA JÚNIOR VTEX (FRONT-END) | Himalayas | PENDING_VALIDATION | [Anúncio](https://himalayas.app/companies/quality-digital/jobs/pessoa-desenvolvedora-junior-vtex-front-end?utm_source=api) |
| 10 | Desenvolvedor Java \| Júnior (13938) | Himalayas | PENDING_VALIDATION | [Anúncio](https://himalayas.app/companies/sensedia/jobs/desenvolvedor-java-junior-13938?utm_source=api) |
| 11 | Java Developer \| Junior (13938) [Exclusivo PCD] | Himalayas | PENDING_VALIDATION | [Anúncio](https://himalayas.app/companies/sensedia/jobs/java-developer-junior-13938-exclusivo-pcd?utm_source=api) |
| 12 | Full-Stack AI Logic Expert (AI Community) | Himalayas | PENDING_VALIDATION | [Anúncio](https://himalayas.app/companies/telus-digital/jobs/full-stack-ai-logic-expert-ai-community-5029362594?utm_source=api) |
| 13 | Programador Júnior (RPA) | Himalayas | PENDING_VALIDATION | [Anúncio](https://himalayas.app/companies/unimed-vale-do-sinos-rs/jobs/programador-junior-rpa?utm_source=api) |
| 14 | Pessoa Desenvolvedora FullStack (NodeJS / Angular / Java) - Junior (Remoto) | Himalayas | PENDING_VALIDATION | [Anúncio](https://himalayas.app/companies/viceri-seidor/jobs/pessoa-desenvolvedora-fullstack-nodejs-angular-java-junior-remoto?utm_source=api) |

## Testes realizados e conclusão

| Teste | Resultado | Evidência |
|---|---|---|
| Consultar uma issue real Backend BR | **Confirmado** | API pública GitHub, issue #12493 aberta |
| Comparar status de issue com candidatura | **Separados** | `state=open` implica anúncio aberto, não inscrição confirmada |
| Conferir nomes/links dos registros reais no repositório | **Confirmado** | 14 registros em `data/vagas.json` |
| Garantir que todas as vagas do JSON aceitam candidaturas | **Não confirmado** | `PENDING_VALIDATION` em todos os registros |
| Verificar individualmente os 13 anúncios Himalayas | **Não executado** | Depende de consultas à API de detalhes; implementação preparada no C |
| Autenticação Adzuna | **Não executado** | Credencial do usuário não acessível nesta auditoria |
| Coleta Jooble | **Indisponível por configuração** | Sem chave/integração ativada |
| Atualizar n8n real e SMTP | **Não executado** | Requer ações na instância do usuário |
| Migrar banco PostgreSQL real do usuário | **Não executado** | Scripts versionados, execução depende do Ubuntu Server |

Testes reproduzíveis baseados na observação da issue #12493 estão em `tests/workflow-source-evidence.test.cjs`. Estados fechados e HTTP 410 são **casos simulados de regressão** com regras das APIs oficiais, não novos resultados coletados em tempo real.

## Próximos testes no servidor

1. Conferir as tabelas e a linha de estado `tecops_pipeline_state`.
2. Executar G manualmente com agenda diária, observando logs A–E, e registrar contagem/erros reais por fonte.
3. Validar pelo C a API de detalhes de cada anúncio Himalayas antes de classificá-lo como ativo.
4. Executar uma agenda semanal de teste com SMTP controlado; verificar se a mensagem de nenhuma nova vaga confirmada é enviada quando apropriado.
5. Verificar que anúncios encerrados não são repúblicados no espelho do GitHub Pages.

Os termos de uso da Himalayas exigem `applicationLink` sem alterações, atribuição à fonte e remoção dos anúncios encerrados da lista pública: https://himalayas.app/docs/remote-jobs-api.
