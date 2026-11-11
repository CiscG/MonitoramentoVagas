-- TecOps: PostgreSQL opcional. Execute antes de importar vagas.
-- A aplicação atual usa data/vagas.json; esta migração NÃO altera o n8n.
BEGIN;

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  external_id TEXT,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  requirements TEXT,
  technologies JSONB NOT NULL DEFAULT '[]'::jsonb,
  job_level TEXT,
  job_type TEXT,
  employment_type TEXT,
  work_mode TEXT,
  location TEXT,
  salary_min NUMERIC(15, 2),
  salary_max NUMERIC(15, 2),
  salary_currency VARCHAR(3),
  experience_requirement TEXT,
  application_url TEXT,
  source TEXT NOT NULL,
  source_url TEXT,
  published_at TIMESTAMPTZ,
  deadline TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_verified_at TIMESTAMPTZ,
  application_status TEXT NOT NULL DEFAULT 'PENDING_VALIDATION',
  compatibility_score SMALLINT CHECK (compatibility_score BETWEEN 0 AND 100),
  compatibility_notes TEXT,
  content_hash TEXT NOT NULL DEFAULT '',
  canonical_url TEXT,
  company_normalized TEXT NOT NULL DEFAULT '',
  title_normalized TEXT NOT NULL DEFAULT '',
  original_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT jobs_salary_range CHECK (salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max),
  CONSTRAINT jobs_seen_range CHECK (last_seen_at >= first_seen_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS jobs_external_identity_uidx
  ON jobs (lower(source), external_id) WHERE external_id IS NOT NULL AND external_id <> '';
CREATE UNIQUE INDEX IF NOT EXISTS jobs_canonical_url_uidx
  ON jobs (canonical_url) WHERE canonical_url IS NOT NULL AND canonical_url <> '';
CREATE INDEX IF NOT EXISTS jobs_content_match_idx ON jobs (company_normalized, title_normalized, content_hash);
CREATE INDEX IF NOT EXISTS jobs_search_idx ON jobs (application_status, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS jobs_first_seen_idx ON jobs (first_seen_at DESC);

-- Cada nova URL ou identificador alternativo é um evento da MESMA vaga.
CREATE TABLE IF NOT EXISTS job_publications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  source TEXT NOT NULL,
  external_id TEXT,
  canonical_url TEXT,
  first_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  content_hash TEXT,
  UNIQUE (job_id, source, external_id, canonical_url)
);
CREATE INDEX IF NOT EXISTS job_publications_external_idx
  ON job_publications (lower(source), external_id);
CREATE INDEX IF NOT EXISTS job_publications_url_idx
  ON job_publications (canonical_url);

-- Relatórios gerados/importados são imutáveis e independentes do estado atual.
CREATE TABLE IF NOT EXISTS report_snapshots (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_key TEXT NOT NULL UNIQUE,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  jobs_count INTEGER NOT NULL CHECK (jobs_count >= 0),
  payload JSONB NOT NULL
);

-- Adapta uma base existente se as tabelas ainda não tiverem as novas colunas.
-- Para uma tabela jobs legada com esquema muito diferente, faça uma migração
-- específica antes de executar esta definição (CREATE IF NOT EXISTS não converte tipos).

CREATE OR REPLACE FUNCTION tecops_norm(value TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT trim(regexp_replace(lower(translate(coalesce(value, ''),
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
    'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn')),
    '[^a-z0-9]+', ' ', 'g'));
$$;

-- Invocada pelo importador depois de normalizar URLs e campos.
-- Deduplicação conservadora: fonte+ID, URL canônica, ou empresa+cargo+hash
-- com descrição significativa; empresa+cargo sozinhos NÃO são chave única.
CREATE OR REPLACE FUNCTION tecops_upsert_job(p JSONB)
RETURNS TABLE(job_id TEXT, is_new BOOLEAN)
LANGUAGE plpgsql AS $$
DECLARE
  v_id TEXT := nullif(trim(p->>'id'), '');
  v_ext TEXT := nullif(trim(p->>'external_id'), '');
  v_source TEXT := nullif(trim(p->>'source'), '');
  v_url TEXT := nullif(trim(p->>'canonical_url'), '');
  v_company TEXT := coalesce(nullif(trim(p->>'company'), ''), 'Empresa não informada');
  v_title TEXT := coalesce(nullif(trim(p->>'title'), ''), 'Cargo não informado');
  v_cn TEXT := tecops_norm(v_company);
  v_tn TEXT := tecops_norm(v_title);
  v_hash TEXT := coalesce(p->>'content_hash', '');
  v_first TIMESTAMPTZ := coalesce(nullif(p->>'first_seen_at','')::timestamptz, NOW());
  v_last TIMESTAMPTZ := coalesce(nullif(p->>'last_seen_at','')::timestamptz, NOW());
  v_existing TEXT;
  v_ident TEXT;
  v_seen TIMESTAMPTZ;
BEGIN
  IF v_id IS NULL OR v_source IS NULL THEN
    RAISE EXCEPTION 'id e source são obrigatórios';
  END IF;
  v_last := greatest(v_first, v_last);
  -- Serializa candidatos com o mesmo título/empresa, inclusive de fontes diferentes.
  v_ident := coalesce(nullif(v_cn||'|'||v_tn, '|'), v_source||'|'||v_id);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_ident, 0));

  SELECT j.id INTO v_existing FROM jobs j
  WHERE j.id = v_id
    OR (v_ext IS NOT NULL AND lower(j.source) = lower(v_source) AND j.external_id = v_ext)
    OR (v_url IS NOT NULL AND j.canonical_url = v_url)
    OR (v_hash <> '' AND length(coalesce(p->>'description','')) >= 40
        AND j.company_normalized = v_cn AND j.title_normalized = v_tn AND j.content_hash = v_hash
        AND j.location IS NOT DISTINCT FROM nullif(p->>'location',''))
  ORDER BY CASE WHEN j.id = v_id THEN 0
    WHEN v_ext IS NOT NULL AND lower(j.source) = lower(v_source) AND j.external_id = v_ext THEN 1
    WHEN v_url IS NOT NULL AND j.canonical_url = v_url THEN 2
    ELSE 3 END
  LIMIT 1 FOR UPDATE;

  IF v_existing IS NULL THEN
    -- Se já existe publicação alternativa com a mesma identidade, também reutilize.
    SELECT jp.job_id INTO v_existing FROM job_publications jp
    WHERE (v_ext IS NOT NULL AND lower(jp.source)=lower(v_source) AND jp.external_id=v_ext)
      OR (v_url IS NOT NULL AND jp.canonical_url=v_url)
    ORDER BY jp.id LIMIT 1;
  END IF;

  IF v_existing IS NULL THEN
    INSERT INTO jobs (
      id, external_id, title, company, description, requirements, technologies,
      job_level, job_type, employment_type, work_mode, location, salary_min, salary_max,
      salary_currency, experience_requirement, application_url, source, source_url,
      published_at, deadline, first_seen_at, last_seen_at, last_verified_at,
      application_status, compatibility_score, compatibility_notes, content_hash,
      canonical_url, company_normalized, title_normalized, original_data
    ) VALUES (
      v_id, v_ext, v_title, v_company, coalesce(p->>'description',''), p->>'requirements',
      CASE WHEN jsonb_typeof(p->'technologies')='array' THEN p->'technologies' ELSE '[]'::jsonb END,
      p->>'job_level', p->>'job_type', p->>'employment_type', p->>'work_mode',
      p->>'location', nullif(p->>'salary_min','')::numeric, nullif(p->>'salary_max','')::numeric,
      p->>'salary_currency', p->>'experience_requirement', p->>'application_url',
      v_source, p->>'source_url', nullif(p->>'published_at','')::timestamptz,
      nullif(p->>'deadline','')::timestamptz, v_first, v_last,
      nullif(p->>'last_verified_at','')::timestamptz,
      coalesce(nullif(p->>'application_status',''),'PENDING_VALIDATION'),
      nullif(p->>'compatibility_score','')::smallint,
      p->>'compatibility_notes', v_hash, v_url, v_cn, v_tn, p
    );
    v_existing := v_id;
    is_new := true;
  ELSE
    UPDATE jobs SET
      title = coalesce(nullif(p->>'title',''), jobs.title),
      company = coalesce(nullif(p->>'company',''), jobs.company),
      description = coalesce(nullif(p->>'description',''), jobs.description),
      requirements = coalesce(nullif(p->>'requirements',''), jobs.requirements),
      technologies = CASE WHEN jsonb_typeof(p->'technologies')='array' AND jsonb_array_length(p->'technologies')>0
        THEN p->'technologies' ELSE jobs.technologies END,
      job_level = coalesce(nullif(p->>'job_level',''), jobs.job_level),
      job_type = coalesce(nullif(p->>'job_type',''), jobs.job_type),
      employment_type = coalesce(nullif(p->>'employment_type',''), jobs.employment_type),
      work_mode = coalesce(nullif(p->>'work_mode',''), jobs.work_mode),
      location = coalesce(nullif(p->>'location',''), jobs.location),
      salary_min = coalesce(nullif(p->>'salary_min','')::numeric, jobs.salary_min),
      salary_max = coalesce(nullif(p->>'salary_max','')::numeric, jobs.salary_max),
      salary_currency = coalesce(nullif(p->>'salary_currency',''), jobs.salary_currency),
      experience_requirement = coalesce(nullif(p->>'experience_requirement',''), jobs.experience_requirement),
      application_url = coalesce(jobs.application_url, p->>'application_url'),
      source_url = coalesce(jobs.source_url, p->>'source_url'),
      published_at = least(jobs.published_at, nullif(p->>'published_at','')::timestamptz),
      deadline = coalesce(nullif(p->>'deadline','')::timestamptz, jobs.deadline),
      first_seen_at = least(jobs.first_seen_at, v_first),
      last_seen_at = greatest(jobs.last_seen_at, v_last),
      last_verified_at = greatest(jobs.last_verified_at, nullif(p->>'last_verified_at','')::timestamptz),
      application_status = CASE WHEN nullif(p->>'last_verified_at','')::timestamptz IS NOT NULL
        AND (jobs.last_verified_at IS NULL OR nullif(p->>'last_verified_at','')::timestamptz >= jobs.last_verified_at)
        THEN coalesce(nullif(p->>'application_status',''),jobs.application_status) ELSE jobs.application_status END,
      compatibility_score = coalesce(nullif(p->>'compatibility_score','')::smallint, jobs.compatibility_score),
      compatibility_notes = coalesce(nullif(p->>'compatibility_notes',''), jobs.compatibility_notes),
      content_hash = CASE WHEN v_hash <> '' THEN v_hash ELSE jobs.content_hash END,
      original_data = jobs.original_data || p,
      updated_at = NOW()
    WHERE jobs.id = v_existing;
    is_new := false;
  END IF;

  -- Nunca substitui a identidade original de uma publicação por uma republicação.
  -- (NULLs em UNIQUE não são suficientes para a idempotência).
  IF NOT EXISTS (
    SELECT 1 FROM job_publications jp WHERE jp.job_id=v_existing
      AND lower(jp.source)=lower(v_source)
      AND jp.external_id IS NOT DISTINCT FROM v_ext
      AND jp.canonical_url IS NOT DISTINCT FROM v_url
  ) THEN
    INSERT INTO job_publications (job_id, source, external_id, canonical_url, first_observed_at, last_observed_at, published_at, content_hash)
    VALUES (v_existing, v_source, v_ext, v_url, v_first, v_last,
      nullif(p->>'published_at','')::timestamptz, nullif(v_hash,''));
  ELSE
    UPDATE job_publications jp SET last_observed_at=greatest(jp.last_observed_at,v_last)
    WHERE jp.job_id=v_existing AND lower(jp.source)=lower(v_source)
      AND jp.external_id IS NOT DISTINCT FROM v_ext
      AND jp.canonical_url IS NOT DISTINCT FROM v_url;
  END IF;
  job_id := v_existing;
  RETURN NEXT;
END;
$$;

COMMIT;
