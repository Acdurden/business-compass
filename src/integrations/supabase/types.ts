export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      action_cures: {
        Row: {
          active: boolean;
          category_id: string | null;
          created_at: string;
          cure_id: string;
          cure_text: string;
          effort: string | null;
          problem_id: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          category_id?: string | null;
          created_at?: string;
          cure_id: string;
          cure_text: string;
          effort?: string | null;
          problem_id: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          category_id?: string | null;
          created_at?: string;
          cure_id?: string;
          cure_text?: string;
          effort?: string | null;
          problem_id?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "action_cures_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "partner_categories";
            referencedColumns: ["category_id"];
          },
          {
            foreignKeyName: "action_cures_problem_id_fkey";
            columns: ["problem_id"];
            isOneToOne: false;
            referencedRelation: "action_problems";
            referencedColumns: ["problem_id"];
          },
        ];
      };
      action_problems: {
        Row: {
          active: boolean;
          created_at: string;
          problem_id: string;
          problem_text: string;
          section_id: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          problem_id: string;
          problem_text: string;
          section_id: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          problem_id?: string;
          problem_text?: string;
          section_id?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "action_problems_section_id_fkey";
            columns: ["section_id"];
            isOneToOne: false;
            referencedRelation: "sections";
            referencedColumns: ["section_id"];
          },
        ];
      };
      partner_categories: {
        Row: {
          active: boolean;
          category_id: string;
          created_at: string;
          description: string | null;
          name: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          category_id: string;
          created_at?: string;
          description?: string | null;
          name: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          category_id?: string;
          created_at?: string;
          description?: string | null;
          name?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      submission_cures: {
        Row: {
          created_at: string;
          created_by: string | null;
          cure_id: string | null;
          custom_text: string | null;
          id: string;
          reviewed_for_library: boolean;
          sort_order: number;
          submission_problem_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          cure_id?: string | null;
          custom_text?: string | null;
          id?: string;
          reviewed_for_library?: boolean;
          sort_order?: number;
          submission_problem_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          cure_id?: string | null;
          custom_text?: string | null;
          id?: string;
          reviewed_for_library?: boolean;
          sort_order?: number;
          submission_problem_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "submission_cures_cure_id_fkey";
            columns: ["cure_id"];
            isOneToOne: false;
            referencedRelation: "action_cures";
            referencedColumns: ["cure_id"];
          },
          {
            foreignKeyName: "submission_cures_submission_problem_id_fkey";
            columns: ["submission_problem_id"];
            isOneToOne: false;
            referencedRelation: "submission_problems";
            referencedColumns: ["id"];
          },
        ];
      };
      submission_problems: {
        Row: {
          advisor_note: string | null;
          created_at: string;
          created_by: string | null;
          custom_text: string | null;
          id: string;
          problem_id: string | null;
          reviewed_for_library: boolean;
          section_id: string;
          sort_order: number;
          submission_id: string;
          updated_at: string;
        };
        Insert: {
          advisor_note?: string | null;
          created_at?: string;
          created_by?: string | null;
          custom_text?: string | null;
          id?: string;
          problem_id?: string | null;
          reviewed_for_library?: boolean;
          section_id: string;
          sort_order?: number;
          submission_id: string;
          updated_at?: string;
        };
        Update: {
          advisor_note?: string | null;
          created_at?: string;
          created_by?: string | null;
          custom_text?: string | null;
          id?: string;
          problem_id?: string | null;
          reviewed_for_library?: boolean;
          section_id?: string;
          sort_order?: number;
          submission_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "submission_problems_problem_id_fkey";
            columns: ["problem_id"];
            isOneToOne: false;
            referencedRelation: "action_problems";
            referencedColumns: ["problem_id"];
          },
          {
            foreignKeyName: "submission_problems_section_id_fkey";
            columns: ["section_id"];
            isOneToOne: false;
            referencedRelation: "sections";
            referencedColumns: ["section_id"];
          },
          {
            foreignKeyName: "submission_problems_submission_id_fkey";
            columns: ["submission_id"];
            isOneToOne: false;
            referencedRelation: "submissions";
            referencedColumns: ["submission_id"];
          },
        ];
      };
      answer_options: {
        Row: {
          active: boolean;
          answer_text: string;
          id: string;
          option_order: number;
          points: number | null;
          question_id: string;
          section_id: string | null;
          unique_id_responses: string | null;
          value_max: number | null;
          value_min: number | null;
          value_type: string | null;
        };
        Insert: {
          active?: boolean;
          answer_text: string;
          id: string;
          option_order: number;
          points?: number | null;
          question_id: string;
          section_id?: string | null;
          unique_id_responses?: string | null;
          value_max?: number | null;
          value_min?: number | null;
          value_type?: string | null;
        };
        Update: {
          active?: boolean;
          answer_text?: string;
          id?: string;
          option_order?: number;
          points?: number | null;
          question_id?: string;
          section_id?: string | null;
          unique_id_responses?: string | null;
          value_max?: number | null;
          value_min?: number | null;
          value_type?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "answer_options_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["question_id"];
          },
        ];
      };
      invite_codes: {
        Row: {
          active: boolean;
          code: string;
          created_at: string;
          label: string | null;
          plan: string;
        };
        Insert: {
          active?: boolean;
          code: string;
          created_at?: string;
          label?: string | null;
          plan?: string;
        };
        Update: {
          active?: boolean;
          code?: string;
          created_at?: string;
          label?: string | null;
          plan?: string;
        };
        Relationships: [];
      };
      multiple_schedule: {
        Row: {
          adjusted_multiple: number | null;
          adjusted_multiple_band_id: number | null;
          adjusted_points_available: number | null;
          adjusted_score: number | null;
          adjusted_score_points_increments: number | null;
          adjusted_score_range: number | null;
          adjusted_target_multiple: number | null;
          adjusted_target_multiple_band: number | null;
          adjusted_target_multiple_id: number | null;
          adjusted_target_score: number | null;
          ebitda_multiple: number | null;
          multiple: number | null;
          net_fee_income_multiple: number | null;
          objective_multiple: number | null;
          objective_multiple_band_id: number | null;
          objective_point_increments: number | null;
          objective_points_available: number | null;
          objective_score: number | null;
          objective_score_range: number | null;
          objective_target_multiple: number | null;
          objective_target_multiple_band: number | null;
          objective_target_multiple_id: number | null;
          objective_target_score: number | null;
        };
        Insert: {
          adjusted_multiple?: number | null;
          adjusted_multiple_band_id?: number | null;
          adjusted_points_available?: number | null;
          adjusted_score?: number | null;
          adjusted_score_points_increments?: number | null;
          adjusted_score_range?: number | null;
          adjusted_target_multiple?: number | null;
          adjusted_target_multiple_band?: number | null;
          adjusted_target_multiple_id?: number | null;
          adjusted_target_score?: number | null;
          ebitda_multiple?: number | null;
          multiple?: number | null;
          net_fee_income_multiple?: number | null;
          objective_multiple?: number | null;
          objective_multiple_band_id?: number | null;
          objective_point_increments?: number | null;
          objective_points_available?: number | null;
          objective_score?: number | null;
          objective_score_range?: number | null;
          objective_target_multiple?: number | null;
          objective_target_multiple_band?: number | null;
          objective_target_multiple_id?: number | null;
          objective_target_score?: number | null;
        };
        Update: {
          adjusted_multiple?: number | null;
          adjusted_multiple_band_id?: number | null;
          adjusted_points_available?: number | null;
          adjusted_score?: number | null;
          adjusted_score_points_increments?: number | null;
          adjusted_score_range?: number | null;
          adjusted_target_multiple?: number | null;
          adjusted_target_multiple_band?: number | null;
          adjusted_target_multiple_id?: number | null;
          adjusted_target_score?: number | null;
          ebitda_multiple?: number | null;
          multiple?: number | null;
          net_fee_income_multiple?: number | null;
          objective_multiple?: number | null;
          objective_multiple_band_id?: number | null;
          objective_point_increments?: number | null;
          objective_points_available?: number | null;
          objective_score?: number | null;
          objective_score_range?: number | null;
          objective_target_multiple?: number | null;
          objective_target_multiple_band?: number | null;
          objective_target_multiple_id?: number | null;
          objective_target_score?: number | null;
        };
        Relationships: [];
      };
      questions: {
        Row: {
          active: boolean;
          max_score: number | null;
          question_id: string;
          question_number: number;
          question_text: string;
          questionnaire_type: string;
          response_type: string;
          section_id: string;
          sort_order: number;
        };
        Insert: {
          active?: boolean;
          max_score?: number | null;
          question_id: string;
          question_number: number;
          question_text: string;
          questionnaire_type: string;
          response_type?: string;
          section_id: string;
          sort_order: number;
        };
        Update: {
          active?: boolean;
          max_score?: number | null;
          question_id?: string;
          question_number?: number;
          question_text?: string;
          questionnaire_type?: string;
          response_type?: string;
          section_id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "questions_section_id_fkey";
            columns: ["section_id"];
            isOneToOne: false;
            referencedRelation: "sections";
            referencedColumns: ["section_id"];
          },
        ];
      };
      responses: {
        Row: {
          answer_option_id: string;
          answered_at: string | null;
          created_at: string;
          points_awarded: number | null;
          question_id: string;
          questionnaire_type: string | null;
          response_id: string;
          section_id: string | null;
          selected_answer_text: string | null;
          submission_id: string;
          unique_id_response: string | null;
          updated_at: string;
        };
        Insert: {
          answer_option_id: string;
          answered_at?: string | null;
          created_at?: string;
          points_awarded?: number | null;
          question_id: string;
          questionnaire_type?: string | null;
          response_id: string;
          section_id?: string | null;
          selected_answer_text?: string | null;
          submission_id: string;
          unique_id_response?: string | null;
          updated_at?: string;
        };
        Update: {
          answer_option_id?: string;
          answered_at?: string | null;
          created_at?: string;
          points_awarded?: number | null;
          question_id?: string;
          questionnaire_type?: string | null;
          response_id?: string;
          section_id?: string | null;
          selected_answer_text?: string | null;
          submission_id?: string;
          unique_id_response?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "responses_answer_option_id_fkey";
            columns: ["answer_option_id"];
            isOneToOne: false;
            referencedRelation: "answer_options";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "responses_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["question_id"];
          },
          {
            foreignKeyName: "responses_submission_id_fkey";
            columns: ["submission_id"];
            isOneToOne: false;
            referencedRelation: "submissions";
            referencedColumns: ["submission_id"];
          },
        ];
      };
      score_bands: {
        Row: {
          adjusted_band: number | null;
          band_type: string;
          extra_value: string | null;
          id: string;
          label: string;
          max_score: number;
          min_score: number;
          objective_band: number | null;
          questionnaire_type: string | null;
        };
        Insert: {
          adjusted_band?: number | null;
          band_type: string;
          extra_value?: string | null;
          id: string;
          label: string;
          max_score: number;
          min_score: number;
          objective_band?: number | null;
          questionnaire_type?: string | null;
        };
        Update: {
          adjusted_band?: number | null;
          band_type?: string;
          extra_value?: string | null;
          id?: string;
          label?: string;
          max_score?: number;
          min_score?: number;
          objective_band?: number | null;
          questionnaire_type?: string | null;
        };
        Relationships: [];
      };
      section_scores: {
        Row: {
          actual_score: number | null;
          max_score: number | null;
          potential_improvement: number | null;
          questionnaire_type: string | null;
          section_id: string | null;
          section_name: string | null;
          section_score_id: string;
          submission_id: string;
        };
        Insert: {
          actual_score?: number | null;
          max_score?: number | null;
          potential_improvement?: number | null;
          questionnaire_type?: string | null;
          section_id?: string | null;
          section_name?: string | null;
          section_score_id: string;
          submission_id: string;
        };
        Update: {
          actual_score?: number | null;
          max_score?: number | null;
          potential_improvement?: number | null;
          questionnaire_type?: string | null;
          section_id?: string | null;
          section_name?: string | null;
          section_score_id?: string;
          submission_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "section_scores_submission_id_fkey";
            columns: ["submission_id"];
            isOneToOne: false;
            referencedRelation: "submissions";
            referencedColumns: ["submission_id"];
          },
        ];
      };
      sections: {
        Row: {
          active: boolean;
          max_score: number;
          questionnaire_type: string;
          section_id: string;
          section_name: string;
          sort_order: number;
        };
        Insert: {
          active?: boolean;
          max_score: number;
          questionnaire_type: string;
          section_id: string;
          section_name: string;
          sort_order: number;
        };
        Update: {
          active?: boolean;
          max_score?: number;
          questionnaire_type?: string;
          section_id?: string;
          section_name?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      valuation_multiples: {
        Row: {
          band_index: number;
          ebitda_multiple: number;
          nfi_multiple: number;
        };
        Insert: {
          band_index: number;
          ebitda_multiple: number;
          nfi_multiple: number;
        };
        Update: {
          band_index?: number;
          ebitda_multiple?: number;
          nfi_multiple?: number;
        };
        Relationships: [];
      };
      submissions: {
        Row: {
          advisor_id: string | null;
          advisor_status: string;
          client_status: string;
          client_token: string;
          company_name: string;
          created_at: string;
          owner_user_id: string | null;
          plan: string;
          submission_id: string;
          target_valuation: number | null;
          updated_at: string;
          valuation_input_amount: number | null;
          valuation_input_type: string | null;
        };
        Insert: {
          advisor_id?: string | null;
          advisor_status?: string;
          client_status?: string;
          client_token?: string;
          company_name: string;
          created_at?: string;
          owner_user_id?: string | null;
          plan?: string;
          submission_id: string;
          target_valuation?: number | null;
          updated_at?: string;
          valuation_input_amount?: number | null;
          valuation_input_type?: string | null;
        };
        Update: {
          advisor_id?: string | null;
          advisor_status?: string;
          client_status?: string;
          client_token?: string;
          company_name?: string;
          created_at?: string;
          owner_user_id?: string | null;
          plan?: string;
          submission_id?: string;
          target_valuation?: number | null;
          updated_at?: string;
          valuation_input_amount?: number | null;
          valuation_input_type?: string | null;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      advisor_reset_advisor_responses: {
        Args: { p_submission_id: string };
        Returns: undefined;
      };
      advisor_reset_client_responses: {
        Args: { p_submission_id: string };
        Returns: undefined;
      };
      advisor_unlock_submission: {
        Args: { p_submission_id: string };
        Returns: undefined;
      };
      get_client_responses: {
        Args: { p_token: string };
        Returns: {
          answer_option_id: string;
          points_awarded: number;
          question_id: string;
          questionnaire_type: string;
          section_id: string;
        }[];
      };
      get_client_submission: {
        Args: { p_token: string };
        Returns: {
          advisor_status: string;
          client_status: string;
          company_name: string;
          target_valuation: number;
          valuation_input_amount: number;
          valuation_input_type: string;
        }[];
      };
      get_my_client_submission: {
        Args: never;
        Returns: {
          client_status: string;
          client_token: string;
          company_name: string;
          submission_id: string;
        }[];
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      save_client_response: {
        Args: {
          p_answer_option_id: string;
          p_question_id: string;
          p_token: string;
        };
        Returns: undefined;
      };
      set_client_submission_status: {
        Args: { p_status: string; p_token: string };
        Returns: undefined;
      };
      set_my_client_valuation: {
        Args: { p_input_amount: number; p_input_type: string };
        Returns: undefined;
      };
      start_client_submission: {
        Args: { p_company_name: string; p_submission_id: string };
        Returns: string;
      };
      start_my_client_submission: {
        Args: { p_company_name: string };
        Returns: {
          client_status: string;
          client_token: string;
          company_name: string;
          submission_id: string;
        }[];
      };
      submit_my_client_submission: { Args: never; Returns: undefined };
      update_client_valuation_inputs: {
        Args: {
          p_input_amount: number;
          p_input_type: string;
          p_target: number;
          p_token: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      app_role: "advisor" | "client" | "admin";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["advisor", "client", "admin"],
    },
  },
} as const;
