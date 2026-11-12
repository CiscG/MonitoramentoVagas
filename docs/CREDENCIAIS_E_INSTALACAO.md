# Credenciais e instalação segura (Ubuntu Server + n8n Docker + PostgreSQL no host)

## Variáveis e credenciais

| Identificador | Onde configurar | Obrigatório | Uso |
|---|---|---|---|
| PostgreSQL (Host, Database, User, Password, Port) | Credencial **Postgres** do n8n | Sim | G e H; banco `tecops` |
| GitHub API / PAT com Contents read/write | Credencial **GitHub API** do n8n | Sim para espelho | G, fallback de E; permissão restrita ao repositório |
| Adzuna `app_id`/`app_key` | Credencial **HTTP Custom Auth** (`qs`) | Apenas se Adzuna habilitada | A (7 consultas) |
| SMTP (host, porta, TLS, usuário, senha de app) | Credencial **SMTP** do n8n | Para envio de relatório | G |
| `TECOPS_REPORT_EMAIL_FROM` | Variável do processo n8n, ou valor fixo no nó | Para o e-mail | Remetente |
| `TECOPS_REPORT_EMAIL_TO` | Variável do processo n8n, ou valor fixo no nó | Para o e-mail | Destinatário |
| `DATABASE_URL` | Somente terminal para bootstrap | Apenas durante importação | Scripts Node.js, não exportar no JSON |
| `JOOBLE_BR_API_KEY` | `.env` privado do contêiner gateway | Obrigatório para Jooble | Chave API regional do portal brasileiro |
| `GATEWAY_SHARED_TOKEN` | `.env` do gateway e credencial Header Auth do n8n | Obrigatório para Jooble | Protege a comunicação interna com o gateway |

Nunca incluir senhas em arquivos JSON de workflow, Git ou logs. Credenciais exportadas não são resolvidas automaticamente em outra instância.

## Instalação do banco

Na pasta do projeto no Ubuntu Server:

```bash
cd ~/MonitoramentoVagas
git pull --ff-only
psql -h 127.0.0.1 -U tecops_user -d tecops -W -v ON_ERROR_STOP=1 -f database/001_jobs.sql
psql -h 127.0.0.1 -U tecops_user -d tecops -W -v ON_ERROR_STOP=1 -f database/002_pipeline_runtime.sql
psql -h 127.0.0.1 -U tecops_user -d tecops -W -v ON_ERROR_STOP=1 -f database/003_audit_views.sql
npm --prefix database install
node database/bootstrap-runtime.cjs --dry-run
```

Antes do bootstrap real: verifique `SELECT count(*) FROM tecops_pipeline_state;`. Se já houver uma linha, **não reinicialize** nem sobrescreva o banco. Para uma instalação nova, forneça `DATABASE_URL` de forma segura com senha codificada em URL e execute `node database/bootstrap-runtime.cjs`. O script recusa sobrescrever um estado existente.

## Docker e rede local

Nesta instalação, n8n está em contêiner `monitor-vagas-n8n` e o PostgreSQL roda no host Ubuntu. `localhost` no contêiner não é o host. Use o gateway real da rede Docker, obtido por:

```bash
sudo docker inspect -f '{{range .NetworkSettings.Networks}}{{.Gateway}}{{end}}' monitor-vagas-n8n
```

O PostgreSQL deve escutar também nesse gateway, e o `pg_hba.conf` deve permitir **somente** a origem autorizada, usuário e banco específicos. Não use `listen_addresses='*'` nem abra 5432 para internet apenas para facilitar testes. Use as regras de firewall apropriadas.

## Instalação do n8n

1. Faça backup da base, dos JSONs e dos workflows atualmente publicados no n8n.
2. Atualize os workflows existentes A, C, D, E, F, G preservando os IDs; B/H não foram modificados nesta entrega. Se importar uma cópia, reconfigure o nó G que aponta para o ID do subworkflow.
3. Garanta que o G lê histórico Postgres inicializado. Vincule credenciais Postgres e GitHub a todos os nós correspondentes.
4. Configure Adzuna Custom Auth na interface do n8n, se houver conta autorizada:
```json
{"qs":{"app_id":"SUBSTITUIR_NA_CREDENCIAL","app_key":"SUBSTITUIR_NA_CREDENCIAL"}}
```
5. Configure o SMTP e valores de remetente/destinatário. O n8n pode bloquear `$env` pela interface, então a alternativa é usar valores fixos **somente nos campos do nó**, com acesso administrativo restrito.
6. Configure H como Error workflow; mantenha workflows antigos desativados para evitar gravações concorrentes.
7. Execute G em ambiente de testes: confirme a leitura inicial, A–E, commit PostgreSQL, relatório semanal e espelho GitHub. Só então ative o agendamento.

### Consultas de verificação

```sql
SELECT revision,updated_at FROM tecops_pipeline_state;
SELECT application_status,count(*) FROM jobs GROUP BY application_status;
SELECT run_key,status,stage,started_at FROM tecops_execution_logs ORDER BY started_at DESC LIMIT 10;
SELECT * FROM tecops_source_overview;
```

### Execução do n8n e horários

- Diário: 07:00, `America/Sao_Paulo`.
- Semanal: segunda-feira 08:00, `America/Sao_Paulo`.
- O G agora possui dois nós para indicar explicitamente `run.kind`, evitando erros de identificação entre as agendas.
- Mesmo sem novas vagas confirmadas, F gera relatório semanal com o aviso correspondente; o SMTP só deve ser considerado funcional após teste real de recebimento.

Não há atualização automática da instância n8n do usuário por alterações no repositório. O merge no GitHub requer reimportar/revisar workflows na interface.

## Credenciais Jooble e diagnóstico Adzuna

O procedimento atualizado está em [docs/INTEGRACOES_ADZUNA_JOOBLE.md](INTEGRACOES_ADZUNA_JOOBLE.md). Não coloque as chaves Jooble nem o token compartilhado no workflow exportado; mantenha `.env` fora do versionamento. Adzuna HTTP 401 exige revisão de `app_id`/`app_key` e permissão da conta, sem fallback para dados inventados.
