-- ATAP Solar Wiki — Postgres schema
--
-- Three layers, kept deliberately separate:
--
--   CORPUS MIRROR  a lossless copy of research.sqlite. Every raw value the
--                  research produced is preserved verbatim. Normalisation is
--                  ADDITIVE: canonical values land in their own columns beside
--                  the raw ones, so nothing is ever overwritten or dropped.
--   DERIVED        tables computed from the corpus (provider directory,
--                  glossary, timeline). Rebuildable from scratch at any time.
--   EDITORIAL      authored article prose and its citations. The only layer
--                  that is not reproducible from research.sqlite.
--
-- research.sqlite remains the source of truth. Ingest is idempotent: running it
-- again against a refreshed corpus updates in place.

CREATE SCHEMA IF NOT EXISTS wiki;
SET search_path TO wiki, public;

-- Versioned, forward-only additive migrations are recorded by checksum. The
-- base schema remains safe for a fresh database; later model changes live in
-- wiki-server/migrations and are applied in filename order.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version      text PRIMARY KEY,
  checksum     text NOT NULL,
  applied_at   timestamptz NOT NULL DEFAULT now()
);

-- ===========================================================================
-- CORPUS MIRROR
-- ===========================================================================

CREATE TABLE IF NOT EXISTS map_nodes (
  id          text PRIMARY KEY,
  title       text NOT NULL,
  description text NOT NULL DEFAULT '',
  sort_order  integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS packets (
  id                text PRIMARY KEY,
  map_node_id       text NOT NULL REFERENCES map_nodes(id),
  title             text NOT NULL,
  original_prompt   text NOT NULL,
  status            text NOT NULL,
  pass_1_researcher text,
  pass_2_researcher text,
  agy_model         text,
  created_at        timestamptz,
  updated_at        timestamptz,
  handed_off_at     timestamptz
);

-- Run metadata only. The `manifest_json` blobs (7.5 MB) are not copied: every
-- fact, source, gap and conflict inside them is already mirrored below, and the
-- provider rosters are exploded into `providers`. Ingest reads the manifests
-- straight from SQLite when it needs them.
CREATE TABLE IF NOT EXISTS runs (
  id                text PRIMARY KEY,
  packet_id         text NOT NULL REFERENCES packets(id),
  pass_number       integer NOT NULL,
  version           integer NOT NULL,
  researcher        text,
  researcher_detail text,
  status            text,
  started_at        timestamptz,
  completed_at      timestamptz,
  error             text,
  created_at        timestamptz
);
CREATE INDEX IF NOT EXISTS runs_packet_idx ON runs (packet_id, pass_number, version DESC);

-- Publisher names arrive unnormalised: the Energy Commission appears as
-- "Suruhanjaya Tenaga", "Suruhanjaya Tenaga / Energy Commission",
-- "Suruhanjaya Tenaga (Energy Commission)", "Energy Commission (Suruhanjaya
-- Tenaga)" and more. These two tables collapse that for display and faceting
-- without touching `sources.publisher_raw`.
CREATE TABLE IF NOT EXISTS publishers (
  id             serial PRIMARY KEY,
  canonical_name text NOT NULL UNIQUE,
  short_name     text,
  -- authority | utility | programme_operator | standards | manufacturer
  -- | provider | research | media | other
  kind           text NOT NULL DEFAULT 'other',
  homepage       text
);

CREATE TABLE IF NOT EXISTS publisher_aliases (
  raw_name     text PRIMARY KEY,
  publisher_id integer NOT NULL REFERENCES publishers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sources (
  id              text PRIMARY KEY,
  canonical_url   text NOT NULL,
  title           text NOT NULL DEFAULT '',
  publisher_raw   text NOT NULL DEFAULT '',
  publisher_id    integer REFERENCES publishers(id),
  source_type_raw text NOT NULL DEFAULT '',
  source_type     text,                       -- canonical bucket
  published_at    text,                       -- kept as text: corpus mixes formats
  effective_from  text,
  effective_to    text,
  accessed_at     timestamptz,
  local_file      text,                       -- path under research-data/source-library
  sha256          text,
  content_type    text,
  -- 221 of 647 sources failed capture. Source pages must say so rather than
  -- imply an archived copy exists.
  capture_error   text,
  is_captured     boolean GENERATED ALWAYS AS (local_file IS NOT NULL AND capture_error IS NULL) STORED
);
CREATE INDEX IF NOT EXISTS sources_publisher_idx ON sources (publisher_id);
CREATE INDEX IF NOT EXISTS sources_url_idx ON sources (canonical_url);
CREATE INDEX IF NOT EXISTS sources_captured_idx ON sources (is_captured);

CREATE TABLE IF NOT EXISTS entities (
  id                   text PRIMARY KEY,
  entity_key           text NOT NULL,          -- raw, exactly as researched
  entity_type          text,                   -- NULL throughout the corpus; derived on ingest
  display_name         text,                   -- NULL throughout the corpus; derived on ingest
  -- Additive dedup. `trinasolar_vertex_s_plus_tsm_neg9r28` and
  -- `trinasolar.vertex_s_plus.tsm_neg9r_28` are one product; `solar_atap`,
  -- `Solar_ATAP` and `solar_atap_programme` are one topic. The raw key above
  -- is never rewritten.
  canonical_entity_key text,
  topic_slug           text,
  created_at           timestamptz,
  updated_at           timestamptz
);
CREATE INDEX IF NOT EXISTS entities_key_idx ON entities (entity_key);
CREATE INDEX IF NOT EXISTS entities_canonical_idx ON entities (canonical_entity_key);
CREATE INDEX IF NOT EXISTS entities_type_idx ON entities (entity_type);

CREATE TABLE IF NOT EXISTS facts (
  id                   text PRIMARY KEY,
  run_id               text,
  packet_id            text NOT NULL REFERENCES packets(id),
  domain               text NOT NULL,          -- 'ATAP' from 'ATAP-004'
  pass_number          integer,
  entity_id            text REFERENCES entities(id),
  field_key            text NOT NULL,
  value_json           jsonb,                  -- queryable value, any JSON shape
  -- The value exactly as SQLite stores it. jsonb reorders object keys, and that
  -- order sometimes carries meaning the research intended -- a capacity-tier
  -- table reads top-to-bottom in ascending order, for instance. Rendering uses
  -- this; querying uses value_json; verification compares this byte for byte.
  value_raw            text,
  value_text           text,                   -- flattened for display and search
  unit                 text,
  jurisdiction_raw     text,
  -- Derived from jurisdiction_raw, which has 100+ spellings of a handful of
  -- real distinctions.
  region               text,                   -- peninsular | sabah | sarawak | malaysia | global | manufacturer | unknown
  customer_class       text,                   -- domestic | non_domestic | commercial | industrial | mixed | NULL
  effective_from       text,
  effective_to         text,
  derivation_json      jsonb,
  verification_status  text,                   -- pass_1_sourced | pass_2_sourced
  created_at           timestamptz
);
CREATE INDEX IF NOT EXISTS facts_packet_idx ON facts (packet_id);
CREATE INDEX IF NOT EXISTS facts_domain_idx ON facts (domain);
CREATE INDEX IF NOT EXISTS facts_entity_idx ON facts (entity_id);
CREATE INDEX IF NOT EXISTS facts_field_idx ON facts (field_key);
CREATE INDEX IF NOT EXISTS facts_region_idx ON facts (region);
CREATE INDEX IF NOT EXISTS facts_class_idx ON facts (customer_class);
-- Applied separately so an existing database picks the column up: the CREATE
-- TABLE above is IF NOT EXISTS and would skip it entirely.
ALTER TABLE facts ADD COLUMN IF NOT EXISTS value_raw text;

-- SQLite has no key here and the corpus contains repeated (fact, source, locator)
-- rows, so a surrogate key is required to mirror it losslessly.
CREATE TABLE IF NOT EXISTS fact_sources (
  id                 bigserial PRIMARY KEY,
  fact_id            text NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
  source_id          text NOT NULL REFERENCES sources(id),
  locator            text NOT NULL,
  supporting_extract text NOT NULL
);
CREATE INDEX IF NOT EXISTS fact_sources_fact_idx ON fact_sources (fact_id);
CREATE INDEX IF NOT EXISTS fact_sources_source_idx ON fact_sources (source_id);

CREATE TABLE IF NOT EXISTS media (
  id                     text PRIMARY KEY,
  run_id                 text,
  source_id              text REFERENCES sources(id),
  packet_id              text REFERENCES packets(id),
  source_page_url        text,
  asset_url              text,
  local_file             text,                 -- path under research-data/media-library
  mime_type              text,
  bytes                  bigint,
  sha256                 text,                 -- 9,361 rows collapse to 2,883 files
  caption                text,
  associated_entity_keys jsonb,
  rights_status          text,
  publication_permission text,
  accessed_at            timestamptz,
  capture_error          text
);
CREATE INDEX IF NOT EXISTS media_sha_idx ON media (sha256);
CREATE INDEX IF NOT EXISTS media_source_idx ON media (source_id);
CREATE INDEX IF NOT EXISTS media_packet_idx ON media (packet_id);

-- Some gap descriptions are JSON strings carrying {description, status,
-- required_input} or {gap_key, description}. Ingest parses those into the
-- columns below and always keeps `description_raw` intact.
CREATE TABLE IF NOT EXISTS gaps (
  id              text PRIMARY KEY,
  run_id          text,
  packet_id       text NOT NULL REFERENCES packets(id),
  domain          text NOT NULL,
  description_raw text NOT NULL,
  description     text NOT NULL,
  gap_key         text,
  status          text,
  required_input  text,
  created_at      timestamptz
);
CREATE INDEX IF NOT EXISTS gaps_packet_idx ON gaps (packet_id);

CREATE TABLE IF NOT EXISTS conflicts (
  id          text PRIMARY KEY,
  run_id      text,
  packet_id   text NOT NULL REFERENCES packets(id),
  domain      text NOT NULL,
  field_key   text,
  description text NOT NULL,
  source_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  status      text,
  created_at  timestamptz
);
CREATE INDEX IF NOT EXISTS conflicts_packet_idx ON conflicts (packet_id);

CREATE TABLE IF NOT EXISTS run_sources (
  run_id    text NOT NULL,
  source_id text NOT NULL REFERENCES sources(id),
  PRIMARY KEY (run_id, source_id)
);

-- ===========================================================================
-- DERIVED
-- ===========================================================================

-- The SEDA registered-provider rosters, exploded out of the array-valued facts
-- in PROV-001/003/006. Full records are published including contact fields, per
-- an explicit project decision.
CREATE TABLE IF NOT EXISTS providers (
  id                   serial PRIMARY KEY,
  dataset              text NOT NULL,          -- service_provider | investor
  seda_uuid            text NOT NULL,
  company_name         text NOT NULL,
  category_of_company  text,
  contact_person       text,
  contact_position     text,
  contact_number       text,
  contact_email        text,
  website              text,
  logo_url             text,
  nature_of_business   jsonb NOT NULL DEFAULT '[]'::jsonb,
  service_scope        jsonb NOT NULL DEFAULT '[]'::jsonb,
  state                text,
  city                 text,
  postcode             text,
  street_address       text,
  registered_address   jsonb,
  office_address       jsonb,
  -- The untouched roster record. Any field the explode did not map is still here.
  record               jsonb NOT NULL,
  source_fact_id       text REFERENCES facts(id),
  source_id            text REFERENCES sources(id),
  UNIQUE (dataset, seda_uuid)
);
CREATE INDEX IF NOT EXISTS providers_state_idx ON providers (state);
CREATE INDEX IF NOT EXISTS providers_name_idx ON providers (company_name);
CREATE INDEX IF NOT EXISTS providers_dataset_idx ON providers (dataset);

-- The 90 `definition` facts, chiefly from GOV-002.
CREATE TABLE IF NOT EXISTS glossary (
  id         serial PRIMARY KEY,
  slug       text NOT NULL UNIQUE,
  term       text NOT NULL,
  definition text NOT NULL,
  fact_id    text REFERENCES facts(id),
  packet_id  text REFERENCES packets(id)
);

-- Programme chronology, chiefly from GOV-004.
CREATE TABLE IF NOT EXISTS timeline (
  id          serial PRIMARY KEY,
  occurred_on date NOT NULL,
  precision   text NOT NULL DEFAULT 'day',     -- day | month | year
  title       text NOT NULL,
  description text,
  fact_id     text REFERENCES facts(id),
  packet_id   text REFERENCES packets(id)
);
CREATE INDEX IF NOT EXISTS timeline_date_idx ON timeline (occurred_on);

-- ===========================================================================
-- EDITORIAL
-- ===========================================================================

CREATE TABLE IF NOT EXISTS articles (
  id            serial PRIMARY KEY,
  slug          text NOT NULL,
  lang          text NOT NULL DEFAULT 'en',    -- present from day one so a BM edition is additive
  section       text NOT NULL,
  title         text NOT NULL,
  summary       text,
  body_mdx      text NOT NULL,
  source_file   text,                          -- path under content/wiki
  packet_ids    text[] NOT NULL DEFAULT '{}',  -- drives the gaps/conflicts panel
  jurisdiction  text,
  -- Nothing renders publicly until it has been reviewed.
  status        text NOT NULL DEFAULT 'draft', -- draft | in_review | published
  last_verified date,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slug, lang)
);
CREATE INDEX IF NOT EXISTS articles_section_idx ON articles (section, sort_order);
CREATE INDEX IF NOT EXISTS articles_status_idx ON articles (status);

-- Resolved at ingest so a citation that stops resolving fails loudly instead of
-- rendering a dead reference.
CREATE TABLE IF NOT EXISTS article_citations (
  id         serial PRIMARY KEY,
  article_id integer NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  ordinal    integer NOT NULL,
  kind       text NOT NULL,                    -- fact | source
  fact_id    text REFERENCES facts(id),
  source_id  text REFERENCES sources(id),
  raw_ref    text NOT NULL,
  UNIQUE (article_id, ordinal)
);
CREATE INDEX IF NOT EXISTS article_citations_fact_idx ON article_citations (fact_id);

CREATE TABLE IF NOT EXISTS redirects (
  from_slug text PRIMARY KEY,
  to_slug   text NOT NULL
);

-- ===========================================================================
-- SEARCH
-- ===========================================================================

CREATE TABLE IF NOT EXISTS search_index (
  id       bigserial PRIMARY KEY,
  kind     text NOT NULL,                      -- article | fact | source | provider | glossary
  ref_id   text NOT NULL,
  slug     text,
  title    text NOT NULL,
  body     text NOT NULL DEFAULT '',
  section  text,
  tsv      tsvector,
  UNIQUE (kind, ref_id)
);
CREATE INDEX IF NOT EXISTS search_tsv_idx ON search_index USING GIN (tsv);
CREATE INDEX IF NOT EXISTS search_kind_idx ON search_index (kind);

-- ===========================================================================
-- INGEST BOOKKEEPING
-- ===========================================================================

-- Every ingest records the counts it saw in SQLite against the counts it wrote.
-- `wiki:verify` reads the newest row; any drift is a hard failure.
CREATE TABLE IF NOT EXISTS ingest_runs (
  id             serial PRIMARY KEY,
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  sqlite_path    text NOT NULL,
  sqlite_bytes   bigint,
  status         text NOT NULL DEFAULT 'running',  -- running | complete | failed
  source_counts  jsonb NOT NULL DEFAULT '{}'::jsonb,
  written_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  mismatches     jsonb NOT NULL DEFAULT '[]'::jsonb,
  error          text
);

-- ---- from 0002-canonical-knowledge.sql (structure only; its seed rows ship in data/wiki-snapshot.jsonl.gz) ----
-- M3-CLAIM-MODEL: additive canonical knowledge layer.
--
-- Forward-only rollback policy: application code may stop reading these tables,
-- but this migration never drops or rewrites raw corpus data. Corrections are
-- made by a later migration so database history and migration checksums remain
-- auditable.

SET search_path TO wiki, public;
CREATE TABLE canonical_jurisdictions (
  code                   text PRIMARY KEY,
  label                  text NOT NULL,
  jurisdiction_type      text NOT NULL CHECK (jurisdiction_type IN ('country','region','service_area','global','manufacturer','general','unknown')),
  parent_code            text REFERENCES canonical_jurisdictions(code),
  publication_scope      boolean NOT NULL DEFAULT true,
  UNIQUE (label, jurisdiction_type)
);
CREATE TABLE canonical_customer_classes (
  code              text PRIMARY KEY,
  label             text NOT NULL UNIQUE,
  publication_scope boolean NOT NULL DEFAULT true
);
CREATE TABLE canonical_programmes (
  code           text PRIMARY KEY,
  label          text NOT NULL UNIQUE,
  jurisdiction_code text NOT NULL REFERENCES canonical_jurisdictions(code),
  programme_state text NOT NULL CHECK (programme_state IN ('current','historical','superseded','non_programme')),
  effective_from date,
  effective_to   date,
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);
CREATE TABLE canonical_entities (
  id              text PRIMARY KEY CHECK (id ~ '^CENT-[A-F0-9]{24}$'),
  canonical_key   text NOT NULL UNIQUE,
  display_name    text NOT NULL,
  entity_type     text NOT NULL,
  review_status   text NOT NULL DEFAULT 'proposed' CHECK (review_status IN ('proposed','in_review','reviewed','rejected')),
  reviewed_by     text,
  reviewed_at     timestamptz,
  decision_note   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (review_status <> 'reviewed' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE TABLE canonical_entity_memberships (
  canonical_entity_id text NOT NULL REFERENCES canonical_entities(id) ON DELETE RESTRICT,
  raw_entity_id       text NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
  relationship        text NOT NULL CHECK (relationship IN ('exact_alias','probable_alias','scope_member')),
  review_status       text NOT NULL DEFAULT 'proposed' CHECK (review_status IN ('proposed','reviewed','rejected')),
  evidence_note       text,
  reviewed_by         text,
  reviewed_at         timestamptz,
  PRIMARY KEY (canonical_entity_id, raw_entity_id, relationship),
  CHECK (review_status <> 'reviewed' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE UNIQUE INDEX canonical_entity_reviewed_raw_idx
  ON canonical_entity_memberships(raw_entity_id)
  WHERE review_status='reviewed' AND relationship IN ('exact_alias','probable_alias');
CREATE TABLE canonical_attributes (
  id             text PRIMARY KEY CHECK (id ~ '^ATTR-[A-F0-9]{24}$'),
  attribute_key  text NOT NULL UNIQUE,
  label          text NOT NULL,
  value_kind     text NOT NULL CHECK (value_kind IN ('text','number','boolean','array','object','date','duration','money','rate')),
  default_unit   text,
  description    text,
  review_status  text NOT NULL DEFAULT 'proposed' CHECK (review_status IN ('proposed','in_review','reviewed','rejected')),
  reviewed_by    text,
  reviewed_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (review_status <> 'reviewed' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
-- A canonical claim is the reusable entity/attribute proposition. Its scoped,
-- dated values live in claim_variants; citations always resolve to a variant.
CREATE TABLE canonical_claims (
  id                  text PRIMARY KEY CHECK (id ~ '^CLM-[A-F0-9]{24}$'),
  slug                text NOT NULL UNIQUE,
  topic_slug          text NOT NULL,
  canonical_entity_id text NOT NULL REFERENCES canonical_entities(id) ON DELETE RESTRICT,
  attribute_id        text NOT NULL REFERENCES canonical_attributes(id) ON DELETE RESTRICT,
  review_status       text NOT NULL DEFAULT 'proposed' CHECK (review_status IN ('proposed','in_review','reviewed','rejected')),
  reviewed_by         text,
  reviewed_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (canonical_entity_id, attribute_id, topic_slug),
  CHECK (review_status <> 'reviewed' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE TABLE claim_variants (
  id                    text PRIMARY KEY CHECK (id ~ '^CLMV-[A-F0-9]{24}$'),
  claim_id              text NOT NULL REFERENCES canonical_claims(id) ON DELETE RESTRICT,
  statement             text NOT NULL CHECK (length(btrim(statement)) > 0),
  value_json            jsonb,
  unit                  text,
  jurisdiction_code     text NOT NULL REFERENCES canonical_jurisdictions(code),
  customer_class_code   text NOT NULL REFERENCES canonical_customer_classes(code),
  programme_code        text REFERENCES canonical_programmes(code),
  effective_from        date,
  effective_to          date,
  time_state            text NOT NULL CHECK (time_state IN ('current','future','historical','superseded','undated')),
  claim_state           text NOT NULL CHECK (claim_state IN ('current_verified','current_single_source','derived','historical','superseded','scope_variant','conflicting','incomplete','unpublishable')),
  review_status         text NOT NULL DEFAULT 'proposed' CHECK (review_status IN ('proposed','in_review','reviewed','rejected')),
  publication_status    text NOT NULL DEFAULT 'blocked' CHECK (publication_status IN ('blocked','eligible')),
  editorial_reasoning   text,
  reviewed_by           text,
  reviewed_at           timestamptz,
  supersedes_variant_id text REFERENCES claim_variants(id) ON DELETE RESTRICT,
  version               integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (claim_id, jurisdiction_code, customer_class_code, programme_code, effective_from, version),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from),
  CHECK (review_status <> 'reviewed' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  CHECK (publication_status <> 'eligible' OR review_status='reviewed'),
  CHECK (publication_status <> 'eligible' OR claim_state <> 'unpublishable'),
  CHECK (time_state <> 'superseded' OR claim_state IN ('superseded','historical'))
);
CREATE INDEX claim_variants_scope_idx ON claim_variants(jurisdiction_code,customer_class_code,programme_code,time_state);
CREATE INDEX claim_variants_publication_idx ON claim_variants(publication_status,review_status);
CREATE TABLE claim_variant_facts (
  variant_id       text NOT NULL REFERENCES claim_variants(id) ON DELETE CASCADE,
  fact_id          text NOT NULL REFERENCES facts(id) ON DELETE RESTRICT,
  relationship     text NOT NULL CHECK (relationship IN ('supporting','disagreeing','context','derived_input')),
  is_primary       boolean NOT NULL DEFAULT false,
  review_status    text NOT NULL DEFAULT 'proposed' CHECK (review_status IN ('proposed','reviewed','rejected')),
  mapping_reason   text,
  mapped_by        text,
  mapped_at        timestamptz,
  PRIMARY KEY (variant_id,fact_id,relationship),
  CHECK (review_status <> 'reviewed' OR (mapped_by IS NOT NULL AND mapped_at IS NOT NULL))
);
CREATE INDEX claim_variant_facts_fact_idx ON claim_variant_facts(fact_id);
CREATE TABLE issue_clusters (
  id                    text PRIMARY KEY CHECK (id ~ '^ISS-[A-F0-9]{24}$'),
  slug                  text NOT NULL UNIQUE,
  title                 text NOT NULL,
  reader_question       text,
  proposed_type         text NOT NULL CHECK (proposed_type IN ('unresolved_conflict','resolved_by_authority','superseded_policy','scope_difference','terminology_difference','data_not_public','requires_periodic_update','research_incomplete','duplicate_record','mixed')),
  reviewed_type         text CHECK (reviewed_type IN ('unresolved_conflict','resolved_by_authority','superseded_policy','scope_difference','terminology_difference','data_not_public','requires_periodic_update','research_incomplete','duplicate_record','mixed')),
  resolution_status     text NOT NULL DEFAULT 'proposed' CHECK (resolution_status IN ('proposed','unresolved','resolved','superseded','scope_specific','stale','duplicate')),
  editorial_conclusion  text,
  practical_impact      text,
  jurisdiction_code     text REFERENCES canonical_jurisdictions(code),
  customer_class_code   text REFERENCES canonical_customer_classes(code),
  programme_code        text REFERENCES canonical_programmes(code),
  proposal_source       text,
  review_status         text NOT NULL DEFAULT 'proposed' CHECK (review_status IN ('proposed','in_review','reviewed','rejected')),
  reviewed_by           text,
  reviewed_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (review_status <> 'reviewed' OR (reviewed_type IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE TABLE issue_gap_memberships (
  issue_cluster_id text NOT NULL REFERENCES issue_clusters(id) ON DELETE CASCADE,
  gap_id           text NOT NULL REFERENCES gaps(id) ON DELETE RESTRICT,
  proposed_type    text,
  rationale        text,
  review_status    text NOT NULL DEFAULT 'proposed' CHECK (review_status IN ('proposed','reviewed','rejected')),
  PRIMARY KEY (issue_cluster_id,gap_id)
);
CREATE INDEX issue_gap_memberships_gap_idx ON issue_gap_memberships(gap_id);
CREATE TABLE issue_conflict_memberships (
  issue_cluster_id text NOT NULL REFERENCES issue_clusters(id) ON DELETE CASCADE,
  conflict_id      text NOT NULL REFERENCES conflicts(id) ON DELETE RESTRICT,
  proposed_type    text,
  rationale        text,
  review_status    text NOT NULL DEFAULT 'proposed' CHECK (review_status IN ('proposed','reviewed','rejected')),
  PRIMARY KEY (issue_cluster_id,conflict_id)
);
CREATE INDEX issue_conflict_memberships_conflict_idx ON issue_conflict_memberships(conflict_id);
CREATE TABLE claim_variant_issues (
  variant_id       text NOT NULL REFERENCES claim_variants(id) ON DELETE CASCADE,
  issue_cluster_id text NOT NULL REFERENCES issue_clusters(id) ON DELETE RESTRICT,
  relationship     text NOT NULL CHECK (relationship IN ('blocks','qualifies','disagrees','incomplete_research','resolved_context')),
  review_status    text NOT NULL DEFAULT 'proposed' CHECK (review_status IN ('proposed','reviewed','rejected')),
  PRIMARY KEY (variant_id,issue_cluster_id,relationship)
);
CREATE TABLE canonical_decisions (
  id                     text PRIMARY KEY CHECK (id ~ '^DEC-[A-F0-9]{24}$'),
  subject_type           text NOT NULL CHECK (subject_type IN ('entity','attribute','claim','claim_variant','issue_cluster','migration','publication_contract')),
  subject_id             text NOT NULL,
  decision               text NOT NULL,
  evidence_considered    jsonb NOT NULL DEFAULT '[]'::jsonb,
  alternatives_rejected  jsonb NOT NULL DEFAULT '[]'::jsonb,
  risks                  jsonb NOT NULL DEFAULT '[]'::jsonb,
  rollback_implications  text NOT NULL,
  validation_performed   jsonb NOT NULL DEFAULT '[]'::jsonb,
  decided_by             text NOT NULL,
  decided_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX canonical_decisions_subject_idx ON canonical_decisions(subject_type,subject_id,decided_at DESC);
-- Deferred publication constraint: lineage may be inserted after the variant
-- in the same transaction, but an eligible variant cannot commit without a
-- reviewed, sourced fact mapping, explicit publishable scope, and (for
-- conflicting/incomplete states) a reviewed issue disclosure.
CREATE OR REPLACE FUNCTION assert_claim_variant_publication_contract()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_id text;
  variant claim_variants%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME = 'claim_variants' THEN
    target_id := COALESCE(NEW.id, OLD.id);
  ELSIF TG_TABLE_NAME = 'claim_variant_facts' THEN
    target_id := COALESCE(NEW.variant_id, OLD.variant_id);
  ELSE
    target_id := COALESCE(NEW.variant_id, OLD.variant_id);
  END IF;

  SELECT * INTO variant FROM claim_variants WHERE id=target_id;
  IF NOT FOUND OR variant.publication_status <> 'eligible' THEN RETURN NULL; END IF;

  IF variant.jurisdiction_code='unknown' OR variant.customer_class_code='unspecified' THEN
    RAISE EXCEPTION 'Eligible claim variant % requires explicit jurisdiction and customer class', target_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM claim_variant_facts cvf
      JOIN fact_sources fs ON fs.fact_id=cvf.fact_id
     WHERE cvf.variant_id=target_id
       AND cvf.review_status='reviewed'
       AND cvf.relationship IN ('supporting','derived_input')
       AND length(btrim(fs.locator)) > 0
       AND length(btrim(fs.supporting_extract)) > 0
  ) THEN
    RAISE EXCEPTION 'Eligible claim variant % has no reviewed fact with publishable source evidence', target_id;
  END IF;

  IF variant.claim_state IN ('conflicting','incomplete') AND NOT EXISTS (
    SELECT 1 FROM claim_variant_issues cvi
     WHERE cvi.variant_id=target_id AND cvi.review_status='reviewed'
  ) THEN
    RAISE EXCEPTION 'Eligible % claim variant % requires a reviewed issue disclosure', variant.claim_state, target_id;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER claim_variant_publication_guard
AFTER INSERT OR UPDATE ON claim_variants
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION assert_claim_variant_publication_contract();
CREATE CONSTRAINT TRIGGER claim_variant_fact_publication_guard
AFTER INSERT OR UPDATE OR DELETE ON claim_variant_facts
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION assert_claim_variant_publication_contract();
CREATE CONSTRAINT TRIGGER claim_variant_issue_publication_guard
AFTER INSERT OR UPDATE OR DELETE ON claim_variant_issues
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION assert_claim_variant_publication_contract();
-- ---- from 0003-evidence-publication-contract.sql (structure only; its seed rows ship in data/wiki-snapshot.jsonl.gz) ----
-- M4-EVIDENCE-CONTRACT: page-to-claim citations, evidence disclosure and
-- fail-closed publication checks. Additive; legacy article_citations remains
-- readable but cannot satisfy the v1 publication contract.

SET search_path TO wiki, public;
ALTER TABLE articles ADD COLUMN jurisdiction_code text REFERENCES canonical_jurisdictions(code);
ALTER TABLE articles ADD COLUMN customer_class_code text REFERENCES canonical_customer_classes(code);
ALTER TABLE articles ADD COLUMN programme_code text REFERENCES canonical_programmes(code);
ALTER TABLE articles ADD COLUMN effective_from date;
ALTER TABLE articles ADD COLUMN effective_to date;
ALTER TABLE articles ADD COLUMN effective_period_note text;
ALTER TABLE articles ADD COLUMN reviewed_by text;
ALTER TABLE articles ADD COLUMN reviewed_at timestamptz;
ALTER TABLE articles ADD CONSTRAINT articles_effective_period_order
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from);
CREATE TABLE article_claim_citations (
  id                       text PRIMARY KEY CHECK (id ~ '^CITE-[A-F0-9]{24}$'),
  article_id               integer NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  variant_id               text NOT NULL REFERENCES claim_variants(id) ON DELETE RESTRICT,
  citation_key             text NOT NULL,
  section_key              text NOT NULL,
  ordinal                  integer NOT NULL CHECK (ordinal > 0),
  render_context           text NOT NULL DEFAULT 'as_scoped' CHECK (render_context IN ('as_scoped','current','historical','superseded','derived')),
  scope_override_reason    text,
  temporal_override_reason text,
  override_reviewed_by     text,
  override_reviewed_at     timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (article_id,citation_key),
  UNIQUE (article_id,ordinal),
  CHECK (
    (scope_override_reason IS NULL AND temporal_override_reason IS NULL)
    OR (override_reviewed_by IS NOT NULL AND override_reviewed_at IS NOT NULL)
  )
);
CREATE INDEX article_claim_citations_variant_idx ON article_claim_citations(variant_id);
CREATE TABLE article_issue_disclosures (
  article_id       integer NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  issue_cluster_id text NOT NULL REFERENCES issue_clusters(id) ON DELETE RESTRICT,
  section_key      text NOT NULL,
  disclosure_text text NOT NULL CHECK (length(btrim(disclosure_text)) > 0),
  reviewed_by     text NOT NULL,
  reviewed_at     timestamptz NOT NULL,
  PRIMARY KEY (article_id,issue_cluster_id,section_key)
);
CREATE OR REPLACE FUNCTION article_publication_failures(target_article_id integer)
RETURNS TABLE(code text, detail text) LANGUAGE sql STABLE AS $$
  SELECT 'article_not_found', 'Article does not exist'
   WHERE NOT EXISTS (SELECT 1 FROM articles WHERE id=target_article_id)

  UNION ALL
  SELECT 'missing_review', 'Published article requires reviewed_by and reviewed_at'
    FROM articles a
   WHERE a.id=target_article_id AND (a.reviewed_by IS NULL OR a.reviewed_at IS NULL)

  UNION ALL
  SELECT 'missing_last_verified', 'Published article requires last_verified'
    FROM articles a
   WHERE a.id=target_article_id AND a.last_verified IS NULL

  UNION ALL
  SELECT 'missing_scope', 'Published article requires explicit publishable jurisdiction and customer class'
    FROM articles a
    LEFT JOIN canonical_jurisdictions j ON j.code=a.jurisdiction_code
    LEFT JOIN canonical_customer_classes cc ON cc.code=a.customer_class_code
   WHERE a.id=target_article_id
     AND (j.code IS NULL OR NOT j.publication_scope OR cc.code IS NULL OR NOT cc.publication_scope)

  UNION ALL
  SELECT 'missing_effective_period', 'Published article requires an effective date or explicit effective-period note'
    FROM articles a
   WHERE a.id=target_article_id
     AND a.effective_from IS NULL
     AND length(btrim(COALESCE(a.effective_period_note,'')))=0

  UNION ALL
  SELECT 'missing_claim_citations', 'Published article requires at least one canonical claim citation'
   WHERE NOT EXISTS (SELECT 1 FROM article_claim_citations c WHERE c.article_id=target_article_id)

  UNION ALL
  SELECT 'legacy_raw_citation', 'Raw fact/source citations cannot satisfy the canonical publication contract'
   WHERE EXISTS (SELECT 1 FROM article_citations c WHERE c.article_id=target_article_id)

  UNION ALL
  SELECT 'citation_not_eligible', 'Citation ' || c.citation_key || ' points to blocked or unreviewed variant ' || v.id
    FROM article_claim_citations c
    JOIN claim_variants v ON v.id=c.variant_id
   WHERE c.article_id=target_article_id
     AND (v.publication_status <> 'eligible' OR v.review_status <> 'reviewed')

  UNION ALL
  SELECT 'scope_mismatch', 'Citation ' || c.citation_key || ' scope ' || v.jurisdiction_code || '/' || v.customer_class_code ||
         ' differs from article scope without a reviewed override'
    FROM article_claim_citations c
    JOIN articles a ON a.id=c.article_id
    JOIN claim_variants v ON v.id=c.variant_id
   WHERE c.article_id=target_article_id
     AND (v.jurisdiction_code <> a.jurisdiction_code
          OR v.customer_class_code NOT IN (a.customer_class_code,'all','not-applicable'))
     AND length(btrim(COALESCE(c.scope_override_reason,'')))=0

  UNION ALL
  SELECT 'historical_rendered_current', 'Citation ' || c.citation_key || ' renders ' || v.time_state || ' evidence as current without a reviewed override'
    FROM article_claim_citations c
    JOIN claim_variants v ON v.id=c.variant_id
   WHERE c.article_id=target_article_id
     AND c.render_context='current'
     AND v.time_state IN ('historical','superseded')
     AND length(btrim(COALESCE(c.temporal_override_reason,'')))=0

  UNION ALL
  SELECT 'missing_issue_disclosure', 'Citation ' || c.citation_key || ' requires a page-level issue disclosure'
    FROM article_claim_citations c
    JOIN claim_variants v ON v.id=c.variant_id
   WHERE c.article_id=target_article_id
     AND v.claim_state IN ('conflicting','incomplete')
     AND NOT EXISTS (
       SELECT 1
         FROM claim_variant_issues cvi
         JOIN article_issue_disclosures aid
           ON aid.issue_cluster_id=cvi.issue_cluster_id AND aid.article_id=c.article_id
        WHERE cvi.variant_id=v.id AND cvi.review_status='reviewed'
     );
$$;
CREATE OR REPLACE FUNCTION assert_article_publication_contract()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_id integer;
  target_status text;
  failures text;
BEGIN
  IF TG_TABLE_NAME='articles' THEN
    target_id := COALESCE(NEW.id,OLD.id);
  ELSE
    target_id := COALESCE(NEW.article_id,OLD.article_id);
  END IF;
  SELECT status INTO target_status FROM articles WHERE id=target_id;
  IF NOT FOUND OR target_status <> 'published' THEN RETURN NULL; END IF;

  SELECT string_agg(code || ': ' || detail, E'\n') INTO failures
    FROM article_publication_failures(target_id);
  IF failures IS NOT NULL THEN
    RAISE EXCEPTION 'Article % fails publication contract:%', target_id, E'\n' || failures;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER article_publication_guard
AFTER INSERT OR UPDATE ON articles
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION assert_article_publication_contract();
CREATE CONSTRAINT TRIGGER article_citation_publication_guard
AFTER INSERT OR UPDATE OR DELETE ON article_claim_citations
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION assert_article_publication_contract();
CREATE CONSTRAINT TRIGGER article_issue_publication_guard
AFTER INSERT OR UPDATE OR DELETE ON article_issue_disclosures
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION assert_article_publication_contract();
-- ---- from 0004-material-conflict-decisions.sql (structure only; its seed rows ship in data/wiki-snapshot.jsonl.gz) ----
-- M10-CONFLICT-DECISIONS: reviewed material conflict adjudications.
--
-- This migration is additive and forward-only. It records review outcomes but
-- never updates or deletes the raw research facts, gaps, conflicts or sources.
-- A later decision may supersede one of these records without rewriting this
-- migration or erasing the evidence that informed it.

SET search_path TO wiki, public;
-- Multivalue triage found one material contradiction that was not represented
-- in the raw conflicts table. Keep its two raw facts directly reachable.
CREATE TABLE issue_fact_memberships (
  issue_cluster_id text NOT NULL REFERENCES issue_clusters(id) ON DELETE CASCADE,
  fact_id          text NOT NULL REFERENCES facts(id) ON DELETE RESTRICT,
  relationship    text NOT NULL CHECK (relationship IN ('supporting','disagreeing','context')),
  rationale       text NOT NULL,
  review_status   text NOT NULL DEFAULT 'proposed' CHECK (review_status IN ('proposed','reviewed','rejected')),
  reviewed_by     text,
  reviewed_at     timestamptz,
  PRIMARY KEY (issue_cluster_id,fact_id,relationship),
  CHECK (review_status <> 'reviewed' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE INDEX issue_fact_memberships_fact_idx ON issue_fact_memberships(fact_id);