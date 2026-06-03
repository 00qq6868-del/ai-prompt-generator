CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id TEXT UNIQUE,
  email TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS model_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL UNIQUE,
  target_model_id TEXT NOT NULL,
  generator_model_ids TEXT[] NOT NULL DEFAULT '{}',
  evaluator_model_ids TEXT[] NOT NULL DEFAULT '{}',
  image_judge_model_ids TEXT[] NOT NULL DEFAULT '{}',
  is_locked BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL DEFAULT 'auto',
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_model_preferences_user ON model_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_model_preferences_device ON model_preferences(device_id);

CREATE TABLE IF NOT EXISTS prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  device_id TEXT NOT NULL,
  user_idea TEXT NOT NULL,
  target_model_id TEXT NOT NULL,
  target_model_category TEXT NOT NULL DEFAULT 'text',
  language TEXT NOT NULL DEFAULT 'zh',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prompts_user_created ON prompts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompts_device_created ON prompts(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompts_target ON prompts(target_model_id);

CREATE TABLE IF NOT EXISTS prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  parent_version_id UUID REFERENCES prompt_versions(id) ON DELETE SET NULL,
  version_number INT NOT NULL,
  version_type TEXT NOT NULL CHECK (version_type IN ('optimized','synthetic')),
  prompt_text TEXT NOT NULL,
  generator_model_ids TEXT[] NOT NULL DEFAULT '{}',
  evaluator_model_ids TEXT[] NOT NULL DEFAULT '{}',
  source_repo_commits TEXT[] NOT NULL DEFAULT '{}',
  ai_score NUMERIC(5,2),
  user_star_rating INT CHECK (user_star_rating BETWEEN 1 AND 5),
  decision_status TEXT NOT NULL DEFAULT 'candidate',
  decision_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(prompt_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_prompt_versions_prompt ON prompt_versions(prompt_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_status ON prompt_versions(decision_status);

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID REFERENCES prompts(id) ON DELETE CASCADE,
  prompt_version_id UUID REFERENCES prompt_versions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  device_id TEXT NOT NULL,
  star_rating INT NOT NULL CHECK (star_rating BETWEEN 1 AND 5),
  user_notes TEXT NOT NULL DEFAULT '',
  preference TEXT NOT NULL CHECK (preference IN ('new_better','old_better','blend_needed','both_bad')),
  old_version_id UUID REFERENCES prompt_versions(id) ON DELETE SET NULL,
  new_version_id UUID REFERENCES prompt_versions(id) ON DELETE SET NULL,
  selected_version_id UUID REFERENCES prompt_versions(id) ON DELETE SET NULL,
  anti_cheat_flags JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_prompt ON feedback(prompt_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_rating ON feedback(star_rating);
CREATE INDEX IF NOT EXISTS idx_feedback_preference ON feedback(preference);

CREATE TABLE IF NOT EXISTS test_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID REFERENCES prompts(id) ON DELETE SET NULL,
  prompt_version_id UUID REFERENCES prompt_versions(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  device_id TEXT NOT NULL,
  test_source TEXT NOT NULL,
  test_mode TEXT NOT NULL CHECK (test_mode IN ('text_to_image','image_to_image','prompt_only')),
  original_prompt TEXT NOT NULL,
  optimized_prompt TEXT NOT NULL,
  target_image_model_id TEXT NOT NULL,
  external_site_score NUMERIC(5,2),
  system_score NUMERIC(5,2),
  pass BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_test_runs_prompt ON test_runs(prompt_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_runs_score ON test_runs(system_score);

CREATE TABLE IF NOT EXISTS test_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_run_id UUID NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
  image_role TEXT NOT NULL CHECK (image_role IN ('reference','generated','thumbnail')),
  storage_url TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  width INT,
  height INT,
  mime_type TEXT NOT NULL,
  perceptual_hash TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_test_images_run ON test_images(test_run_id);
CREATE INDEX IF NOT EXISTS idx_test_images_sha ON test_images(sha256);

CREATE TABLE IF NOT EXISTS score_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_run_id UUID REFERENCES test_runs(id) ON DELETE CASCADE,
  prompt_version_id UUID REFERENCES prompt_versions(id) ON DELETE CASCADE,
  score_type TEXT NOT NULL CHECK (score_type IN ('prompt','image','combined')),
  total_score NUMERIC(5,2) NOT NULL,
  pass BOOLEAN NOT NULL,
  dimension_scores JSONB NOT NULL,
  deductions JSONB NOT NULL,
  evaluator_model_ids TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_score_reports_total ON score_reports(total_score);
CREATE INDEX IF NOT EXISTS idx_score_reports_type ON score_reports(score_type);

CREATE TABLE IF NOT EXISTS github_repos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_full_name TEXT NOT NULL UNIQUE,
  repo_url TEXT NOT NULL,
  repo_group TEXT NOT NULL,
  sync_mode TEXT NOT NULL CHECK (sync_mode IN ('read_only','own_repo_write')),
  purpose TEXT NOT NULL,
  default_branch TEXT,
  latest_commit_sha TEXT,
  latest_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS github_sync_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID NOT NULL REFERENCES github_repos(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  branch_name TEXT,
  pr_url TEXT,
  issue_url TEXT,
  file_paths TEXT[] NOT NULL DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_github_sync_events_repo ON github_sync_events(repo_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_github_sync_events_status ON github_sync_events(status);

CREATE TABLE IF NOT EXISTS prompt_history_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('main-site-local-history','test-panel','imported-jsonl')),
  device_id_hash TEXT NOT NULL,
  user_idea TEXT NOT NULL,
  optimized_prompt TEXT NOT NULL,
  target_model_id TEXT NOT NULL,
  generator_model_ids TEXT[] NOT NULL DEFAULT '{}',
  language TEXT NOT NULL DEFAULT 'zh',
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  source_event_id TEXT,
  source_created_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source, device_id_hash, source_event_id)
);

CREATE INDEX IF NOT EXISTS idx_prompt_history_records_created ON prompt_history_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompt_history_records_target ON prompt_history_records(target_model_id);

CREATE TABLE IF NOT EXISTS intent_clarification_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID REFERENCES prompts(id) ON DELETE SET NULL,
  device_id TEXT NOT NULL,
  raw_user_input TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ready','needs_clarification','suggest_correction')),
  selected_direction TEXT,
  suggested_input TEXT,
  confidence NUMERIC(5,4),
  modality TEXT NOT NULL,
  domain TEXT NOT NULL,
  task_type TEXT NOT NULL,
  conflicts JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intent_clarification_device ON intent_clarification_events(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intent_clarification_status ON intent_clarification_events(status);

CREATE TABLE IF NOT EXISTS github_project_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_full_name TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  project_group TEXT NOT NULL CHECK (project_group IN ('hallucination','prompt_optimization','gpt_image_2')),
  required_by_user BOOLEAN NOT NULL DEFAULT false,
  verification_status TEXT NOT NULL DEFAULT 'pending',
  stars INT,
  forks INT,
  open_issues INT,
  pushed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  quality_score NUMERIC(6,2) NOT NULL DEFAULT 0,
  focus TEXT NOT NULL DEFAULT '',
  extracted_rules JSONB NOT NULL DEFAULT '[]',
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(repo_full_name, project_group)
);

CREATE INDEX IF NOT EXISTS idx_github_project_watchlist_group ON github_project_watchlist(project_group, quality_score DESC);

CREATE TABLE IF NOT EXISTS optimization_rule_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL CHECK (source_type IN ('github_project','feedback_memory','manual','ab_test')),
  source_ref TEXT NOT NULL,
  rule_text TEXT NOT NULL,
  applies_to_modality TEXT NOT NULL DEFAULT 'all',
  applies_to_domain TEXT NOT NULL DEFAULT 'all',
  status TEXT NOT NULL DEFAULT 'active',
  success_count INT NOT NULL DEFAULT 0,
  failure_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_optimization_rule_versions_scope ON optimization_rule_versions(applies_to_modality, applies_to_domain, status);

CREATE TABLE IF NOT EXISTS refactor_comparison_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_name TEXT NOT NULL,
  old_version_ref TEXT NOT NULL,
  new_version_ref TEXT NOT NULL,
  hybrid_version_ref TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('old','new','hybrid','redesign')),
  metrics JSONB NOT NULL,
  accepted_parts JSONB NOT NULL DEFAULT '[]',
  rejected_parts JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refactor_comparison_module ON refactor_comparison_results(module_name, created_at DESC);
