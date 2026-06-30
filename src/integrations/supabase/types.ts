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
      engine_heartbeat: {
        Row: {
          id: number
          last_tick_epoch: number | null
          status: string
          symbols_connected: number
          updated_at: string
        }
        Insert: {
          id?: number
          last_tick_epoch?: number | null
          status?: string
          symbols_connected?: number
          updated_at?: string
        }
        Update: {
          id?: number
          last_tick_epoch?: number | null
          status?: string
          symbols_connected?: number
          updated_at?: string
        }
        Relationships: []
      }
      engine_runs: {
        Row: {
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          id: number
          started_at: string
          symbols_scanned: number
          trades_closed: number
          trades_opened: number
        }
        Insert: {
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: number
          started_at?: string
          symbols_scanned?: number
          trades_closed?: number
          trades_opened?: number
        }
        Update: {
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: number
          started_at?: string
          symbols_scanned?: number
          trades_closed?: number
          trades_opened?: number
        }
        Relationships: []
      }
      learning_buckets: {
        Row: {
          bucket_key: string
          direction: string
          disabled: boolean
          ewma_r: number
          losses: number
          regime: string
          symbol: string
          trades: number
          updated_at: string
          wins: number
        }
        Insert: {
          bucket_key: string
          direction: string
          disabled?: boolean
          ewma_r?: number
          losses?: number
          regime: string
          symbol: string
          trades?: number
          updated_at?: string
          wins?: number
        }
        Update: {
          bucket_key?: string
          direction?: string
          disabled?: boolean
          ewma_r?: number
          losses?: number
          regime?: string
          symbol?: string
          trades?: number
          updated_at?: string
          wins?: number
        }
        Relationships: []
      }
      positions: {
        Row: {
          closed_at: string | null
          closed_epoch: number | null
          confidence: number | null
          entry_price: number
          exit_price: number | null
          exit_reason: string | null
          id: string
          opened_at: string
          opened_epoch: number
          pnl: number | null
          realized_r: number | null
          reason: string | null
          regime: string
          side: string
          sl_r: number
          stake: number
          status: string
          symbol: string
          tp_r: number
          unit: number
        }
        Insert: {
          closed_at?: string | null
          closed_epoch?: number | null
          confidence?: number | null
          entry_price: number
          exit_price?: number | null
          exit_reason?: string | null
          id?: string
          opened_at?: string
          opened_epoch: number
          pnl?: number | null
          realized_r?: number | null
          reason?: string | null
          regime: string
          side: string
          sl_r: number
          stake: number
          status?: string
          symbol: string
          tp_r: number
          unit: number
        }
        Update: {
          closed_at?: string | null
          closed_epoch?: number | null
          confidence?: number | null
          entry_price?: number
          exit_price?: number | null
          exit_reason?: string | null
          id?: string
          opened_at?: string
          opened_epoch?: number
          pnl?: number | null
          realized_r?: number | null
          reason?: string | null
          regime?: string
          side?: string
          sl_r?: number
          stake?: number
          status?: string
          symbol?: string
          tp_r?: number
          unit?: number
        }
        Relationships: []
      }
      settings: {
        Row: {
          enabled_symbols: string[]
          external_worker_enabled: boolean
          id: number
          kill_switch: boolean
          late_entry_ratio: number
          learning_enabled: boolean
          max_daily_loss: number
          max_hold_ratio: number
          mode: string
          paper_balance: number
          pre_spike_ratio: number
          risk_pct: number
          sl_r: number
          stake: number
          tp_r: number
          updated_at: string
        }
        Insert: {
          enabled_symbols?: string[]
          external_worker_enabled?: boolean
          id?: number
          kill_switch?: boolean
          late_entry_ratio?: number
          learning_enabled?: boolean
          max_daily_loss?: number
          max_hold_ratio?: number
          mode?: string
          paper_balance?: number
          pre_spike_ratio?: number
          risk_pct?: number
          sl_r?: number
          stake?: number
          tp_r?: number
          updated_at?: string
        }
        Update: {
          enabled_symbols?: string[]
          external_worker_enabled?: boolean
          id?: number
          kill_switch?: boolean
          late_entry_ratio?: number
          learning_enabled?: boolean
          max_daily_loss?: number
          max_hold_ratio?: number
          mode?: string
          paper_balance?: number
          pre_spike_ratio?: number
          risk_pct?: number
          sl_r?: number
          stake?: number
          tp_r?: number
          updated_at?: string
        }
        Relationships: []
      }
      signals: {
        Row: {
          acted: boolean
          confidence: number
          created_at: string
          direction: string | null
          id: number
          reason: string | null
          regime: string
          symbol: string
        }
        Insert: {
          acted?: boolean
          confidence?: number
          created_at?: string
          direction?: string | null
          id?: number
          reason?: string | null
          regime: string
          symbol: string
        }
        Update: {
          acted?: boolean
          confidence?: number
          created_at?: string
          direction?: string | null
          id?: number
          reason?: string | null
          regime?: string
          symbol?: string
        }
        Relationships: []
      }
      symbol_state: {
        Row: {
          ema_fast: number
          ema_slow: number
          last_epoch: number | null
          last_price: number | null
          last_spike_epoch: number | null
          median_abs_change: number
          recent_ticks: Json
          rsi: number
          symbol: string
          ticks_since_spike: number
          updated_at: string
        }
        Insert: {
          ema_fast?: number
          ema_slow?: number
          last_epoch?: number | null
          last_price?: number | null
          last_spike_epoch?: number | null
          median_abs_change?: number
          recent_ticks?: Json
          rsi?: number
          symbol: string
          ticks_since_spike?: number
          updated_at?: string
        }
        Update: {
          ema_fast?: number
          ema_slow?: number
          last_epoch?: number | null
          last_price?: number | null
          last_spike_epoch?: number | null
          median_abs_change?: number
          recent_ticks?: Json
          rsi?: number
          symbol?: string
          ticks_since_spike?: number
          updated_at?: string
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
