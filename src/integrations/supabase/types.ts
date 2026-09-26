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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      admin_action_logs: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          details: Json | null
          id: string
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          details?: Json | null
          id?: string
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          target_user_id?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          staff_id: string | null
          staff_name: string | null
          store_id: string
          table_name: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          staff_id?: string | null
          staff_name?: string | null
          store_id: string
          table_name: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          staff_id?: string | null
          staff_name?: string | null
          store_id?: string
          table_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_banking_deposits: {
        Row: {
          account_name: string | null
          account_number: string | null
          amount: number
          bank_name: string
          cash_transaction_id: string | null
          created_at: string
          created_by: string | null
          id: string
          ledger_entry_id: string | null
          notes: string | null
          receipt_url: string | null
          store_id: string
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          amount: number
          bank_name: string
          cash_transaction_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          ledger_entry_id?: string | null
          notes?: string | null
          receipt_url?: string | null
          store_id: string
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          amount?: number
          bank_name?: string
          cash_transaction_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          ledger_entry_id?: string | null
          notes?: string | null
          receipt_url?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_banking_deposits_cash_transaction_id_fkey"
            columns: ["cash_transaction_id"]
            isOneToOne: false
            referencedRelation: "cash_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_banking_deposits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_banking_deposits_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_transactions: {
        Row: {
          account_type: string | null
          amount: number
          created_at: string
          description: string | null
          id: string
          store_id: string
          type: string
          user_id: string
        }
        Insert: {
          account_type?: string | null
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          store_id: string
          type: string
          user_id: string
        }
        Update: {
          account_type?: string | null
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          store_id?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_transactions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_deletions: {
        Row: {
          deleted_at: string
          id: string
          peer_id: string
          scope: string
          user_id: string
        }
        Insert: {
          deleted_at?: string
          id?: string
          peer_id: string
          scope: string
          user_id: string
        }
        Update: {
          deleted_at?: string
          id?: string
          peer_id?: string
          scope?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_deletions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          store_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          store_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_transactions: {
        Row: {
          amount: number
          created_at: string
          customer_id: string
          description: string | null
          id: string
          reference_id: string | null
          store_id: string
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          customer_id: string
          description?: string | null
          id?: string
          reference_id?: string | null
          store_id: string
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string
          description?: string | null
          id?: string
          reference_id?: string | null
          store_id?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_transactions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          credit_limit: number
          email: string | null
          full_name: string
          id: string
          loyalty_points: number
          notes: string | null
          phone: string | null
          store_id: string
          total_spent: number
          unpaid_balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          credit_limit?: number
          email?: string | null
          full_name: string
          id?: string
          loyalty_points?: number
          notes?: string | null
          phone?: string | null
          store_id: string
          total_spent?: number
          unpaid_balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          credit_limit?: number
          email?: string | null
          full_name?: string
          id?: string
          loyalty_points?: number
          notes?: string | null
          phone?: string | null
          store_id?: string
          total_spent?: number
          unpaid_balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          date_of_expense: string
          description: string
          id: string
          payment_method: string
          receipt_url: string | null
          store_id: string
          user_id: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          date_of_expense: string
          description: string
          id?: string
          payment_method: string
          receipt_url?: string | null
          store_id: string
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          date_of_expense?: string
          description?: string
          id?: string
          payment_method?: string
          receipt_url?: string | null
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          barcode: string | null
          barcode_mode: string | null
          barcode_type: string | null
          category: string
          cost_per_unit: number
          created_at: string
          date_of_purchase: string
          id: string
          items_per_sachet: number | null
          loose_item_price: number | null
          loose_items: number | null
          min_stock_level: number | null
          notes: string | null
          opened_sachets: number | null
          packaging_type: string | null
          product_image: string | null
          product_name: string
          quantity: number
          reorder_quantity: number | null
          retail_price: number | null
          sachets_count: number | null
          size: string | null
          store_id: string
          supplier_id: string | null
          supplier_name: string | null
          total_value: number
          unit_name: string | null
          user_id: string
          wholesale_price: number | null
        }
        Insert: {
          barcode?: string | null
          barcode_mode?: string | null
          barcode_type?: string | null
          category: string
          cost_per_unit: number
          created_at?: string
          date_of_purchase: string
          id?: string
          items_per_sachet?: number | null
          loose_item_price?: number | null
          loose_items?: number | null
          min_stock_level?: number | null
          notes?: string | null
          opened_sachets?: number | null
          packaging_type?: string | null
          product_image?: string | null
          product_name: string
          quantity: number
          reorder_quantity?: number | null
          retail_price?: number | null
          sachets_count?: number | null
          size?: string | null
          store_id: string
          supplier_id?: string | null
          supplier_name?: string | null
          total_value: number
          unit_name?: string | null
          user_id: string
          wholesale_price?: number | null
        }
        Update: {
          barcode?: string | null
          barcode_mode?: string | null
          barcode_type?: string | null
          category?: string
          cost_per_unit?: number
          created_at?: string
          date_of_purchase?: string
          id?: string
          items_per_sachet?: number | null
          loose_item_price?: number | null
          loose_items?: number | null
          min_stock_level?: number | null
          notes?: string | null
          opened_sachets?: number | null
          packaging_type?: string | null
          product_image?: string | null
          product_name?: string
          quantity?: number
          reorder_quantity?: number | null
          retail_price?: number | null
          sachets_count?: number | null
          size?: string | null
          store_id?: string
          supplier_id?: string | null
          supplier_name?: string | null
          total_value?: number
          unit_name?: string | null
          user_id?: string
          wholesale_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_payments: {
        Row: {
          amount_paid: number
          created_at: string
          id: string
          loan_id: string
          payment_date: string
          user_id: string
        }
        Insert: {
          amount_paid: number
          created_at?: string
          id?: string
          loan_id: string
          payment_date?: string
          user_id: string
        }
        Update: {
          amount_paid?: number
          created_at?: string
          id?: string
          loan_id?: string
          payment_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_payments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "stock_loans"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          created_at: string | null
          id: string
          message: string
          read: boolean | null
          receiver_id: string
          sender_id: string
          store_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          read?: boolean | null
          receiver_id: string
          sender_id: string
          store_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          read?: boolean | null
          receiver_id?: string
          sender_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          data: Json | null
          id: string
          message: string
          read: boolean | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          data?: Json | null
          id?: string
          message: string
          read?: boolean | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          data?: Json | null
          id?: string
          message?: string
          read?: boolean | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          store_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          store_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          created_at: string
          id: string
          inventory_id: string
          quantity: number
          store_id: string
          user_id: string
          variant_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_id: string
          quantity?: number
          store_id: string
          user_id: string
          variant_name: string
        }
        Update: {
          created_at?: string
          id?: string
          inventory_id?: string
          quantity?: number
          store_id?: string
          user_id?: string
          variant_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          color_scheme: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          status: string
          theme: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          color_scheme?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          status?: string
          theme?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          color_scheme?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          status?: string
          theme?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sales: {
        Row: {
          created_at: string
          customer_id: string | null
          customer_name: string
          date_of_sale: string
          id: string
          paid_in_cash: boolean | null
          products: Json
          staff_id: string | null
          store_id: string
          total_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          customer_name: string
          date_of_sale: string
          id?: string
          paid_in_cash?: boolean | null
          products: Json
          staff_id?: string | null
          store_id: string
          total_amount: number
          user_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          date_of_sale?: string
          id?: string
          paid_in_cash?: boolean | null
          products?: Json
          staff_id?: string | null
          store_id?: string
          total_amount?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          approval_notes: string | null
          approval_status: string
          approved_by: string | null
          created_at: string
          end_time: string | null
          ending_cash_actual: number | null
          ending_cash_expected: number | null
          id: string
          notes: string | null
          staff_id: string | null
          start_time: string
          starting_cash: number
          status: string
          store_id: string
          user_id: string
        }
        Insert: {
          approval_notes?: string | null
          approval_status?: string
          approved_by?: string | null
          created_at?: string
          end_time?: string | null
          ending_cash_actual?: number | null
          ending_cash_expected?: number | null
          id?: string
          notes?: string | null
          staff_id?: string | null
          start_time?: string
          starting_cash?: number
          status?: string
          store_id: string
          user_id: string
        }
        Update: {
          approval_notes?: string | null
          approval_status?: string
          approved_by?: string | null
          created_at?: string
          end_time?: string | null
          ending_cash_actual?: number | null
          ending_cash_expected?: number | null
          id?: string
          notes?: string | null
          staff_id?: string | null
          start_time?: string
          starting_cash?: number
          status?: string
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      sizes: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          store_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          store_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sizes_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          allowed_pages: Json | null
          created_at: string
          employee_id: string | null
          full_name: string
          hourly_rate: number | null
          id: string
          pin_hash: string | null
          role: string
          sales_count: number | null
          status: string
          store_id: string
          total_sales: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed_pages?: Json | null
          created_at?: string
          employee_id?: string | null
          full_name: string
          hourly_rate?: number | null
          id?: string
          pin_hash?: string | null
          role?: string
          sales_count?: number | null
          status?: string
          store_id: string
          total_sales?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed_pages?: Json | null
          created_at?: string
          employee_id?: string | null
          full_name?: string
          hourly_rate?: number | null
          id?: string
          pin_hash?: string | null
          role?: string
          sales_count?: number | null
          status?: string
          store_id?: string
          total_sales?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_loans: {
        Row: {
          amount_paid: number
          balance: number
          cost_per_unit: number
          created_at: string
          date_of_purchase: string
          id: string
          product_name: string
          quantity: number
          status: string
          store_id: string
          supplier: string
          total_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_paid?: number
          balance: number
          cost_per_unit: number
          created_at?: string
          date_of_purchase: string
          id?: string
          product_name: string
          quantity: number
          status?: string
          store_id: string
          supplier: string
          total_amount: number
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_paid?: number
          balance?: number
          cost_per_unit?: number
          created_at?: string
          date_of_purchase?: string
          id?: string
          product_name?: string
          quantity?: number
          status?: string
          store_id?: string
          supplier?: string
          total_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stock_transfers: {
        Row: {
          cost_per_unit: number
          created_at: string | null
          from_store_id: string
          from_user_id: string
          id: string
          product_name: string
          quantity: number
          status: string
          to_store_id: string
          to_user_id: string
          updated_at: string | null
        }
        Insert: {
          cost_per_unit: number
          created_at?: string | null
          from_store_id: string
          from_user_id: string
          id?: string
          product_name: string
          quantity: number
          status?: string
          to_store_id: string
          to_user_id: string
          updated_at?: string | null
        }
        Update: {
          cost_per_unit?: number
          created_at?: string | null
          from_store_id?: string
          from_user_id?: string
          id?: string
          product_name?: string
          quantity?: number
          status?: string
          to_store_id?: string
          to_user_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_from_store_id_fkey"
            columns: ["from_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_to_store_id_fkey"
            columns: ["to_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_access: {
        Row: {
          created_at: string
          granted_by: string
          id: string
          role: string
          store_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by: string
          id?: string
          role?: string
          store_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string
          id?: string
          role?: string
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_access_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          created_at: string
          currency: string
          id: string
          last_closing_balance: number | null
          store_name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          last_closing_balance?: number | null
          store_name: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          last_closing_balance?: number | null
          store_name?: string
          user_id?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          bonus_days: number | null
          created_at: string
          currency: string
          description: string | null
          duration_days: number
          features: Json | null
          id: string
          is_active: boolean | null
          is_trial: boolean | null
          name: string
          price: number
        }
        Insert: {
          bonus_days?: number | null
          created_at?: string
          currency?: string
          description?: string | null
          duration_days: number
          features?: Json | null
          id?: string
          is_active?: boolean | null
          is_trial?: boolean | null
          name: string
          price?: number
        }
        Update: {
          bonus_days?: number | null
          created_at?: string
          currency?: string
          description?: string | null
          duration_days?: number
          features?: Json | null
          id?: string
          is_active?: boolean | null
          is_trial?: boolean | null
          name?: string
          price?: number
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          address: string | null
          company: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          outstanding_balance: number
          phone: string | null
          store_id: string
          total_supplied: number
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          outstanding_balance?: number
          phone?: string | null
          store_id: string
          total_supplied?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          outstanding_balance?: number
          phone?: string | null
          store_id?: string
          total_supplied?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_configurations: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          rate: number
          store_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          rate?: number
          store_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          rate?: number
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_configurations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
        tracker_documents: {
          Row: {
            account_name: string | null
            account_type: string | null
            amount: number | null
            created_at: string
            document_date: string
            file_name: string | null
            file_path: string | null
            file_size: number | null
            file_type: string | null
            id: string
            kind: string
            notes: string | null
            payee: string | null
            period_end: string | null
            period_start: string | null
            reference: string | null
            status: string
            store_id: string
            title: string
            updated_at: string
            user_id: string | null
          }
          Insert: {
            account_name?: string | null
            account_type?: string | null
            amount?: number | null
            created_at?: string
            document_date?: string
            file_name?: string | null
            file_path?: string | null
            file_size?: number | null
            file_type?: string | null
            id?: string
            kind: string
            notes?: string | null
            payee?: string | null
            period_end?: string | null
            period_start?: string | null
            reference?: string | null
            status?: string
            store_id: string
            title: string
            updated_at?: string
            user_id?: string | null
          }
          Update: {
            account_name?: string | null
            account_type?: string | null
            amount?: number | null
            created_at?: string
            document_date?: string
            file_name?: string | null
            file_path?: string | null
            file_size?: number | null
            file_type?: string | null
            id?: string
            kind?: string
            notes?: string | null
            payee?: string | null
            period_end?: string | null
            period_start?: string | null
            reference?: string | null
            status?: string
            store_id?: string
            title?: string
            updated_at?: string
            user_id?: string | null
          }
          Relationships: [
            {
              foreignKeyName: "tracker_documents_store_id_fkey"
              columns: ["store_id"]
              isOneToOne: false
              referencedRelation: "stores"
              referencedColumns: ["id"]
            },
            {
              foreignKeyName: "tracker_documents_user_id_fkey"
              columns: ["user_id"]
              isOneToOne: false
              referencedRelation: "users"
              referencedColumns: ["id"]
            },
          ]
        }
        user_activity: {
          Row: {
            action: string
          created_at: string
          device: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          device?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          device?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
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
          role?: Database["public"]["Enums"]["app_role"]
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
      user_subscriptions: {
        Row: {
          amount_paid: number | null
          created_at: string
          expires_at: string
          id: string
          payment_reference: string | null
          plan_id: string | null
          starts_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_paid?: number | null
          created_at?: string
          expires_at: string
          id?: string
          payment_reference?: string | null
          plan_id?: string | null
          starts_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_paid?: number | null
          created_at?: string
          expires_at?: string
          id?: string
          payment_reference?: string | null
          plan_id?: string | null
          starts_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bank_cash_to_account: {
        Args: {
          p_account_id?: string | null
          p_account_name?: string | null
          p_account_number?: string | null
          p_amount: number
          p_bank_name: string
          p_notes?: string | null
          p_receipt_url?: string | null
          p_store_id: string
        }
        Returns: string
      }
      clear_branch_data: {
        Args: {
          p_confirm?: string | null
          p_password: string
          p_scope?: string
          p_store_id: string
        }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_store_access: {
        Args: { _store_id: string; _user_id: string }
        Returns: boolean
      }
      is_store_owner: {
        Args: { _store_id: string; _user_id: string }
        Returns: boolean
      }
      lookup_store_for_linking: {
        Args: { _store_id: string }
        Returns: {
          id: string
          store_name: string
          user_id: string
        }[]
      }
      verify_pin_hash: {
        Args: { _pin_hash: string; _pin_input: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "user"
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
      app_role: ["admin", "manager", "user"],
    },
  },
} as const
