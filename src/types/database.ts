// =============================================================
// Proofly · Supabase 数据库类型（手工按 supabase/*.sql 的 DDL 写出）
// 供 createClient<Database> 使用。CHECK 约束的枚举列用字面量联合类型表达，
// 比裸 string 更能在编译期挡住非法取值。
// Step 2 装好 Supabase CLI 后可用 `supabase gen types typescript` 重新生成。
// =============================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ---- 枚举（text + CHECK）----
export type ProfileFactStatus = "RESOLVED" | "PENDING" | "BLOCKING";
export type AtomLevel = "project" | "capability_slice";
export type AtomContext = "employment" | "side_project" | "volunteer" | "community";
export type AtomStatus = "concept" | "design_done" | "in_dev" | "shipped" | "sunset";
export type EvidenceLevel = "measured" | "estimated" | "designed_only" | "absent";
export type MetricKind = "outcome" | "output";
export type SkillDepth = "familiar" | "proficient" | "expert";
export type EvidenceStrength = "strong" | "weak" | "none";
export type IngestInputType = "upload" | "chat";
export type IngestStatus = "extracting" | "awaiting_review" | "committed" | "discarded";
export type IngestStage = "segmenting" | "extracting" | "finishing";
export type DraftIntent = "CREATE" | "UPDATE" | "ASK";
export type DraftReviewStatus = "pending" | "accepted" | "edited" | "rejected";
export type ChatRole = "user" | "assistant" | "system";
export type ChatKind = "text" | "image" | "confirm_card" | "query_answer" | "clarify";
export type NudgeRule = "R1" | "R2" | "R3";
export type LlmTier = "light" | "strong" | "vision" | "embedding";
export type RenderWeight = "expand" | "brief" | "one_line" | "omit";
export type RequirementKind = "hard" | "implicit" | "nice_to_have";
export type GapType = "no_capability" | "no_evidence" | "weak_evidence" | "structural";
export type GapSeverity = "high" | "medium" | "low";
export type TaskActionType =
  | "collect_data"
  | "build_evidence"
  | "rewrite_narrative"
  | "learn";
export type TaskStatus = "todo" | "doing" | "done" | "dropped";
export type TaskSource = "ai_generated" | "manual";
export type InterviewKind = "project_probe" | "product_case" | "ai_tech" | "data_case";
export type ProbeType =
  | "effect"
  | "attribution"
  | "decision"
  | "boundary"
  | "role"
  | "progress";
export type QuestionDifficulty = "basic" | "standard" | "deep";
export type RiskLevel = "high" | "medium" | "low";
export type PracticeStatus = "untouched" | "practiced" | "struggling";
export type KitJobStatus = "idle" | "running" | "done" | "failed";
export type KitJobStage = "probing" | "casing" | "writing";
export type CheckScope = "facts" | "skills" | "resume" | "cross_doc" | "atoms";
// info：C9 C10 这类不阻断任何事、但应该在视野里的提示。
export type CheckLevel = "blocking" | "warning" | "info" | "pass";
// gate：Step 6 门禁写的；health：Step 8 体检写的。体检清空重写时只碰自己那拨。
export type CheckOrigin = "gate" | "health";
export type HealthScanKind = "quick" | "deep";
export type HealthScanStatus = "running" | "done" | "failed";
// ---- 计费（Step C1）----
export type EntitlementSource =
  | "purchase" | "grant_signup" | "grant_monthly" | "redeem" | "adjust";
export type HoldStatus = "held" | "settled" | "released";
export type FreeReason = "free_forever" | "free_quota" | "regen_window" | "budget_grace";

export type Database = {
  public: {
    Tables: {
      profile_facts: {
        Row: {
          id: string;
          user_id: string;
          key: string;
          value: string | null;
          status: ProfileFactStatus;
          conflict_log: Json;
          disclosure_rule: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          key: string;
          value?: string | null;
          status?: ProfileFactStatus;
          conflict_log?: Json;
          disclosure_rule?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          key?: string;
          value?: string | null;
          status?: ProfileFactStatus;
          conflict_log?: Json;
          disclosure_rule?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      atoms: {
        Row: {
          id: string;
          user_id: string;
          parent_id: string | null;
          level: AtomLevel;
          context: AtomContext;
          org: string | null;
          role: string | null;
          title: string;
          period_start: string | null;
          period_end: string | null;
          situation: string | null;
          task: string | null;
          actions: Json;
          status: AtomStatus;
          evidence_level: EvidenceLevel;
          pending_metrics: Json;
          jd_signals: Json;
          embedding: string | null;
          sort_order: number | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          parent_id?: string | null;
          level?: AtomLevel;
          context?: AtomContext;
          org?: string | null;
          role?: string | null;
          title: string;
          period_start?: string | null;
          period_end?: string | null;
          situation?: string | null;
          task?: string | null;
          actions?: Json;
          status?: AtomStatus;
          evidence_level?: EvidenceLevel;
          pending_metrics?: Json;
          jd_signals?: Json;
          embedding?: string | null;
          sort_order?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          parent_id?: string | null;
          level?: AtomLevel;
          context?: AtomContext;
          org?: string | null;
          role?: string | null;
          title?: string;
          period_start?: string | null;
          period_end?: string | null;
          situation?: string | null;
          task?: string | null;
          actions?: Json;
          status?: AtomStatus;
          evidence_level?: EvidenceLevel;
          pending_metrics?: Json;
          jd_signals?: Json;
          embedding?: string | null;
          sort_order?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "atoms_parent_id_fkey";
            columns: ["parent_id"];
            referencedRelation: "atoms";
            referencedColumns: ["id"];
          },
        ];
      };
      metrics: {
        Row: {
          id: string;
          user_id: string;
          atom_id: string;
          name: string;
          kind: MetricKind;
          from_value: string | null;
          to_value: string | null;
          delta: string | null;
          evidence_level: EvidenceLevel;
          method: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          atom_id: string;
          name: string;
          kind?: MetricKind;
          from_value?: string | null;
          to_value?: string | null;
          delta?: string | null;
          evidence_level?: EvidenceLevel;
          method?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          atom_id?: string;
          name?: string;
          kind?: MetricKind;
          from_value?: string | null;
          to_value?: string | null;
          delta?: string | null;
          evidence_level?: EvidenceLevel;
          method?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "metrics_atom_id_fkey";
            columns: ["atom_id"];
            referencedRelation: "atoms";
            referencedColumns: ["id"];
          },
        ];
      };
      guards: {
        Row: {
          id: string;
          user_id: string;
          atom_id: string;
          must_say: Json;
          never_say: Json;
          role_framing: string | null;
          probes: Json;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          atom_id: string;
          must_say?: Json;
          never_say?: Json;
          role_framing?: string | null;
          probes?: Json;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          atom_id?: string;
          must_say?: Json;
          never_say?: Json;
          role_framing?: string | null;
          probes?: Json;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "guards_atom_id_fkey";
            columns: ["atom_id"];
            referencedRelation: "atoms";
            referencedColumns: ["id"];
          },
        ];
      };
      skills: {
        Row: {
          id: string;
          user_id: string;
          label: string;
          category: string | null;
          depth: SkillDepth | null;
          evidence_strength: EvidenceStrength;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          label: string;
          category?: string | null;
          depth?: SkillDepth | null;
          evidence_strength?: EvidenceStrength;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          label?: string;
          category?: string | null;
          depth?: SkillDepth | null;
          evidence_strength?: EvidenceStrength;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      atom_skills: {
        Row: {
          id: string;
          user_id: string;
          atom_id: string;
          skill_id: string;
          weight: number | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          atom_id: string;
          skill_id: string;
          weight?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          atom_id?: string;
          skill_id?: string;
          weight?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "atom_skills_atom_id_fkey";
            columns: ["atom_id"];
            referencedRelation: "atoms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "atom_skills_skill_id_fkey";
            columns: ["skill_id"];
            referencedRelation: "skills";
            referencedColumns: ["id"];
          },
        ];
      };
      source_docs: {
        Row: {
          id: string;
          user_id: string;
          filename: string;
          storage_path: string | null;
          doc_type: string | null;
          parsed_text: string | null;
          ingested_at: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          filename: string;
          storage_path?: string | null;
          doc_type?: string | null;
          parsed_text?: string | null;
          ingested_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          filename?: string;
          storage_path?: string | null;
          doc_type?: string | null;
          parsed_text?: string | null;
          ingested_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      atom_sources: {
        Row: {
          id: string;
          user_id: string;
          atom_id: string;
          source_doc_id: string;
          excerpt: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          atom_id: string;
          source_doc_id: string;
          excerpt?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          atom_id?: string;
          source_doc_id?: string;
          excerpt?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "atom_sources_atom_id_fkey";
            columns: ["atom_id"];
            referencedRelation: "atoms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "atom_sources_source_doc_id_fkey";
            columns: ["source_doc_id"];
            referencedRelation: "source_docs";
            referencedColumns: ["id"];
          },
        ];
      };
      llm_calls: {
        Row: {
          id: string;
          user_id: string;
          tier: LlmTier;
          provider: string | null;
          purpose: string;
          prompt_tokens: number | null;
          completion_tokens: number | null;
          duration_ms: number | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          tier: LlmTier;
          provider?: string | null;
          purpose: string;
          prompt_tokens?: number | null;
          completion_tokens?: number | null;
          duration_ms?: number | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          tier?: LlmTier;
          provider?: string | null;
          purpose?: string;
          prompt_tokens?: number | null;
          completion_tokens?: number | null;
          duration_ms?: number | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      ingest_jobs: {
        Row: {
          id: string;
          user_id: string;
          input_type: IngestInputType;
          raw_input: string | null;
          source_doc_id: string | null;
          status: IngestStatus;
          progress_stage: IngestStage | null;
          progress_current: number | null;
          progress_total: number | null;
          error_message: string | null;
          candidates: Json;
          heartbeat_at: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          input_type: IngestInputType;
          raw_input?: string | null;
          source_doc_id?: string | null;
          status?: IngestStatus;
          progress_stage?: IngestStage | null;
          progress_current?: number | null;
          progress_total?: number | null;
          error_message?: string | null;
          candidates?: Json;
          heartbeat_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          input_type?: IngestInputType;
          raw_input?: string | null;
          source_doc_id?: string | null;
          status?: IngestStatus;
          progress_stage?: IngestStage | null;
          progress_current?: number | null;
          progress_total?: number | null;
          error_message?: string | null;
          candidates?: Json;
          heartbeat_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ingest_jobs_source_doc_id_fkey";
            columns: ["source_doc_id"];
            referencedRelation: "source_docs";
            referencedColumns: ["id"];
          },
        ];
      };
      drafts: {
        Row: {
          id: string;
          user_id: string;
          ingest_job_id: string;
          intent: DraftIntent;
          target_atom_id: string | null;
          payload: Json;
          diff: Json;
          confidence: number | null;
          ai_note: string | null;
          review_status: DraftReviewStatus;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          ingest_job_id: string;
          intent: DraftIntent;
          target_atom_id?: string | null;
          payload?: Json;
          diff?: Json;
          confidence?: number | null;
          ai_note?: string | null;
          review_status?: DraftReviewStatus;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          ingest_job_id?: string;
          intent?: DraftIntent;
          target_atom_id?: string | null;
          payload?: Json;
          diff?: Json;
          confidence?: number | null;
          ai_note?: string | null;
          review_status?: DraftReviewStatus;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "drafts_ingest_job_id_fkey";
            columns: ["ingest_job_id"];
            referencedRelation: "ingest_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "drafts_target_atom_id_fkey";
            columns: ["target_atom_id"];
            referencedRelation: "atoms";
            referencedColumns: ["id"];
          },
        ];
      };
      targets: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          direction: string | null;
          narrative: string | null;
          sort_order: number | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          direction?: string | null;
          narrative?: string | null;
          sort_order?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          direction?: string | null;
          narrative?: string | null;
          sort_order?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      atom_target_strategy: {
        Row: {
          id: string;
          user_id: string;
          atom_id: string;
          target_id: string;
          render_weight: RenderWeight;
          custom_phrasing: Json | null;
          exclusive_group: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          atom_id: string;
          target_id: string;
          render_weight?: RenderWeight;
          custom_phrasing?: Json | null;
          exclusive_group?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          atom_id?: string;
          target_id?: string;
          render_weight?: RenderWeight;
          custom_phrasing?: Json | null;
          exclusive_group?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "atom_target_strategy_atom_id_fkey";
            columns: ["atom_id"];
            referencedRelation: "atoms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "atom_target_strategy_target_id_fkey";
            columns: ["target_id"];
            referencedRelation: "targets";
            referencedColumns: ["id"];
          },
        ];
      };
      jds: {
        Row: {
          id: string;
          user_id: string;
          target_id: string;
          company: string | null;
          role_title: string | null;
          raw_text: string;
          source_url: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          target_id: string;
          company?: string | null;
          role_title?: string | null;
          raw_text: string;
          source_url?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          target_id?: string;
          company?: string | null;
          role_title?: string | null;
          raw_text?: string;
          source_url?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "jds_target_id_fkey";
            columns: ["target_id"];
            referencedRelation: "targets";
            referencedColumns: ["id"];
          },
        ];
      };
      requirements: {
        Row: {
          id: string;
          user_id: string;
          jd_id: string;
          text: string;
          kind: RequirementKind;
          idx: number | null;
          raw_phrase: string | null;
          is_structural: boolean;
          derived_from: string | null;
          weight: number | null;
          mapped_skill_id: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          jd_id: string;
          text: string;
          kind?: RequirementKind;
          idx?: number | null;
          raw_phrase?: string | null;
          is_structural?: boolean;
          derived_from?: string | null;
          weight?: number | null;
          mapped_skill_id?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          jd_id?: string;
          text?: string;
          kind?: RequirementKind;
          idx?: number | null;
          raw_phrase?: string | null;
          is_structural?: boolean;
          derived_from?: string | null;
          weight?: number | null;
          mapped_skill_id?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "requirements_jd_id_fkey";
            columns: ["jd_id"];
            referencedRelation: "jds";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "requirements_mapped_skill_id_fkey";
            columns: ["mapped_skill_id"];
            referencedRelation: "skills";
            referencedColumns: ["id"];
          },
        ];
      };
      assessments: {
        Row: {
          id: string;
          user_id: string;
          target_id: string;
          jd_id: string;
          match_score: number | null;
          strengths: Json;
          results: Json;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          target_id: string;
          jd_id: string;
          match_score?: number | null;
          strengths?: Json;
          results?: Json;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          target_id?: string;
          jd_id?: string;
          match_score?: number | null;
          strengths?: Json;
          results?: Json;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "assessments_target_id_fkey";
            columns: ["target_id"];
            referencedRelation: "targets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assessments_jd_id_fkey";
            columns: ["jd_id"];
            referencedRelation: "jds";
            referencedColumns: ["id"];
          },
        ];
      };
      gaps: {
        Row: {
          id: string;
          user_id: string;
          assessment_id: string;
          requirement_id: string | null;
          gap_type: GapType;
          severity: GapSeverity;
          score_impact: number | null;
          requirement_index: number | null;
          detail: Json;
          resolved_at: string | null;
          dismissed_at: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          assessment_id: string;
          requirement_id?: string | null;
          gap_type: GapType;
          severity?: GapSeverity;
          score_impact?: number | null;
          requirement_index?: number | null;
          detail?: Json;
          resolved_at?: string | null;
          dismissed_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          assessment_id?: string;
          requirement_id?: string | null;
          gap_type?: GapType;
          severity?: GapSeverity;
          score_impact?: number | null;
          requirement_index?: number | null;
          detail?: Json;
          resolved_at?: string | null;
          dismissed_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "gaps_assessment_id_fkey";
            columns: ["assessment_id"];
            referencedRelation: "assessments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gaps_requirement_id_fkey";
            columns: ["requirement_id"];
            referencedRelation: "requirements";
            referencedColumns: ["id"];
          },
        ];
      };
      tasks: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          rationale: string | null;
          action_type: TaskActionType;
          estimated_hours: number | null;
          actual_hours: number | null;
          status: TaskStatus;
          produces_atom_id: string | null;
          deliverable: string | null;
          pinned: boolean | null;
          source: TaskSource;
          anchor_atom_id: string | null;
          dismissed_at: string | null;
          completed_at: string | null;
          edited: boolean;
          auto_completed: boolean;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          title: string;
          rationale?: string | null;
          action_type: TaskActionType;
          estimated_hours?: number | null;
          actual_hours?: number | null;
          status?: TaskStatus;
          produces_atom_id?: string | null;
          deliverable?: string | null;
          pinned?: boolean | null;
          source?: TaskSource;
          anchor_atom_id?: string | null;
          dismissed_at?: string | null;
          completed_at?: string | null;
          edited?: boolean;
          auto_completed?: boolean;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          rationale?: string | null;
          action_type?: TaskActionType;
          estimated_hours?: number | null;
          actual_hours?: number | null;
          status?: TaskStatus;
          produces_atom_id?: string | null;
          deliverable?: string | null;
          pinned?: boolean | null;
          source?: TaskSource;
          anchor_atom_id?: string | null;
          dismissed_at?: string | null;
          completed_at?: string | null;
          edited?: boolean;
          auto_completed?: boolean;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_produces_atom_id_fkey";
            columns: ["produces_atom_id"];
            referencedRelation: "atoms";
            referencedColumns: ["id"];
          },
        ];
      };
      task_targets: {
        Row: {
          id: string;
          user_id: string;
          task_id: string;
          target_id: string;
          gap_id: string | null;
          impact: number | null;
          impact_basis: Json;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          task_id: string;
          target_id: string;
          gap_id?: string | null;
          impact?: number | null;
          impact_basis?: Json;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          task_id?: string;
          target_id?: string;
          gap_id?: string | null;
          impact?: number | null;
          impact_basis?: Json;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "task_targets_task_id_fkey";
            columns: ["task_id"];
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_targets_target_id_fkey";
            columns: ["target_id"];
            referencedRelation: "targets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_targets_gap_id_fkey";
            columns: ["gap_id"];
            referencedRelation: "gaps";
            referencedColumns: ["id"];
          },
        ];
      };
      resume_baselines: {
        Row: {
          tradeoffs: Json;
          skills: Json;
          generated_at: string | null;
          id: string;
          user_id: string;
          target_id: string;
          headline: string | null;
          block_order: Json;
          rendered_md: string | null;
          locked_at: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          target_id: string;
          tradeoffs?: Json;
          skills?: Json;
          generated_at?: string | null;
          headline?: string | null;
          block_order?: Json;
          rendered_md?: string | null;
          locked_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          target_id?: string;
          tradeoffs?: Json;
          skills?: Json;
          generated_at?: string | null;
          headline?: string | null;
          block_order?: Json;
          rendered_md?: string | null;
          locked_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "resume_baselines_target_id_fkey";
            columns: ["target_id"];
            referencedRelation: "targets";
            referencedColumns: ["id"];
          },
        ];
      };
      resume_versions: {
        Row: {
          unmatched: Json;
          warnings: Json;
          headline: string | null;
          id: string;
          user_id: string;
          baseline_id: string;
          jd_id: string;
          deltas: Json;
          delta_ratio: number | null;
          over_threshold_ack: boolean | null;
          rendered_md: string | null;
          export_path: string | null;
          submitted_at: string | null;
          locked: boolean | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          baseline_id: string;
          jd_id: string;
          unmatched?: Json;
          warnings?: Json;
          headline?: string | null;
          deltas?: Json;
          delta_ratio?: number | null;
          over_threshold_ack?: boolean | null;
          rendered_md?: string | null;
          export_path?: string | null;
          submitted_at?: string | null;
          locked?: boolean | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          baseline_id?: string;
          jd_id?: string;
          unmatched?: Json;
          warnings?: Json;
          headline?: string | null;
          deltas?: Json;
          delta_ratio?: number | null;
          over_threshold_ack?: boolean | null;
          rendered_md?: string | null;
          export_path?: string | null;
          submitted_at?: string | null;
          locked?: boolean | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "resume_versions_baseline_id_fkey";
            columns: ["baseline_id"];
            referencedRelation: "resume_baselines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "resume_versions_jd_id_fkey";
            columns: ["jd_id"];
            referencedRelation: "jds";
            referencedColumns: ["id"];
          },
        ];
      };
      resume_blocks: {
        Row: {
          title: string | null;
          meta: string | null;
          summary: string | null;
          bullets: Json;
          must_say_covered: Json;
          edited: boolean;
          source_block_id: string | null;
          id: string;
          user_id: string;
          resume_version_id: string | null;
          baseline_id: string | null;
          atom_id: string | null;
          section: string | null;
          rendered_text: string | null;
          template_used: string | null;
          order_index: number | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          title?: string | null;
          meta?: string | null;
          summary?: string | null;
          bullets?: Json;
          must_say_covered?: Json;
          edited?: boolean;
          source_block_id?: string | null;
          resume_version_id?: string | null;
          baseline_id?: string | null;
          atom_id?: string | null;
          section?: string | null;
          rendered_text?: string | null;
          template_used?: string | null;
          order_index?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string | null;
          meta?: string | null;
          summary?: string | null;
          bullets?: Json;
          must_say_covered?: Json;
          edited?: boolean;
          source_block_id?: string | null;
          resume_version_id?: string | null;
          baseline_id?: string | null;
          atom_id?: string | null;
          section?: string | null;
          rendered_text?: string | null;
          template_used?: string | null;
          order_index?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "resume_blocks_resume_version_id_fkey";
            columns: ["resume_version_id"];
            referencedRelation: "resume_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "resume_blocks_baseline_id_fkey";
            columns: ["baseline_id"];
            referencedRelation: "resume_baselines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "resume_blocks_atom_id_fkey";
            columns: ["atom_id"];
            referencedRelation: "atoms";
            referencedColumns: ["id"];
          },
        ];
      };
      interview_kits: {
        Row: {
          id: string;
          user_id: string;
          target_id: string;
          jd_id: string | null;
          kind: InterviewKind | null;
          items: Json;
          resume_version_id: string | null;
          generated_at: string | null;
          job_status: KitJobStatus;
          job_stage: KitJobStage | null;
          job_started_at: string | null;
          heartbeat_at: string | null;
          error_message: string | null;
          probe_count: number;
          case_count: number;
          warnings: Json;
          rejected: Json;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          target_id: string;
          jd_id?: string | null;
          kind?: InterviewKind | null;
          items?: Json;
          resume_version_id?: string | null;
          generated_at?: string | null;
          job_status?: KitJobStatus;
          job_stage?: KitJobStage | null;
          job_started_at?: string | null;
          heartbeat_at?: string | null;
          error_message?: string | null;
          probe_count?: number;
          case_count?: number;
          warnings?: Json;
          rejected?: Json;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          target_id?: string;
          jd_id?: string | null;
          kind?: InterviewKind | null;
          items?: Json;
          resume_version_id?: string | null;
          generated_at?: string | null;
          job_status?: KitJobStatus;
          job_stage?: KitJobStage | null;
          job_started_at?: string | null;
          heartbeat_at?: string | null;
          error_message?: string | null;
          probe_count?: number;
          case_count?: number;
          warnings?: Json;
          rejected?: Json;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "interview_kits_target_id_fkey";
            columns: ["target_id"];
            referencedRelation: "targets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "interview_kits_jd_id_fkey";
            columns: ["jd_id"];
            referencedRelation: "jds";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "interview_kits_resume_version_id_fkey";
            columns: ["resume_version_id"];
            referencedRelation: "resume_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      interview_questions: {
        Row: {
          id: string;
          user_id: string;
          kit_id: string;
          kind: InterviewKind;
          question: string;
          probe_type: ProbeType | null;
          difficulty: QuestionDifficulty | null;
          from_atom_id: string | null;
          from_existing_probe: boolean | null;
          risk_level: RiskLevel;
          risk_reason: string | null;
          answer_outline: Json;
          dont_do: string | null;
          data_gap_hint: string | null;
          gap_metric_id: string | null;
          related_atom_ids: Json;
          why_this_question: string | null;
          practice_status: PracticeStatus;
          practice_note: string | null;
          carried_over: boolean;
          sort_order: number;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          kit_id: string;
          kind: InterviewKind;
          question: string;
          probe_type?: ProbeType | null;
          difficulty?: QuestionDifficulty | null;
          from_atom_id?: string | null;
          from_existing_probe?: boolean | null;
          risk_level?: RiskLevel;
          risk_reason?: string | null;
          answer_outline?: Json;
          dont_do?: string | null;
          data_gap_hint?: string | null;
          gap_metric_id?: string | null;
          related_atom_ids?: Json;
          why_this_question?: string | null;
          practice_status?: PracticeStatus;
          practice_note?: string | null;
          carried_over?: boolean;
          sort_order?: number;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          kit_id?: string;
          kind?: InterviewKind;
          question?: string;
          probe_type?: ProbeType | null;
          difficulty?: QuestionDifficulty | null;
          from_atom_id?: string | null;
          from_existing_probe?: boolean | null;
          risk_level?: RiskLevel;
          risk_reason?: string | null;
          answer_outline?: Json;
          dont_do?: string | null;
          data_gap_hint?: string | null;
          gap_metric_id?: string | null;
          related_atom_ids?: Json;
          why_this_question?: string | null;
          practice_status?: PracticeStatus;
          practice_note?: string | null;
          carried_over?: boolean;
          sort_order?: number;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "interview_questions_kit_id_fkey";
            columns: ["kit_id"];
            referencedRelation: "interview_kits";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "interview_questions_from_atom_id_fkey";
            columns: ["from_atom_id"];
            referencedRelation: "atoms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "interview_questions_gap_metric_id_fkey";
            columns: ["gap_metric_id"];
            referencedRelation: "metrics";
            referencedColumns: ["id"];
          },
        ];
      };
      baseline_evolution_log: {
        Row: {
          id: string;
          user_id: string;
          baseline_id: string;
          signature: string;
          decision: "accepted" | "rejected";
          decided_at: string;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          baseline_id: string;
          signature: string;
          decision: "accepted" | "rejected";
          decided_at?: string;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          baseline_id?: string;
          signature?: string;
          decision?: "accepted" | "rejected";
          decided_at?: string;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "baseline_evolution_log_baseline_id_fkey";
            columns: ["baseline_id"];
            referencedRelation: "resume_baselines";
            referencedColumns: ["id"];
          },
        ];
      };
      check_results: {
        Row: {
          id: string;
          user_id: string;
          scope: CheckScope;
          level: CheckLevel;
          code: string | null;
          title: string;
          detail: string | null;
          ref_ids: Json;
          origin: CheckOrigin;
          resolve_link: string | null;
          fingerprint: string | null;
          ignored_at: string | null;
          resolved_at: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          scope: CheckScope;
          level: CheckLevel;
          code?: string | null;
          title: string;
          detail?: string | null;
          ref_ids?: Json;
          origin?: CheckOrigin;
          resolve_link?: string | null;
          fingerprint?: string | null;
          ignored_at?: string | null;
          resolved_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          scope?: CheckScope;
          level?: CheckLevel;
          code?: string | null;
          title?: string;
          detail?: string | null;
          ref_ids?: Json;
          origin?: CheckOrigin;
          resolve_link?: string | null;
          fingerprint?: string | null;
          ignored_at?: string | null;
          resolved_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      health_ignores: {
        Row: {
          id: string;
          user_id: string;
          fingerprint: string;
          code: string | null;
          reason: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          fingerprint: string;
          code?: string | null;
          reason?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          fingerprint?: string;
          code?: string | null;
          reason?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      health_scans: {
        Row: {
          id: string;
          user_id: string;
          kind: HealthScanKind;
          status: HealthScanStatus;
          done_count: number;
          total_count: number;
          coverage: Json;
          error_message: string | null;
          started_at: string | null;
          heartbeat_at: string | null;
          finished_at: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          kind: HealthScanKind;
          status?: HealthScanStatus;
          done_count?: number;
          total_count?: number;
          coverage?: Json;
          error_message?: string | null;
          started_at?: string | null;
          heartbeat_at?: string | null;
          finished_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          kind?: HealthScanKind;
          status?: HealthScanStatus;
          done_count?: number;
          total_count?: number;
          coverage?: Json;
          error_message?: string | null;
          started_at?: string | null;
          heartbeat_at?: string | null;
          finished_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      chat_messages: {
        Row: {
          id: string;
          user_id: string;
          role: ChatRole;
          kind: ChatKind;
          content: string | null;
          image_path: string | null;
          payload: Json;
          ingest_job_id: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          role: ChatRole;
          kind?: ChatKind;
          content?: string | null;
          image_path?: string | null;
          payload?: Json;
          ingest_job_id?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          role?: ChatRole;
          kind?: ChatKind;
          content?: string | null;
          image_path?: string | null;
          payload?: Json;
          ingest_job_id?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "chat_messages_ingest_job_id_fkey";
            columns: ["ingest_job_id"];
            referencedRelation: "ingest_jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      nudge_log: {
        Row: {
          id: string;
          user_id: string;
          rule: NudgeRule;
          atom_id: string | null;
          chat_message_id: string | null;
          sent_at: string;
          sent_on: string;
          responded: boolean;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          rule: NudgeRule;
          atom_id?: string | null;
          chat_message_id?: string | null;
          sent_at?: string;
          sent_on?: string;
          responded?: boolean;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          rule?: NudgeRule;
          atom_id?: string | null;
          chat_message_id?: string | null;
          sent_at?: string;
          sent_on?: string;
          responded?: boolean;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "nudge_log_atom_id_fkey";
            columns: ["atom_id"];
            referencedRelation: "atoms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "nudge_log_chat_message_id_fkey";
            columns: ["chat_message_id"];
            referencedRelation: "chat_messages";
            referencedColumns: ["id"];
          },
        ];
      };
      undo_log: {
        Row: {
          id: string;
          user_id: string;
          chat_message_id: string | null;
          draft_id: string | null;
          inverse_ops: Json;
          expires_at: string;
          undone_at: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          chat_message_id?: string | null;
          draft_id?: string | null;
          inverse_ops: Json;
          expires_at?: string;
          undone_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          chat_message_id?: string | null;
          draft_id?: string | null;
          inverse_ops?: Json;
          expires_at?: string;
          undone_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "undo_log_chat_message_id_fkey";
            columns: ["chat_message_id"];
            referencedRelation: "chat_messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "undo_log_draft_id_fkey";
            columns: ["draft_id"];
            referencedRelation: "drafts";
            referencedColumns: ["id"];
          },
        ];
      };
      // 官网候补名单。整张表没有 user_id —— 留邮箱的人还没有账号。
      // RLS 只开了 insert，读不出来（见 supabase/23_site_waitlist.sql）。
      waitlist: {
        Row: {
          id: string;
          email: string;
          source: string;
          invited_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          source?: string;
          invited_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          source?: string;
          invited_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      entitlements: {
        Row: {
          id: string;
          user_id: string;
          source: EntitlementSource;
          credits_total: number;
          credits_used: number;
          expires_at: string | null;
          order_ref: string | null;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          source: EntitlementSource;
          credits_total: number;
          credits_used?: number;
          expires_at?: string | null;
          order_ref?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          credits_used?: number;
          expires_at?: string | null;
          order_ref?: string | null;
          note?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      quota_counters: {
        Row: {
          user_id: string;
          credits_available: number;
          credits_held: number;
          free_chat_month: string;
          free_chat_used: number;
          chat_day: string;
          chat_day_used: number;
          fact_revision: number;
          strategy_revision: number;
          updated_at: string;
        };
        Insert: {
          user_id?: string;
          credits_available?: number;
          credits_held?: number;
          free_chat_month?: string;
          free_chat_used?: number;
          chat_day?: string;
          chat_day_used?: number;
          fact_revision?: number;
          strategy_revision?: number;
          updated_at?: string;
        };
        Update: {
          credits_available?: number;
          credits_held?: number;
          free_chat_month?: string;
          free_chat_used?: number;
          chat_day?: string;
          chat_day_used?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      credit_holds: {
        // release_token 不在 Row 里：客户端按列级 GRANT 就读不到它，
        // 类型上也别给出来，免得有人写了个 select 死在运行时。
        Row: {
          id: string;
          user_id: string;
          action_code: string;
          credits: number;
          status: HoldStatus;
          idempotency_key: string;
          job_ref: string | null;
          fingerprint: string | null;
          expires_at: string;
          settled_at: string | null;
          released_at: string | null;
          release_reason: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      usage_logs: {
        Row: {
          id: string;
          user_id: string;
          hold_id: string | null;
          action_code: string;
          credits_charged: number;
          free_reason: FreeReason | null;
          llm_call_ids: Json;
          input_tokens: number | null;
          output_tokens: number | null;
          cost_cents: number | null;
          duration_ms: number | null;
          succeeded: boolean;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      redeem_records: {
        Row: {
          id: string;
          user_id: string;
          code: string;
          entitlement_id: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      user_profiles: {
        Row: {
          user_id: string;
          nickname: string | null;
          signup_source: string;
          signup_grant_issued: boolean;
          signup_grant_issued_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        // 只有 nickname 是列级授权可写的，其余客户端改不了。
        Update: { nickname?: string | null };
        Relationships: [];
      };
    };
    Views: {
      task_priority: {
        Row: {
          task_id: string | null;
          user_id: string | null;
          total_impact: number | null;
          target_count: number | null;
          priority: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_pkey";
            columns: ["task_id"];
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      commit_draft: {
        Args: {
          p_draft_id: string;
          p_atom: Json;
          p_intent: string;
          p_target: string | null;
          p_parent: string | null;
          p_source_doc_id: string | null;
          p_diff?: Json;
          p_edited?: boolean;
        };
        Returns: string;
      };
      commit_chat_draft: {
        Args: {
          p_draft_id: string;
          p_atom: Json;
          p_intent: string;
          p_target: string | null;
          p_parent: string | null;
          p_chat_message_id: string | null;
        };
        Returns: Json;
      };
      undo_chat: {
        Args: { p_undo_id: string };
        Returns: boolean;
      };
      match_atoms: {
        Args: { query_embedding: string; match_count?: number };
        Returns: {
          id: string;
          title: string;
          org: string | null;
          role: string | null;
          level: AtomLevel;
          status: AtomStatus;
          period_start: string | null;
          period_end: string | null;
          situation: string | null;
          pending_metrics: Json;
          similarity: number;
        }[];
      };
      ensure_quota_counter: {
        Args: { p_user?: string };
        Returns: undefined;
      };
      hold_credits: {
        Args: {
          p_user: string;
          p_action: string;
          p_credits: number;
          p_key: string;
          p_fingerprint?: string | null;
          p_ttl_min?: number;
          p_job_ref?: string | null;
        };
        // { hold_id, release_token, balance_after, idempotent }
        Returns: Json;
      };
      settle_hold: {
        Args: { p_hold: string; p_usage_meta?: Json };
        Returns: undefined;
      };
      release_hold: {
        Args: {
          p_hold: string;
          p_reason: string;
          p_release_token?: string | null;
          p_usage_meta?: Json;
        };
        Returns: undefined;
      };
      reconcile_quota: {
        Args: { p_user?: string };
        Returns: Json;
      };
      billing_sweep: {
        Args: { p_limit?: number };
        Returns: Json;
      };
      sweep_expired_holds: {
        Args: { p_limit?: number };
        Returns: number;
      };
      sweep_expired_entitlements: {
        Args: { p_limit?: number };
        Returns: number;
      };
      record_free_spend: {
        Args: { p_cost_cents?: number };
        Returns: undefined;
      };
      check_global_budget: {
        Args: { p_est_cents: number; p_cap_cents: number };
        Returns: Json;
      };
      claim_signup_grant: {
        Args: {
          p_user: string;
          p_credits: number;
          p_cap_cents: number;
          p_est_cents: number;
        };
        Returns: Json;
      };
      log_free_usage: {
        Args: {
          p_user: string;
          p_action: string;
          p_reason: string;
          p_fingerprint?: string | null;
          p_succeeded?: boolean;
          p_usage_meta?: Json;
        };
        Returns: undefined;
      };
      tag_usage_fingerprint: {
        Args: { p_hold: string; p_fingerprint: string };
        Returns: undefined;
      };
      consume_free_chat: {
        Args: { p_user: string; p_limit: number };
        Returns: boolean;
      };
      bump_chat_day: {
        Args: { p_user: string; p_cap: number };
        Returns: boolean;
      };
      check_regen_free: {
        Args: {
          p_user: string;
          p_action: string;
          p_fingerprint: string;
          p_window_hours: number;
          p_max: number;
        };
        Returns: boolean;
      };
      recompute_atom_evidence: {
        Args: { p_atom: string };
        Returns: undefined;
      };
      recompute_skill_evidence: {
        Args: { p_skill: string };
        Returns: undefined;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

// ---- 便捷别名 ----
type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];
export type Views<T extends keyof PublicSchema["Views"]> =
  PublicSchema["Views"][T]["Row"];
