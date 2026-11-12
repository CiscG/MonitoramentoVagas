-- Consultas operacionais e auditoria de fontes do TecOps.
-- Aditivo, seguro para reaplicação. Requer 001_jobs.sql e 002_pipeline_runtime.sql.
BEGIN;

CREATE OR REPLACE VIEW tecops_source_overview AS
SELECT source,
       count(*)::bigint AS vagas,
       count(*) FILTER (WHERE application_status='ACTIVE')::bigint AS anuncios_confirmados_ativos,
       count(*) FILTER (WHERE application_status IN ('CLOSED','EXPIRED'))::bigint AS anuncios_encerrados,
       count(*) FILTER (WHERE application_status IN ('PENDING_VALIDATION','SOURCE_UNAVAILABLE'))::bigint AS sem_confirmacao,
       max(last_verified_at) AS ultima_validacao,
       max(last_seen_at) AS ultima_identificacao
FROM jobs
GROUP BY source;

CREATE OR REPLACE VIEW tecops_execution_overview AS
SELECT kind,status,stage,count(*)::bigint AS execucoes,
       max(started_at) AS ultima_execucao,
       max(finished_at) AS ultima_conclusao
FROM tecops_execution_logs
GROUP BY kind,status,stage;

CREATE OR REPLACE VIEW tecops_recent_publications AS
SELECT p.job_id,j.title,j.company,p.source,p.external_id,p.canonical_url,
       p.first_observed_at,p.last_observed_at,j.application_status
FROM job_publications p
JOIN jobs j ON j.id=p.job_id;

COMMIT;
