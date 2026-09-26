
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "couples": {
                  Row: {
                    "created_at": string,"dissolved_at": string | null,"id": string
                  }
                  Insert: {
                    "created_at"?: string,"dissolved_at"?: string | null,"id"?: string
                  }
                  Update: {
                    "created_at"?: string,"dissolved_at"?: string | null,"id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ingredients": {
                  Row: {
                    "canonical_name": string,"category": string,"id": number,"parent_id": number | null
                  }
                  Insert: {
                    "canonical_name": string,"category"?: string,"id"?: number,"parent_id"?: number | null
                  }
                  Update: {
                    "canonical_name"?: string,"category"?: string,"id"?: number,"parent_id"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ingredients_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "ingredients"
      referencedColumns: ["id"]
    }
                  ]
                },"matches": {
                  Row: {
                    "couple_id": string,"created_at": string,"recipe_id": number,"removed_at": string | null
                  }
                  Insert: {
                    "couple_id": string,"created_at"?: string,"recipe_id": number,"removed_at"?: string | null
                  }
                  Update: {
                    "couple_id"?: string,"created_at"?: string,"recipe_id"?: number,"removed_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "matches_couple_id_fkey"
      columns: ["couple_id"]
isOneToOne: false
      referencedRelation: "couples"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "matches_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    }
                  ]
                },"pairing_codes": {
                  Row: {
                    "code": string,"created_at": string,"expires_at": string,"owner_id": string,"used_at": string | null
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"expires_at": string,"owner_id": string,"used_at"?: string | null
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"expires_at"?: string,"owner_id"?: string,"used_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pairing_codes_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"pairing_invites": {
                  Row: {
                    "created_at": string,"from_user_id": string,"id": string,"status": string,"to_email": string
                  }
                  Insert: {
                    "created_at"?: string,"from_user_id": string,"id"?: string,"status"?: string,"to_email": string
                  }
                  Update: {
                    "created_at"?: string,"from_user_id"?: string,"id"?: string,"status"?: string,"to_email"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pairing_invites_from_user_id_fkey"
      columns: ["from_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "couple_id": string | null,"created_at": string,"display_name": string,"email": string,"id": string,"onboarded": boolean
                  }
                  Insert: {
                    "couple_id"?: string | null,"created_at"?: string,"display_name": string,"email": string,"id": string,"onboarded"?: boolean
                  }
                  Update: {
                    "couple_id"?: string | null,"created_at"?: string,"display_name"?: string,"email"?: string,"id"?: string,"onboarded"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_couple_id_fkey"
      columns: ["couple_id"]
isOneToOne: false
      referencedRelation: "couples"
      referencedColumns: ["id"]
    }
                  ]
                },"recipe_ingredients": {
                  Row: {
                    "id": number,"ingredient_id": number,"measure": string | null,"name": string | null,"position": number,"raw_text": string,"recipe_id": number
                  }
                  Insert: {
                    "id"?: number,"ingredient_id": number,"measure"?: string | null,"name"?: string | null,"position"?: number,"raw_text": string,"recipe_id": number
                  }
                  Update: {
                    "id"?: number,"ingredient_id"?: number,"measure"?: string | null,"name"?: string | null,"position"?: number,"raw_text"?: string,"recipe_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_ingredients_ingredient_id_fkey"
      columns: ["ingredient_id"]
isOneToOne: false
      referencedRelation: "ingredients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipe_ingredients_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    }
                  ]
                },"recipes": {
                  Row: {
                    "category": string | null,"cook_time_estimated": boolean,"cook_time_min": number | null,"created_at": string,"cuisine": string | null,"id": number,"image_url": string | null,"instructions": (string)[],"source": string,"source_id": string,"title": string
                  }
                  Insert: {
                    "category"?: string | null,"cook_time_estimated"?: boolean,"cook_time_min"?: number | null,"created_at"?: string,"cuisine"?: string | null,"id"?: number,"image_url"?: string | null,"instructions"?: (string)[],"source": string,"source_id": string,"title": string
                  }
                  Update: {
                    "category"?: string | null,"cook_time_estimated"?: boolean,"cook_time_min"?: number | null,"created_at"?: string,"cuisine"?: string | null,"id"?: number,"image_url"?: string | null,"instructions"?: (string)[],"source"?: string,"source_id"?: string,"title"?: string
                  }
                  Relationships: [
                    
                  ]
                },"swipes": {
                  Row: {
                    "context": string,"created_at": string,"id": number,"liked": boolean,"recipe_id": number,"session_id": string | null,"user_id": string
                  }
                  Insert: {
                    "context": string,"created_at"?: string,"id"?: never,"liked": boolean,"recipe_id": number,"session_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "context"?: string,"created_at"?: string,"id"?: never,"liked"?: boolean,"recipe_id"?: number,"session_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "swipes_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "swipes_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "tonight_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "swipes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"tonight_participants": {
                  Row: {
                    "rank_done": boolean,"session_id": string,"swipe_done": boolean,"user_id": string
                  }
                  Insert: {
                    "rank_done"?: boolean,"session_id": string,"swipe_done"?: boolean,"user_id": string
                  }
                  Update: {
                    "rank_done"?: boolean,"session_id"?: string,"swipe_done"?: boolean,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tonight_participants_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "tonight_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tonight_participants_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"tonight_rankings": {
                  Row: {
                    "rank": number,"recipe_id": number,"session_id": string,"user_id": string
                  }
                  Insert: {
                    "rank": number,"recipe_id": number,"session_id": string,"user_id": string
                  }
                  Update: {
                    "rank"?: number,"recipe_id"?: number,"session_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tonight_rankings_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tonight_rankings_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "tonight_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tonight_rankings_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"tonight_sessions": {
                  Row: {
                    "completed_at": string | null,"couple_id": string,"created_at": string,"filters": NonNullable<Json>,"id": string,"started_by": string,"status": string,"winner_recipe_id": number | null
                  }
                  Insert: {
                    "completed_at"?: string | null,"couple_id": string,"created_at"?: string,"filters"?: NonNullable<Json>,"id"?: string,"started_by": string,"status"?: string,"winner_recipe_id"?: number | null
                  }
                  Update: {
                    "completed_at"?: string | null,"couple_id"?: string,"created_at"?: string,"filters"?: NonNullable<Json>,"id"?: string,"started_by"?: string,"status"?: string,"winner_recipe_id"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tonight_sessions_couple_id_fkey"
      columns: ["couple_id"]
isOneToOne: false
      referencedRelation: "couples"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tonight_sessions_started_by_fkey"
      columns: ["started_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tonight_sessions_winner_recipe_id_fkey"
      columns: ["winner_recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    }
                  ]
                },"user_excluded_ingredients": {
                  Row: {
                    "created_at": string,"ingredient_id": number,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"ingredient_id": number,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"ingredient_id"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_excluded_ingredients_ingredient_id_fkey"
      columns: ["ingredient_id"]
isOneToOne: false
      referencedRelation: "ingredients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_excluded_ingredients_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "visible_matches": {
                  Row: {
                    "couple_id": string | null,"created_at": string | null,"recipe_id": number | null
                  }
                  Insert: {
                           "couple_id"?: string | null,"created_at"?: string | null,"recipe_id"?: number | null
                         }
                        Update: {
                           "couple_id"?: string | null,"created_at"?: string | null,"recipe_id"?: number | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "matches_couple_id_fkey"
      columns: ["couple_id"]
isOneToOne: false
      referencedRelation: "couples"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "matches_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "create_pairing_code":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"discover_swipe":
{ Args: { "p_liked": boolean,"p_recipe_id": number }; Returns: Json
                           },
"my_pending_invites":
{ Args: Record<PropertyKey, never>; Returns: {
              "from_name": string,"invite_id": string,"sent_at": string
            }[]
                           },
"redeem_pairing_code":
{ Args: { "p_code": string }; Returns: Json
                           },
"remove_match":
{ Args: { "p_recipe_id": number }; Returns: undefined
                           },
"respond_pairing_invite":
{ Args: { "p_accept": boolean,"p_invite_id": string }; Returns: Json
                           },
"send_pairing_invite":
{ Args: { "p_email": string }; Returns: string
                           },
"undo_last_discover_swipe":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"unpair":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const

