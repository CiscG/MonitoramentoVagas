-- TecOps: operação PostgreSQL (após database/001_jobs.sql).
-- Execute em uma base dedicada e faça backup antes de migrar.
BEGIN;

CREATE TABLE IF NOT EXISTS tecops_pipeline_state (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  payload JSONB NOT NULL,
  report_archive JSONB NOT NULL DEFAULT '{"reports":[]}'::jsonb,
  revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tecops_execution_logs (
  run_key TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'daily',
  status TEXT NOT NULL CHECK (status IN ('started','committed','failed','reported')),
  stage TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS tecops_execution_logs_started_idx ON tecops_execution_logs (started_at DESC);

CREATE OR REPLACE FUNCTION tecops_commit_pipeline(
  p_payload JSONB, p_expected_revision BIGINT,
  p_run_key TEXT, p_kind TEXT, p_diagnostics JSONB DEFAULT '[]'::jsonb
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_revision BIGINT;
  v_job JSONB;
  v_upserted INTEGER := 0;
  v_result RECORD;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload->'vagas') <> 'array'
    OR jsonb_typeof(p_payload->'historicoVagas') <> 'array'
    OR jsonb_typeof(p_payload->'eventosHistorico') <> 'array' THEN
    RAISE EXCEPTION 'Payload incompleto: vagas, historicoVagas e eventosHistorico obrigatórios';
  END IF;
  IF NULLIF(p_run_key, '') IS NULL THEN RAISE EXCEPTION 'run_key obrigatório'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('tecops:pipeline-state', 0));
  SELECT revision INTO v_revision FROM tecops_pipeline_state WHERE singleton = TRUE FOR UPDATE;
  IF v_revision IS NULL THEN
    RAISE EXCEPTION 'Estado PostgreSQL não inicializado. Importe o histórico antes de ativar G.';
  END IF;
  IF v_revision <> p_expected_revision THEN
    RAISE EXCEPTION 'Conflito de revisão (estado % versus esperado %); reexecute G para reler histórico',
      v_revision, p_expected_revision;
  END IF;
  -- Salva a tabela jobs e a visão JSON no MESMO commit, nunca em etapas isoladas.
  FOR v_job IN
    SELECT item FROM jsonb_array_elements(p_payload->'vagas' || p_payload->'historicoVagas') AS item
  LOOP
    SELECT * INTO v_result FROM tecops_upsert_job(v_job);
    v_upserted := v_upserted + 1;
  END LOOP;
  UPDATE tecops_pipeline_state SET payload=p_payload, revision=revision+1, updated_at=NOW()
    WHERE singleton=TRUE;
  INSERT INTO tecops_execution_logs(run_key,kind,status,stage,finished_at,summary)
    VALUES(p_run_key,COALESCE(NULLIF(p_kind,''),'daily'),'committed','postgres_commit',NOW(),
      jsonb_build_object('jobsProcessed',v_upserted,
        'totalHistorico',p_payload->'totalHistorico',
        'novasNaExecucao',p_payload->'novasNaExecucao',
        'diagnostics',COALESCE(p_diagnostics,'[]'::jsonb)))
    ON CONFLICT (run_key) DO UPDATE SET
      status='committed',stage='postgres_commit',finished_at=NOW(),summary=EXCLUDED.summary,
      error_message=NULL;
  RETURN jsonb_build_object('committed',TRUE,'revision',v_revision+1,'jobsProcessed',v_upserted);
END;
$$;

CREATE OR REPLACE FUNCTION tecops_archive_weekly_report(
  p_report JSONB, p_run_key TEXT
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_reports JSONB;
  v_week TEXT;
BEGIN
  v_week=NULLIF(p_report->>'weekKey','');
  IF v_week IS NULL OR jsonb_typeof(p_report->'sections') <> 'object'
    THEN RAISE EXCEPTION 'Relatório semanal inválido'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('tecops:pipeline-state', 0));
  SELECT COALESCE(report_archive->'reports','[]'::jsonb) INTO v_reports
    FROM tecops_pipeline_state WHERE singleton=TRUE FOR UPDATE;
  IF v_reports IS NULL THEN RAISE EXCEPTION 'Estado não inicializado'; END IF;
  SELECT COALESCE(jsonb_agg(item),'[]'::jsonb) INTO v_reports
    FROM jsonb_array_elements(v_reports) AS records(item) WHERE item->>'weekKey' <> v_week;
  v_reports=v_reports || jsonb_build_array(p_report);
  UPDATE tecops_pipeline_state SET
    report_archive=jsonb_build_object('updatedAt',NOW(),'reports',v_reports),
    updated_at=NOW() WHERE singleton=TRUE;
  INSERT INTO report_snapshots(report_key,jobs_count,payload)
    VALUES ('tecops-week:'||v_week,
      COALESCE((p_report->'counts'->>'new')::integer,0),p_report)
    ON CONFLICT(report_key) DO NOTHING;
  UPDATE tecops_execution_logs SET status='reported',stage='report_archived',
    finished_at=NOW(),summary=summary||jsonb_build_object('reportWeek',v_week)
    WHERE run_key=p_run_key;
  RETURN jsonb_build_object('archived',TRUE,'weekKey',v_week);
END;
$$;
COMMIT;
