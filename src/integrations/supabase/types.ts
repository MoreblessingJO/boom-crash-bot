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
      agent_paper_ledgers: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          is_active: boolean
          paper_balance: number
          starting_balance: number
          updated_at: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          paper_balance?: number
          starting_balance?: number
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          paper_balance?: number
          starting_balance?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_paper_ledgers_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agent_performance"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "agent_paper_ledgers_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          avg_trades_per_day: number
          created_at: string
          description: string
          id: string
          market: string
          name: string
          risk_level: string
          slug: string
          sort_order: number
          status: string
          strategy_key: string
          strategy_params: Json
          tagline: string
        }
        Insert: {
          avg_trades_per_day?: number
          created_at?: string
          description: string
          id?: string
          market: string
          name: string
          risk_level?: string
          slug: string
          sort_order?: number
          status?: string
          strategy_key: string
          strategy_params?: Json
          tagline: string
        }
        Update: {
          avg_trades_per_day?: number
          created_at?: string
          description?: string
          id?: string
          market?: string
          name?: string
          risk_level?: string
          slug?: string
          sort_order?: number
          status?: string
          strategy_key?: string
          strategy_params?: Json
          tagline?: string
        }
        Relationships: []
      }
      alert_log: {
        Row: {
          alert_type: string
          channel: string
          id: string
          message: string
          sent_at: string
        }
        Insert: {
          alert_type: string
          channel: string
          id?: string
          message: string
          sent_at?: string
        }
        Update: {
          alert_type?: string
          channel?: string
          id?: string
          message?: string
          sent_at?: string
        }
        Relationships: []
      }
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
      live_trade_audit: {
        Row: {
          contract_id: string | null
          created_at: string
          entry: number | null
          event: string
          exit_price: number | null
          id: string
          pnl: number | null
          position_id: string | null
          settings_snapshot: Json | null
          stake: number
          symbol: string
        }
        Insert: {
          contract_id?: string | null
          created_at?: string
          entry?: number | null
          event: string
          exit_price?: number | null
          id?: string
          pnl?: number | null
          position_id?: string | null
          settings_snapshot?: Json | null
          stake: number
          symbol: string
        }
        Update: {
          contract_id?: string | null
          created_at?: string
          entry?: number | null
          event?: string
          exit_price?: number | null
          id?: string
          pnl?: number | null
          position_id?: string | null
          settings_snapshot?: Json | null
          stake?: number
          symbol?: string
        }
        Relationships: []
      }
      positions: {
        Row: {
          agent_id: string | null
          client_req_id: string | null
          closed_at: string | null
          closed_epoch: number | null
          confidence: number | null
          deriv_contract_id: string | null
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
          agent_id?: string | null
          client_req_id?: string | null
          closed_at?: string | null
          closed_epoch?: number | null
          confidence?: number | null
          deriv_contract_id?: string | null
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
          agent_id?: string | null
          client_req_id?: string | null
          closed_at?: string | null
          closed_epoch?: number | null
          confidence?: number | null
          deriv_contract_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "positions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_performance"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "positions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          daily_loss_limit: number | null
          enabled_symbols: string[]
          external_worker_enabled: boolean
          halt_engine: boolean
          id: number
          is_live: boolean
          kill_switch: boolean
          late_entry_ratio: number
          learning_enabled: boolean
          max_daily_loss: number
          max_hold_ratio: number
          max_open_positions: number | null
          max_stake_pct_equity: number | null
          max_stake_per_trade: number | null
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
          daily_loss_limit?: number | null
          enabled_symbols?: string[]
          external_worker_enabled?: boolean
          halt_engine?: boolean
          id?: number
          is_live?: boolean
          kill_switch?: boolean
          late_entry_ratio?: number
          learning_enabled?: boolean
          max_daily_loss?: number
          max_hold_ratio?: number
          max_open_positions?: number | null
          max_stake_pct_equity?: number | null
          max_stake_per_trade?: number | null
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
          daily_loss_limit?: number | null
          enabled_symbols?: string[]
          external_worker_enabled?: boolean
          halt_engine?: boolean
          id?: number
          is_live?: boolean
          kill_switch?: boolean
          late_entry_ratio?: number
          learning_enabled?: boolean
          max_daily_loss?: number
          max_hold_ratio?: number
          max_open_positions?: number | null
          max_stake_pct_equity?: number | null
          max_stake_per_trade?: number | null
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
          agent_id: string | null
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
          agent_id?: string | null
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
          agent_id?: string | null
          confidence?: number
          created_at?: string
          direction?: string | null
          id?: number
          reason?: string | null
          regime?: string
          symbol?: string
        }
        Relationships: [
          {
            foreignKeyName: "signals_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_performance"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "signals_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      symbol_state: {
        Row: {
          ema_fast: number
          ema_slow: number
          last_buy_at: string | null
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
          last_buy_at?: string | null
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
          last_buy_at?: string | null
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
      user_agent_selections: {
        Row: {
          agent_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_agent_selections_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_performance"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "user_agent_selections_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      user_deriv_accounts: {
        Row: {
          account_type: string
          connected_at: string
          created_at: string
          currency: string | null
          deriv_loginid: string
          encrypted_token: string
          id: string
          is_active: boolean
          scopes: string[]
          token_iv: string
          token_tag: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_type: string
          connected_at?: string
          created_at?: string
          currency?: string | null
          deriv_loginid: string
          encrypted_token: string
          id?: string
          is_active?: boolean
          scopes?: string[]
          token_iv: string
          token_tag: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_type?: string
          connected_at?: string
          created_at?: string
          currency?: string | null
          deriv_loginid?: string
          encrypted_token?: string
          id?: string
          is_active?: boolean
          scopes?: string[]
          token_iv?: string
          token_tag?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      agent_performance: {
        Row: {
          agent_id: string | null
          avg_loss: number | null
          avg_win: number | null
          best_trade: number | null
          current_balance: number | null
          last_trade_at: string | null
          losses: number | null
          market: string | null
          name: string | null
          net_pnl: number | null
          return_pct: number | null
          slug: string | null
          starting_balance: number | null
          status: string | null
          trades: number | null
          win_rate: number | null
          wins: number | null
          worst_trade: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      today_pnl: { Args: never; Returns: number }
    }
    Enums: {
      app_role: "owner" | "admin" | "user"
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
    Enums: {
      app_role: ["owner", "admin", "user"],
    },
  },
} as const
