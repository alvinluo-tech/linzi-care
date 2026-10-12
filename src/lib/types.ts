/**
 * 与 supabase/migrations 中的表结构保持一致。
 * Relationships 供 supabase-js 解析关联查询（嵌入资源）。
 * 部署后可用 `supabase gen types typescript` 重新生成本文件。
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Relationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

/** 指向外键表的外键关系（单列 id 主键） */
type Rel<
  Target extends string,
  Col extends string,
  Key extends string = `${Col}_fkey`,
> = {
  foreignKeyName: Key;
  columns: [Col];
  isOneToOne: false;
  referencedRelation: Target;
  referencedColumns: ["id"];
};

type Table<Row, Rel2 extends Relationship[] = []> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: Rel2;
};

export interface Database {
  public: {
    Tables: {
      stores: Table<{
        id: string;
        name: string;
        address: string | null;
        phone: string | null;
        created_at: string;
      }>;

      profiles: Table<{
        id: string;
        display_name: string | null;
        email: string | null;
        phone: string | null;
        role: string;
        store_id: string | null;
        created_at: string;
      }>;

      user_roles: Table<{
        id: string;
        user_id: string;
        role: string;
        created_at: string;
      }>;

      members: Table<{
        id: string;
        user_id: string | null;
        name: string;
        phone: string | null;
        email: string | null;
        balance: number;
        store_id: string | null;
        is_active: boolean;
        note: string | null;
        created_at: string;
      }>;

      staff: Table<{
        id: string;
        user_id: string | null;
        name: string;
        title: string | null;
        bio: string | null;
        avatar_url: string | null;
        store_id: string | null;
        is_active: boolean;
        sort_order: number;
        created_at: string;
      }>;

      services: Table<{
        id: string;
        name: string;
        description: string | null;
        duration: number;
        price: number;
        member_price: number | null;
        image_url: string | null;
        category: string | null;
        store_id: string | null;
        is_active: boolean;
        sort_order: number;
        created_at: string;
      }>;

      staff_services: Table<
        { staff_id: string; service_id: string },
        [Rel<"staff", "staff_id">, Rel<"services", "service_id">]
      >;

      schedules: Table<
        {
          id: string;
          staff_id: string;
          start_time: string;
          end_time: string;
          note: string | null;
          created_at: string;
        },
        [Rel<"staff", "staff_id">]
      >;

      appointments: Table<
        {
          id: string;
          store_id: string | null;
          customer_id: string;
          staff_id: string;
          service_id: string;
          start_time: string;
          end_time: string;
          status: string;
          remark: string | null;
          price_snapshot: number | null;
          member_price_snapshot: number | null;
          pass_id: string | null;
          charged_amount: number;
          payment_state: "charged" | "refunded" | "redeemed" | "legacy";
          created_at: string;
          updated_at: string;
        },
        [
          Rel<"members", "customer_id", "appointments_customer_id_fkey">,
          Rel<"staff", "staff_id", "appointments_staff_id_fkey">,
          Rel<"services", "service_id", "appointments_service_id_fkey">,
        ]
      >;

      product_categories: Table<{
        id: string;
        name: string;
        sort_order: number;
        created_at: string;
      }>;

      products: Table<
        {
          id: string;
          name: string;
          description: string | null;
          price: number;
          image_url: string | null;
          category_id: string | null;
          stock_status: string;
          is_active: boolean;
          sort_order: number;
          created_at: string;
        },
        [
          Rel<
            "product_categories",
            "category_id",
            "products_category_id_fkey"
          >,
        ]
      >;

      balance_logs: Table<{
        id: string;
        member_id: string;
        old_balance: number;
        new_balance: number;
        delta: number;
        reason: string;
        operator_id: string | null;
        created_at: string;
      }>;

      notifications: Table<{
        id: string;
        appointment_id: string | null;
        type: string;
        channel: string;
        status: string;
        sent_at: string | null;
        created_at: string;
      }>;

      push_subscriptions: Table<{
        id: string;
        user_id: string;
        endpoint: string;
        p256dh: string;
        auth: string;
        user_agent: string | null;
        created_at: string;
        updated_at: string;
      }>;

      reminders: Table<{
        id: string;
        appointment_id: string;
        send_at: string;
        status: string;
        created_at: string;
        updated_at: string;
      }>;
      service_passes: Table<{
        id: string;
        member_id: string;
        service_id: string;
        title: string;
        source: "gift" | "purchase" | "adjust";
        status: "active" | "held" | "redeemed" | "expired" | "revoked";
        expires_at: string | null;
        granted_by: string | null;
        remark: string | null;
        created_at: string;
        updated_at: string;
      }>;

      pass_ledger: Table<{
        id: string;
        pass_id: string;
        member_id: string;
        old_status: string | null;
        new_status: string;
        reason: string;
        operator_id: string | null;
        created_at: string;
      }>;

    };
    Views: Record<string, never>;
    Functions: {
      create_appointment: {
        Args: {
          p_customer_id: string;
          p_staff_id: string;
          p_service_id: string;
          p_start_time: string;
          p_remark?: string;
          p_status?: string;
          p_pass_id?: string;
        };
        Returns: string;
      };
      cancel_appointment: {
        Args: { p_appointment_id: string };
        Returns: undefined;
      };
      grant_service_pass: {
        Args: {
          p_member_id: string;
          p_service_id: string;
          p_quantity?: number;
          p_source?: string;
          p_months?: number;
          p_remark?: string;
        };
        Returns: number;
      };
      revoke_service_pass: {
        Args: { p_pass_id: string; p_reason?: string };
        Returns: undefined;
      };
      update_appointment_status: {
        Args: { p_appointment_id: string; p_status: string };
        Returns: undefined;
      };
      admin_update_balance: {
        Args: { p_member_id: string; p_new_balance: number; p_reason?: string };
        Returns: undefined;
      };
      get_available_slots: {
        Args: { p_staff_id: string; p_service_id: string; p_date: string };
        Returns: { slot_start: string }[];
      };
      has_role: {
        Args: { p_role: string };
        Returns: boolean;
      };
      current_member_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      current_staff_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      my_guest_appointments: {
        Args: Record<string, never>;
        Returns: {
          appointment_id: string;
          start_time: string;
          end_time: string;
          status: string;
          remark: string | null;
          service_name: string;
          service_duration: number;
          member_name: string | null;
          member_phone: string | null;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

type Tables = Database["public"]["Tables"];

export type Stores = Tables["stores"]["Row"];
export type Profiles = Tables["profiles"]["Row"];
export type UserRoles = Tables["user_roles"]["Row"];
export type Members = Tables["members"]["Row"];
export type Staff = Tables["staff"]["Row"];
export type Services = Tables["services"]["Row"];
export type StaffServices = Tables["staff_services"]["Row"];
export type Schedules = Tables["schedules"]["Row"];
export type Appointments = Tables["appointments"]["Row"];
export type ProductCategories = Tables["product_categories"]["Row"];
export type Products = Tables["products"]["Row"];
export type BalanceLogs = Tables["balance_logs"]["Row"];
export type Notifications = Tables["notifications"]["Row"];

export type AppointmentWithRefs = Appointments & {
  members: Pick<Members, "id" | "name" | "phone"> | null;
  staff: Pick<Staff, "id" | "name" | "title"> | null;
  services: Pick<Services, "id" | "name" | "duration" | "price"> | null;
};

export type ProductWithCategory = Products & {
  product_categories: Pick<ProductCategories, "id" | "name"> | null;
};

export type StaffWithProfile = Staff & {
  profiles: Pick<Profiles, "id" | "phone" | "email"> | null;
};
