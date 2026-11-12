# Auditoria técnica e plano de implementação — TecOps
Data da análise: 11/11/2026. Branch: `feat/auditoria-confiabilidade-fontes-20261111`.

## Inventário (estado observado na main antes das mudanças)

| Workflow | Responsabilidade | Nós relevantes | Observações |
|---|---|---|---|
| A | Coleta e normalização | HTTP Request, Code, Wait | 11 consultas; 2 GitHub BR, 3 Himalayas, 3 Adzuna e 3 Jooble (desativadas) |
| B | Filtragem | Code | Local, modalidade, cargo, tecnologias, nível e anos de experiência |
| C | Validação de anúncio | HTTP Request, Loop Over Items, IF, Merge, Wait, Code | Consultava HTML genérico e procurava textos; possível falso positivo |
| D | Classificação | Code | Score 0–100 com notas heurísticas |
| E | Deduplicação | Code, IF, HTTP Request | ID, URL canônica, empresa/cargo/hash e arquivo histórico |
| F | Relatórios | Code | Seis categorias obrigatórias, status, fontes e campos disponíveis |
| G | Agendamento/publicação | Schedule, Postgres, Merge, IF, HTTP Request, SMTP | PostgreSQL é fonte operacional; JSON do GitHub é espelho |
| H | Logs | Error Trigger, Code, Postgres | Necessita associação nas configurações da instância |

### Problemas identificados e correções desta branch

1. **Inferência do dia da semana:** o G usava `$prevNode.name`, sujeito à passagem por caminhos diversos. Corrigido com dois nós de entrada explícitos (`daily` e `weekly`).
2. **Confusão entre página acessível e candidatura ativa:** o C usava texto HTML genérico; agora consulta a API de issues GitHub para status da publicação e a API oficial Himalayas para status individual. Issue aberta permanece `PENDING_VALIDATION`; HTTP 410 da API Himalayas torna o anúncio `CLOSED`; 404 não é encerramento confirmado.
3. **Dados derivados sem fonte:** o A colocava `Ver anúncio` como empresa; agora `Não informada`. Preserva até 12.000 caracteres da descrição e 4.000 dos requisitos, quando fornecidos.
4. **Pontuação reduzida por perfil vazio:** no D, listas explicitamente vazias anulavam as tecnologias padrão. Agora listas vazias recorrem à lista de tecnologias de referência. A pontuação continua estimativa, não prova de elegibilidade.
5. **Eventos de atualização falsos:** no E, somente score ou lista de URLs alternativos podiam marcar vaga como atualizada. A assinatura de atualização material não utiliza esses campos; republicações continuam rastreadas separadamente.
6. **Atribuição e expiração Himalayas:** o A preserva separadamente `applicationLink` e `guid`; o F mostra link de inscrição disponibilizado pela fonte e link da fonte. O G omite anúncios Himalayas encerrados/expirados do espelho público, mas não do histórico PostgreSQL.

### Limitações preservadas, sem simular funcionamento

- Adzuna requer `app_id` e `app_key` reais na credencial Custom Auth do n8n; não foi possível validar sua conta.
- Jooble está desativada no A. Nenhum endpoint protegido foi criado ou substituído por simulação.
- Coletores de Greenhouse, Lever e Ashby em `collectors/job-board-collectors.cjs` existem, mas ainda não estão ligados ao G. Sem configuração de board/site não há consultas reais.
- A operação em n8n e PostgreSQL do usuário não é acessível neste ambiente; testes no CI não equivalem a integração na instância dele.
- A validação de URLs arbitrárias continua sujeita a políticas de rede e proteção contra SSRF na instância; nenhum acesso a rede interna deve ser permitido aos nós de coleta.
- A redução de candidatos em B pode esconder vagas antes da deduplicação. Configure perfil amplo e refine o filtro depois de ter coleta estável.

## Plano executado / implantação

1. Inventariar fontes e formatos; comparar estado do GitHub e contratos documentados.
2. Ajustar C, A, D, E, F e G mantendo os mesmos arquivos/nomes dos workflows.
3. Adicionar regressões para abertura de issues, API Himalayas e agendas, sem inventar respostas de sistemas externos.
4. Documentar APIs, credenciais, implantação, extensão de fontes e relatório de vagas reais.
5. Validar via GitHub Actions; executar na instância n8n somente após backup e revisão.
6. Monitorar erros e conciliar PostgreSQL com GitHub Pages antes de ativar agendas.

O banco permanece definido por `database/001_jobs.sql` e `database/002_pipeline_runtime.sql`, com uma camada adicional de consultas de auditoria em `database/003_audit_views.sql`.
