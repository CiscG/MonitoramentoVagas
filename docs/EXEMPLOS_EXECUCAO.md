# Exemplos de execução e interpretação

## 1. Coleta diária

Entrada lógica esperada do G:
```json
{"run":{"kind":"daily","requestedAt":"2026-11-11T10:00:00.000Z","id":"EXEMPLO"}}
```

O exemplo ilustra o envelope e **não é um resultado real**. O G lê uma revisão e o histórico do PostgreSQL, chama A (fontes), B (filtros), C (validação), D (score), E (deduplicação), persiste em transação e atualiza o espelho público.

## 2. Agendamento semanal

O gatilho semanal fornece `kind=weekly` explicitamente. Depois do commit, o G executa F, arquiva em PostgreSQL e envia o e-mail via SMTP. Mesmo com zero novas confirmadas:

> Nenhuma nova vaga confirmada foi encontrada nesta semana.

## 3. Exemplos de status

| Evidência real ou contratual | Estado de anúncio | Estado de candidatura/reportável |
|---|---|---|
| GitHub issue #12493, estado `open` em 11/11/2026 | Publicação aberta | `PENDING_VALIDATION`: candidatura externa não confirmada |
| Issue GitHub com `state=closed` | Publicação fechada | `CLOSED` para anúncio, não inferir data de fechamento do formulário |
| API específica Himalayas HTTP 200 com objeto `job` | Anúncio ativo | `ACTIVE` como anúncio aceitando publicação; candidatura final ainda depende do link fornecido |
| API específica Himalayas HTTP 410 | Anúncio fechado | `CLOSED`, mantendo histórico privado |
| HTTP 404 ou 429 sem outra evidência | Indisponível / inconclusivo | `SOURCE_UNAVAILABLE`, não afirmar encerramento |

## 4. Validar sem modificar produção

```bash
node --test tests/*.test.cjs
npm --prefix database test
node database/bootstrap-runtime.cjs --dry-run
```

Para integração com banco de testes, o GitHub Actions executa os scripts SQL e valida o estado. Não confunda CI com execução real na instância n8n do servidor.

## 5. Operação e investigação

```sql
SELECT revision,updated_at FROM tecops_pipeline_state;
SELECT status,stage,started_at,error_message FROM tecops_execution_logs ORDER BY started_at DESC LIMIT 10;
SELECT source,application_status,count(*) FROM jobs GROUP BY source,application_status ORDER BY source;
```

Erros de credenciais ou bootstrap interrompem a execução: **não** substitua `previous` por `{vagas:[]}` para fazê-la continuar. Confirme as migrações e as credenciais do n8n em vez de descartar histórico.
