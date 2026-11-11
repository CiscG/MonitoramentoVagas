# TecOps — migração PostgreSQL e resiliência n8n

**Estado:** implementação versionada, ainda não instalada/testada no n8n e banco do usuário. Novos arquivos importam desativados. Faça backup antes de trocar a versão ativa.

## Decisão de arquitetura

- PostgreSQL é **fonte operacional e histórica autoritativa**: `jobs`, `job_publications`, `tecops_pipeline_state`, `tecops_execution_logs`, `report_snapshots`.
- `data/vagas.json` no GitHub é **espelho de leitura para GitHub Pages**. A gravação no PostgreSQL ocorre primeiro, em transação; falhas do espelho não apagam o banco.
- O workflow **E** ainda calcula eventos e deduplicação em JavaScript, mas recebe `previous` do PostgreSQL; a migração usa `tecops_upsert_job` no banco dentro da transação. Não execute simultaneamente os workflows antigos que gravam no GitHub.
- Relatórios semanais são arquivados transacionalmente em `report_snapshots` e `tecops_pipeline_state.report_archive`; e-mails saem somente após confirmação do arquivo.

## Instalação (Ubuntu Server / PostgreSQL)

1. Faça backup da instância n8n e dos arquivos `data/vagas.json` e `data/relatorios-semanais.json`; confirme que a importação não está acontecendo em paralelo.
2. Crie **um banco PostgreSQL dedicado** e um usuário com permissões mínimas para leitura, escrita e execução das funções. Configure conectividade privada (localhost ou Tailscale, não porta aberta para a internet).
3. Após revisar os scripts, execute:

```bash
export DATABASE_URL='postgresql://usuario:senha@localhost:5432/tecops'
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/001_jobs.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/002_pipeline_runtime.sql
cd database
npm install
node bootstrap-runtime.cjs --dry-run
node bootstrap-runtime.cjs
cd ..
```

**Evite escrever senhas em comandos persistidos**; prefira um arquivo de ambiente com permissões restritas, um gerenciador de segredos ou variável definida de forma segura. O bootstrap é idempotente no sentido de **recusar sobrescrever** uma base já inicializada. Não desative o fluxo antigo antes de confirmar a migração do histórico completo.

4. No n8n, crie uma **credencial PostgreSQL** dedicada. Não a exporte no workflow e não use conexão ao DB no navegador/Pages. Teste `SELECT revision FROM tecops_pipeline_state WHERE singleton=TRUE` (deve retornar 0 logo após bootstrap).
5. Atualize os workflows A, C e G com os JSON desta branch, **preservando os IDs dos workflows** sempre que possível. Configure a mesma credencial PostgreSQL nos nós do G **Ler estado PostgreSQL**, **Persistir PostgreSQL** e **Arquivar relatório PostgreSQL**.
6. Importe **H-log-erros.json**, associe sua credencial PostgreSQL ao nó de logging e configure H em **Workflow settings > Error workflow** de G e dos demais workflows A–F. Use as permissões de execução de subworkflow exigidas pelo n8n.
7. Configure credencial **GitHub API** nos nós **Ler versão pública GitHub** e **Publicar espelho GitHub** do G, com apenas `Contents: Read and write` no repo.
8. Configure credencial **SMTP** e seus endereços no nó de e-mail do G. Se já alterou endereços/SMTP na interface, anote a configuração **antes** de atualizar G — o arquivo exportado não inclui suas credenciais.
9. No A, associe credencial **HTTP Request > Generic Credential Type > Custom Auth** às fontes Adzuna, com os parâmetros JSON configurados **somente dentro da credencial**:

```json
{
  "qs": {
    "app_id": "SEU_ID_PRIVADO",
    "app_key": "SUA_CHAVE_PRIVADA"
  }
}
```

Esses valores são exemplos de formato, **não devem ser commitados**. Os nós Jooble (três) foram convertidos para diagnósticos de indisponibilidade por padrão: a API usa chave no **caminho** da URL, que não pode ser protegida por credencial HTTP padrão sem suporte específico. Para reativar Jooble, use uma integração intermediária autenticada, com credenciais e segurança de rede apropriadas. Não insira chaves no JSON exportado.
10. Execute G com uma cópia dos dados em banco de testes, valide logs, relatório e espelho. Desative workflows legados. Só então ative G em produção.

## Uso dos nodes nativos

| Workflow | Primitivas |
|---|---|
| A | HTTP Request, Code para normalizar, Wait para limitar taxa, tentativas nativas de rede |
| B | Code para filtros |
| C | Loop Over Items (batch 1), HTTP Request, Merge, IF, Wait (2s entre vagas; reenvio exponencial 2/4/8s, respeitando `Retry-After` quando numérico) |
| D | Code para classificação |
| E | Code com histórico recebido do PostgreSQL; fallback conservador ao GitHub apenas se entrada inválida |
| F | Code para relatório detalhado |
| G | Schedule, Postgres, Merge, Code, IF, HTTP Request (espelho), subworkflows, SMTP |
| H | Error Trigger, Code para sanitizar, Postgres para logs |

A **retentativa progressiva** está implementada explicitamente na verificação C. A usa tentativas nativas do HTTP Request com intervalo fixo mais pausas entre fontes; uma falha de fonte é registrada sem inventar vagas. Os limites específicos das APIs (cotas por minuto/dia) podem variar por plano e precisam ser configurados de acordo com o provedor.

## Sem perda de histórico e concorrência

O G lê `revision` no banco, chama A–E e só grava usando `tecops_commit_pipeline` se o estado ainda tiver a mesma revisão (concorrência otimista). A função grava `jobs`, publicações, histórico JSON e logs na **mesma transação**. Se o GitHub estiver fora, o estado persiste e a próxima execução pode tentar atualizar o espelho; erros de publicação não devem provocar exclusão de vagas do banco.

O arquivo público é uma **visão materializada**, não um backup autoritativo. Aplique backups PostgreSQL regulares com `pg_dump` e registre a política de retenção de logs/relatórios.

## Logs

`tecops_execution_logs` inclui chave de execução, tipo, estágio, resultado, totais, diagnósticos sem segredos e mensagem resumida. Os logs de falha vêm do workflow H; o log de sucesso é gravado na função SQL. As execuções nativas do n8n continuam sendo fonte adicional de diagnóstico. Não grave dados de credenciais em logs.

## Restrições

- O JSON do n8n foi validado estaticamente e por simulações; execute testes integrados na sua versão do n8n e PostgreSQL antes de produção.
- Os nós PostgreSQL e de e-mail não têm IDs de credenciais nos exports; **é obrigatório vinculá-los após importar**.
- A migração **não foi aplicada em seu servidor**. Sem o bootstrap e as credenciais, G falhará de forma segura em vez de continuar com estado vazio.
- O nó `Merge` do G combina contexto e estado por posição; todas as execuções devem produzir **um item de contexto e uma linha do SELECT**.
- Em conflito de revisão ou falha do GitHub, não sobrescreva o histórico com dados vazios. Investigue e repita o G a partir da leitura atualizada.
