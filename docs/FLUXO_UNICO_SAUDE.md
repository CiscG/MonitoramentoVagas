# Diagnóstico e implantação: fluxo de publicação único

## Confirmação em 13/11/2026

O resultado do servidor informado nesta conversa foi:
- Estado PostgreSQL `revision=8`, último commit em `2026-11-12 10:00:41 UTC` (**07:00:41 de Brasília**).
- Oito entradas `daily / committed / postgres_commit` e um registro de erro.
- Os commits do GitHub do tipo `Valida status de candidatura das oportunidades` continuaram após o último commit PostgreSQL.

Isso **sugere** que o fluxo legado de validação permanece em execução, mas a atividade deve ser verificada diretamente em **n8n → Executions** e **Workflows**. A versão `active:false` no GitHub NÃO representa o estado das cópias instaladas no n8n.

## Mudanças de código desta branch

1. O arquivo legado `n8n/validar-status-candidaturas-workflow.json` mantém os nós, mas desconecta o link para **Salvar status no GitHub**.
2. `n8n/monitor-vagas-workflow.json` mantém os nós, mas desconecta a saída de **Mudou alguma vaga?** para **Publicar vagas.json**.
3. O pipeline G continua como único escritor do JSON público, **após** confirmação de transação PostgreSQL.
4. O frontend apresenta `ultimaSincronizacao`, `atualizadoEm`, diagnósticos, contagens e idade dos dados publicados, com status **desatualizado** após 36h; não apresenta esses campos como logs ao vivo.
5. A classificação do site usa `compatibility_score` se estiver disponível no registro (0–100); caso contrário, faz estimativa provisória com as regras antigas e identifica explicitamente a limitação.
6. Nenhuma alteração foi feita nas funções de deduplicação ou nas tabelas de produção.

## Antes de mesclar: backup

```bash
mkdir -p "$HOME/tecops-backups"
pg_dump -h 127.0.0.1 -U tecops_user -d tecops -W -Fc \
  -f "$HOME/tecops-backups/tecops-$(date +%Y%m%d-%H%M%S).dump"
```

Guarde o backup fora do repositório Git e fora do GitHub Pages. Faça também backup dos workflows exportados diretamente da interface do n8n.

## Procedimento na instância n8n (obrigatório)

1. Abra **Workflows** e procure instâncias ativas de `monitor-vagas-workflow` (antigo, 60 minutos) e `validar-status-candidaturas-workflow` (antigo, 6 horas).
2. **Desative** ambos. Verifique se não existe outro workflow gravando `data/vagas.json` diretamente.
3. Confira se o workflow **G — Agendamento e orquestração** está **publicado/ativo**, e se seus nós `Executar A/B/C/D/E/F` apontam aos subworkflows corretos na instância. O `active:false` do export não garante que esteja ativo no servidor.
4. Confira as credenciais PostgreSQL, GitHub, Adzuna, Jooble e SMTP. Teste individualmente sem compartilhar tokens.
5. Faça uma **execução manual diária** de G, sem iniciar uma segunda execução em paralelo. Confirme **Persistir PostgreSQL → Confirmar transação PostgreSQL → Publicar espelho GitHub**.
6. Se o PostgreSQL confirmar o commit, mas o espelho falhar, corrija a falha do GitHub; **não** faça bootstrap e **não** restaure o JSON antigo.
7. Confirme os horários e o cron do G em `America/Sao_Paulo`. Durante a implantação, garanta que nenhum workflow antigo continue fazendo PUT.
8. Após o merge, o site mostrará estado e data da última sincronização **publicada**, e não a hora do último clique do navegador.

**Importante:** importar JSON atualizado de um workflow legado não altera automaticamente uma versão instalada diferente. Desative as instâncias ativas na interface antes de confiar no novo código.

## Verificações PostgreSQL — somente leitura

```bash
cd ~/MonitoramentoVagas
git pull --ff-only
psql -h 127.0.0.1 -U tecops_user -d tecops -W \
  -v ON_ERROR_STOP=1 -f database/004_diagnostico_operacional.sql
```

O arquivo executa `BEGIN READ ONLY` e apenas comandos `SELECT`. Não cria objetos nem remove dados.

## Verificação de publicação no GitHub

Depois da execução manual:
- o `revision` do PostgreSQL deve aumentar após commit;
- `data/vagas.json` deve apresentar `ultimaSincronizacao` mais recente;
- os diagnósticos devem refletir a mesma execução;
- não devem surgir novos commits automáticos do fluxo legado com mensagem `Valida status de candidatura das oportunidades`.

**Se a revisão continuar estacionada**, verifique o histórico de execuções G no n8n e se o agendamento foi publicado; ter um arquivo JSON versionado não significa ter uma automação rodando.

## Testes

```bash
node --test tests/*.test.cjs
```

O CI testa apenas código e cenários determinísticos; não alcança n8n, PostgreSQL ou credenciais reais do seu servidor.
