CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- VECTOR_FALLBACK: production may enable pgvector and replace FLOAT8[] with vector(1536).
-- Optional production upgrade:
--   CREATE EXTENSION IF NOT EXISTS vector;
--   ALTER TABLE feedback_memory ALTER COLUMN embedding TYPE vector(1536) USING embedding::vector;

CREATE TABLE IF NOT EXISTS prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_idea TEXT NOT NULL,
  target_model_id TEXT NOT NULL,
  modality TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  version_type TEXT NOT NULL CHECK (version_type IN ('optimized', 'synthetic')),
  prompt_text TEXT NOT NULL,
  decision_status TEXT NOT NULL CHECK (decision_status IN ('candidate', 'accepted', 'rejected', 'needs_review')),
  quality_gate JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(prompt_id, version_number)
);

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  prompt_id UUID NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  prompt_version_id UUID NOT NULL REFERENCES prompt_versions(id) ON DELETE CASCADE,
  user_score NUMERIC(5,2) NOT NULL,
  star_rating INT NOT NULL CHECK (star_rating BETWEEN 1 AND 5),
  preference TEXT NOT NULL CHECK (preference IN ('new_better', 'old_better', 'blend_needed', 'both_bad')),
  user_notes TEXT NOT NULL DEFAULT '',
  needs_optimization BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS test_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  prompt_id UUID REFERENCES prompts(id) ON DELETE SET NULL,
  prompt_version_id UUID REFERENCES prompt_versions(id) ON DELETE SET NULL,
  original_prompt TEXT NOT NULL,
  optimized_prompt TEXT NOT NULL,
  target_model_id TEXT NOT NULL,
  external_score NUMERIC(5,2),
  system_score NUMERIC(5,2) NOT NULL,
  pass BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS model_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL UNIQUE,
  target_model_id TEXT NOT NULL,
  generator_model_ids TEXT[] NOT NULL DEFAULT '{}',
  evaluator_model_ids TEXT[] NOT NULL DEFAULT '{}',
  image_judge_model_ids TEXT[] NOT NULL DEFAULT '{}',
  is_locked BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL CHECK (source IN ('auto', 'manual', 'imported')),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS test_run_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  test_run_id UUID NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
  image_role TEXT NOT NULL CHECK (image_role IN ('reference', 'generated', 'thumbnail', 'other')),
  original_name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes BIGINT NOT NULL CHECK (size_bytes <= 15728640),
  sha256 TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_ref TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dataset_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  export_path TEXT NOT NULL,
  item_count INT NOT NULL,
  privacy_findings JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quality_gate_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_version_id UUID REFERENCES prompt_versions(id) ON DELETE CASCADE,
  total_score NUMERIC(5,2) NOT NULL,
  intent_fidelity NUMERIC(4,2) NOT NULL,
  hallucination_resistance NUMERIC(4,2) NOT NULL,
  pass BOOLEAN NOT NULL,
  needs_review BOOLEAN NOT NULL DEFAULT false,
  failed_dimensions TEXT[] NOT NULL DEFAULT '{}',
  deductions JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feedback_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  version_id TEXT NOT NULL,
  target_model_id TEXT NOT NULL,
  human_overrides_ai BOOLEAN NOT NULL DEFAULT false,
  repeated_issue_keys TEXT[] NOT NULL DEFAULT '{}',
  yellow_items JSONB NOT NULL DEFAULT '[]',
  green_below_nine_items JSONB NOT NULL DEFAULT '[]',
  effective_strategies TEXT[] NOT NULL DEFAULT '{}',
  ineffective_strategies TEXT[] NOT NULL DEFAULT '{}',
  embedding FLOAT8[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feedback_memory_artifact_idx ON feedback_memory(project_id, artifact_id, artifact_type);
CREATE INDEX IF NOT EXISTS feedback_memory_repeated_issue_idx ON feedback_memory USING GIN(repeated_issue_keys);
CREATE INDEX IF NOT EXISTS feedback_memory_yellow_items_idx ON feedback_memory USING GIN(yellow_items);
CREATE INDEX IF NOT EXISTS feedback_memory_green_below_nine_items_idx ON feedback_memory USING GIN(green_below_nine_items);

CREATE TABLE IF NOT EXISTS github_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  prompt_id TEXT NOT NULL,
  prompt_version_id TEXT NOT NULL,
  ledger_path TEXT NOT NULL,
  branch_name TEXT,
  commit_sha TEXT,
  pr_url TEXT,
  issue_url TEXT,
  sync_status TEXT NOT NULL DEFAULT 'local_written',
  privacy_findings JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS github_ledger_entries_prompt_idx ON github_ledger_entries(project_id, prompt_id, prompt_version_id);
CREATE INDEX IF NOT EXISTS github_ledger_entries_status_idx ON github_ledger_entries(sync_status);

CREATE TABLE IF NOT EXISTS hallucination_live_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  detector_results JSONB NOT NULL DEFAULT '[]',
  source_status JSONB NOT NULL DEFAULT '{}',
  ok BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hallucination_live_runs_artifact_idx ON hallucination_live_runs(project_id, artifact_id);
CREATE INDEX IF NOT EXISTS hallucination_live_runs_detector_results_idx ON hallucination_live_runs USING GIN(detector_results);

CREATE TABLE IF NOT EXISTS provider_registry_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_model_id TEXT NOT NULL,
  resolved_model_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  warnings JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provider_registry_validations_model_idx ON provider_registry_validations(requested_model_id, resolved_model_id, status);
