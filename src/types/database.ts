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
export type DraftIntent = "CREATE" | "UPDATE" | "ASK";
export type DraftReviewStatus = "pending" | "accepted" | "edited" | "rejected";
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
export type InterviewKind = "project_probe" | "product_case" | "ai_tech" | "data_case";
export type CheckScope = "facts" | "skills" | "resume" | "cross_doc";
export type CheckLevel = "blocking" | "warning" | "pass";

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
          resolved_at: string | null;
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
          resolved_at?: string | null;
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
          resolved_at?: string | null;
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
          kind: InterviewKind;
          items: Json;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          target_id: string;
          jd_id?: string | null;
          kind: InterviewKind;
          items?: Json;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          target_id?: string;
          jd_id?: string | null;
          kind?: InterviewKind;
          items?: Json;
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
          ignored_at?: string | null;
          resolved_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
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
