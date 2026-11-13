-- Diagnóstico somente leitura. NÃO altera tabelas, vagas ou revisões.
-- Execução: psql -h 127.0.0.1 -U tecops_user -d tecops -W -v ON_ERROR_STOP=1 -f database/004_diagnostico_operacional.sql
BEGIN READ ONLY;
SELECT NOW() AS agora_servidor, current_database() AS banco;
SELECT revision,updated_at, NOW()-updated_at AS tempo_desde_ultimo_commit
FROM tecops_pipeline_state WHERE singleton=TRUE;
SELECT run_key,kind,status,stage,started_at,finished_at,
       EXTRACT(EPOCH FROM (COALESCE(finished_at, NOW())-started_at))::numeric(12,1) AS duracao_segundos,
       LEFT(error_message,120) AS erro_resumido
FROM tecops_execution_logs
ORDER BY started_at DESC LIMIT 15;
SELECT source,application_status,COUNT(*) AS vagas,
       MAX(last_verified_at) AS ultima_verificacao
FROM jobs
GROUP BY source,application_status
ORDER BY source,application_status;
SELECT COUNT(*) AS total_jobs,COUNT(*) FILTER (WHERE last_verified_at IS NULL) AS sem_validacao,
       COUNT(*) FILTER (WHERE application_status='PENDING_VALIDATION') AS pendentes,
       MAX(last_seen_at) AS ultimo_registro_visto
FROM jobs;
COMMIT;
