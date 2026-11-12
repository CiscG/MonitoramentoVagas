# Fontes de vagas e contratos de API

## Integradas aos workflows n8n

| Fonte | Endpoint usado | Autenticação | Comportamento |
|---|---|---|---|
| Backend BR | `GET https://api.github.com/repos/backend-br/vagas/issues?state=open&per_page=100&sort=created&direction=desc` | Pública; token opcional para maiores cotas | Ignora pull requests; título e corpo são dados de usuários, não garantia de vaga ativa |
| Frontend BR | Mesmo padrão no repositório `frontendbr/vagas` | Pública; token opcional | Uma issue pode conter vários anúncios, que NÃO são divididos automaticamente |
| Himalayas | `GET https://himalayas.app/jobs/api/search` | Sem chave em acesso público; chave opcional | Três consultas: entrada, Game Dev e estágios |
| Himalayas (validação) | `GET https://himalayas.app/jobs/api/companies/:company/jobs/:slug` | Sem chave para limites públicos | 200 com `job` confirma anúncio ativo; 410 anuncia encerramento; 404 é inconclusivo |
| Adzuna | `GET https://api.adzuna.com/v1/api/jobs/br/search/1` | `app_id` e `app_key` via credencial Custom Auth | Três consultas; indisponível se credencial ausente |
| Jooble | Nenhum HTTP Request ativo | Chave exigida pela API, não configurada | Desativada: retorna diagnóstico explícito de indisponibilidade, sem criar resultados |

### Sem integração ativa ao agendamento

`collectors/job-board-collectors.cjs` contém funções auxiliares de Greenhouse, Lever, Ashby e coletores de páginas públicas. O arquivo `collectors/sources.json` tem listas vazias. **Ter código não significa que essas fontes estejam sendo executadas.** Nenhum site de carreira particular foi inventado.

### Semântica da verificação

- GitHub: `state=open` significa **issue publicada**, não prova de inscrições abertas. O estado de candidatura fica `PENDING_VALIDATION`. `state=closed` indica encerramento da issue — não prova sozinho a data em que um formulário externo fechou.
- Himalayas: a API específica de vaga confirma a disponibilidade da listagem; usar `applicationLink` **sem modificar** para inscrição e mostrar permalink `guid` como atribuição. Excluir anúncios expirados do site público.
- Outras fontes: páginas com status HTTP 200 e termos genéricos não devem ser promovidas automaticamente a inscrição confirmada. Falhas 403/429/500, 404 e bloqueios de autenticação ficam como indisponibilidade/pendência, não encerramento comprovado.
- Campos não presentes no dado original são guardados como `null`, `Não informado` ou pendência. Empresas não são deduzidas de slogans ou títulos.

### Cotas e paginação

- GitHub: respeitar cabeçalhos de rate limit, e evitar consultas repetidas de issues. Filtrar eventos `pull_request` nas respostas.
- Himalayas: pesquisar por `q`, `country`, `seniority`, `employment_type`; paginação por `page`; resultados podem ter cache de até 24h. A API de detalhes aceita limite público, com teto documentado; validar antes de publicar.
- Adzuna: `app_id` e `app_key` obrigatórios, validar cotas do plano cadastrado; não incluir chaves nos exports.
- No C: lote 1, intervalo de 2s, backoff 2/4/8s com `Retry-After` numérico quando fornecido.

### Documentação oficial

- GitHub REST issues: https://docs.github.com/en/rest/issues/issues
- Himalayas: https://himalayas.app/docs/remote-jobs-api
- Adzuna: https://developer.adzuna.com/overview
- Coletores disponíveis: `collectors/README.md`

A confirmação de retorno de uma API em um momento não garante disponibilidade futura, nem valida todos os anúncios de terceiros.

## Consultas regionais Rio Grande do Sul

Além das buscas Adzuna anteriores, quatro consultas Adzuna utilizam `where=Rio Grande do Sul` com termos de desenvolvimento, estágio, QA e integração. As consultas usam a mesma credencial HTTP Custom Auth, mantêm limite de 20 resultados por página e exigem as quotas reais da conta. Normalização, filtro e deduplicação posterior evitam afirmar que uma vaga é do RS sem localidade declarada. Ver [ampliação das buscas RS](AMPLIACAO_BUSCAS_RS.md).
