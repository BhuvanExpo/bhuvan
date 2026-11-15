export interface Broadcast {
  id: number;
  slot_number: number;
  real_name?: string | null;
  category_label: string;
  avatar_url?: string | null;
  bio?: string | null;
  body: string;
  media_url?: string | null;
  signature_b64: string;
  created_at: string;
  verified?: boolean;
}

export interface VoiceLink {
  title?: string;
  url: string;
}

export interface SlotStatus {
  slot_number: number;
  real_name?: string | null;
  category_label: string;
  avatar_url?: string | null;
  cover_url?: string | null;
  bio?: string | null;
  links?: VoiceLink[] | null;
  followers_count?: number;
  public_key_hex: string;
  last_broadcast_at?: string | null;
  total_broadcasts: number;
}

export interface Slot10Cooldown {
  is_locked: boolean;
  last_broadcast_at?: string | null;
  next_eligible_at?: string | null;
  cooldown_seconds_remaining: number;
  cooldown_total_hours: number;
}

export interface SlotsMatrixResponse {
  slots: SlotStatus[];
  slot_10_cooldown: Slot10Cooldown;
}

export interface AdminStats {
  total_broadcasts: number;
  total_followers: number;
  active_slots: number;
  vacant_slots: number;
  broadcasts_last_24h: number;
  total_slots: number;
  database_connected: boolean;
  redis_connected: boolean;
  titan_cooldown: {
    is_locked: boolean;
    seconds_remaining: number;
    next_eligible_at?: string | null;
    last_broadcast_at?: string | null;
  };
}

export interface AdminBroadcastItem extends Broadcast {
  public_key_hex?: string | null;
}
