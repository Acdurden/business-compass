export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      answer_options: {
        Row: {
          active: boolean
          answer_text: string
          id: string
          option_order: number
          points: number | null
          question_id: string
          section_id: string | null
          unique_id_responses: string | null
          value_max: number | null
          value_min: number | null
          value_type: string | null
        }
        Insert: {
          active?: boolean
          answer_text: string
          id: string
          option_order: number
          points?: number | null
          question_id: string
          section_id?: string | null
          unique_id_responses?: string | null
          value_max?: number | null
          value_min?: number | null
          value_type?: string | null
        }
        Update: {
          active?: boolean
          answer_text?: string
          id?: string
          option_order?: number
          points?: number | null
          question_id?: string
          section_id?: string | null
          unique_id_responses?: string | null
          value_max?: number | null
          value_min?: number | null
          value_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "answer_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["question_id"]
          },
        ]
      }
      multiple_schedule: {
        Row: {
          adjusted_multiple: number | null
          adjusted_multiple_band_id: number | null
          adjusted_points_available: number | null
          adjusted_score: number | null
          adjusted_score_points_increments: number | null
          adjusted_score_range: number | null
          adjusted_target_multiple: number | null
          adjusted_target_multiple_band: number | null
          adjusted_target_multiple_id: number | null
          adjusted_target_score: number | null
          ebitda_multiple: number | null
          multiple: number | null
          net_fee_income_multiple: number | null
          objective_multiple: number | null
          objective_multiple_band_id: number | null
          objective_point_increments: number | null
          objective_points_available: number | null
          objective_score: number | null
          objective_score_range: number | null
          objective_target_multiple: number | null
          objective_target_multiple_band: number | null
          objective_target_multiple_id: number | null
          objective_target_score: number | null
        }
        Insert: {
          adjusted_multiple?: number | null
          adjusted_multiple_band_id?: number | null
          adjusted_points_available?: number | null
          adjusted_score?: number | null
          adjusted_score_points_increments?: number | null
          adjusted_score_range?: number | null
          adjusted_target_multiple?: number | null
          adjusted_target_multiple_band?: number | null
          adjusted_target_multiple_id?: number | null
          adjusted_target_score?: number | null
          ebitda_multiple?: number | null
          multiple?: number | null
          net_fee_income_multiple?: number | null
          objective_multiple?: number | null
          objective_multiple_band_id?: number | null
          objective_point_increments?: number | null
          objective_points_available?: number | null
          objective_score?: number | null
          objective_score_range?: number | null
          objective_target_multiple?: number | null
          objective_target_multiple_band?: number | null
          objective_target_multiple_id?: number | null
          objective_target_score?: number | null
        }
        Update: {
          adjusted_multiple?: number | null
          adjusted_multiple_band_id?: number | null
          adjusted_points_available?: number | null
          adjusted_score?: number | null
          adjusted_score_points_increments?: number | null
          adjusted_score_range?: number | null
          adjusted_target_multiple?: number | null
          adjusted_target_multiple_band?: number | null
          adjusted_target_multiple_id?: number | null
          adjusted_target_score?: number | null
          ebitda_multiple?: number | null
          multiple?: number | null
          net_fee_income_multiple?: number | null
          objective_multiple?: number | null
          objective_multiple_band_id?: number | null
          objective_point_increments?: number | null
          objective_points_available?: number | null
          objective_score?: number | null
          objective_score_range?: number | null
          objective_target_multiple?: number | null
          objective_target_multiple_band?: number | null
          objective_target_multiple_id?: number | null
          objective_target_score?: number | null
        }
        Relationships: []
      }
      questions: {
        Row: {
          active: boolean
          max_score: number | null
          question_id: string
          question_number: number
          question_text: string
          questionnaire_type: string
          response_type: string
          section_id: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          max_score?: number | null
          question_id: string
          question_number: number
          question_text: string
          questionnaire_type: string
          response_type?: string
          section_id: string
          sort_order: number
        }
        Update: {
          active?: boolean
          max_score?: number | null
          question_id?: string
          question_number?: number
          question_text?: string
          questionnaire_type?: string
          response_type?: string
          section_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "questions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["section_id"]
          },
        ]
      }
      responses: {
        Row: {
          answer_option_id: string
          answered_at: string | null
          created_at: string
          points_awarded: number | null
          question_id: string
          questionnaire_type: string | null
          response_id: string
          section_id: string | null
          selected_answer_text: string | null
          submission_id: string
          unique_id_response: string | null
          updated_at: string
        }
        Insert: {
          answer_option_id: string
          answered_at?: string | null
          created_at?: string
          points_awarded?: number | null
          question_id: string
          questionnaire_type?: string | null
          response_id: string
          section_id?: string | null
          selected_answer_text?: string | null
          submission_id: string
          unique_id_response?: string | null
          updated_at?: string
        }
        Update: {
          answer_option_id?: string
          answered_at?: string | null
          created_at?: string
          points_awarded?: number | null
          question_id?: string
          questionnaire_type?: string | null
          response_id?: string
          section_id?: string | null
          selected_answer_text?: string | null
          submission_id?: string
          unique_id_response?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "responses_answer_option_id_fkey"
            columns: ["answer_option_id"]
            isOneToOne: false
            referencedRelation: "answer_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["question_id"]
          },
          {
            foreignKeyName: "responses_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["submission_id"]
          },
        ]
      }
      score_bands: {
        Row: {
          adjusted_band: number | null
          band_type: string
          extra_value: string | null
          id: string
          label: string
          max_score: number
          min_score: number
          objective_band: number | null
          questionnaire_type: string | null
        }
        Insert: {
          adjusted_band?: number | null
          band_type: string
          extra_value?: string | null
          id: string
          label: string
          max_score: number
          min_score: number
          objective_band?: number | null
          questionnaire_type?: string | null
        }
        Update: {
          adjusted_band?: number | null
          band_type?: string
          extra_value?: string | null
          id?: string
          label?: string
          max_score?: number
          min_score?: number
          objective_band?: number | null
          questionnaire_type?: string | null
        }
        Relationships: []
      }
      section_scores: {
        Row: {
          actual_score: number | null
          max_score: number | null
          potential_improvement: number | null
          questionnaire_type: string | null
          section_id: string | null
          section_name: string | null
          section_score_id: string
          submission_id: string
        }
        Insert: {
          actual_score?: number | null
          max_score?: number | null
          potential_improvement?: number | null
          questionnaire_type?: string | null
          section_id?: string | null
          section_name?: string | null
          section_score_id: string
          submission_id: string
        }
        Update: {
          actual_score?: number | null
          max_score?: number | null
          potential_improvement?: number | null
          questionnaire_type?: string | null
          section_id?: string | null
          section_name?: string | null
          section_score_id?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "section_scores_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["submission_id"]
          },
        ]
      }
      sections: {
        Row: {
          max_score: number
          questionnaire_type: string
          section_id: string
          section_name: string
          sort_order: number
        }
        Insert: {
          max_score: number
          questionnaire_type: string
          section_id: string
          section_name: string
          sort_order: number
        }
        Update: {
          max_score?: number
          questionnaire_type?: string
          section_id?: string
          section_name?: string
          sort_order?: number
        }
        Relationships: []
      }
      submissions: {
        Row: {
          advisor_status: string
          client_status: string
          company_name: string
          created_at: string
          submission_id: string
          target_valuation: number | null
          updated_at: string
          valuation_input_amount: number | null
          valuation_input_type: string | null
        }
        Insert: {
          advisor_status?: string
          client_status?: string
          company_name: string
          created_at?: string
          submission_id: string
          target_valuation?: number | null
          updated_at?: string
          valuation_input_amount?: number | null
          valuation_input_type?: string | null
        }
        Update: {
          advisor_status?: string
          client_status?: string
          company_name?: string
          created_at?: string
          submission_id?: string
          target_valuation?: number | null
          updated_at?: string
          valuation_input_amount?: number | null
          valuation_input_type?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
