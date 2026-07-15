/**
 * API client for What If My Pet Was… backend.
 * Uses Bearer token stored via secure storage helper.
 */
import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
export const TOKEN_KEY = "wimp_session_token";

async function authHeaders(): Promise<Record<string, string>> {
  const token = await storage.secureGet<string>(TOKEN_KEY, "");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const auth = await authHeaders();
  const res = await fetch(`${BASE}/api${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...auth,
      ...(opts.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    let detail = "Request failed";
    try {
      const j = await res.json();
      detail = j.detail ?? detail;
    } catch {}
    const err = new Error(detail) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

export type MeUser = {
  user_id: string;
  email: string;
  name: string;
  picture?: string | null;
  is_premium: boolean;
  is_admin: boolean;
  daily_used: number;
  daily_limit: number;
  pack_credits?: number;
};

export type Transformation = {
  id: string;
  user_id: string;
  category_slug: string;
  category_label: string;
  category_group: string;
  style?: string;
  style_label?: string;
  pet_name?: string | null;
  image_base64: string;
  source_image_base64?: string;
  name: string;
  occupation: string;
  personality: string;
  biography: string;
  favorite: boolean;
  watermark: boolean;
  created_at: string;
};

export type Category = {
  slug: string;
  label: string;
  group: string;
  prompt: string;
  emoji: string;
  premium?: boolean;
  preservation?: "animal" | "human";
};

export type Style = {
  key: string;
  label: string;
  prompt_suffix?: string;
};

export const api = {
  async authRegister(email: string, password: string, name?: string) {
    return request<{ session_token: string; user: MeUser }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    });
  },
  async authLogin(email: string, password: string) {
    return request<{ session_token: string; user: MeUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },
  async me() {
    return request<MeUser>("/auth/me");
  },
  async logout() {
    return request<{ ok: boolean }>("/auth/logout", { method: "POST" });
  },
  async categories() {
    return request<{
      groups: Record<string, Category[]>;
      categories: Category[];
      styles: Style[];
      default_style: string;
    }>("/categories");
  },
  async transform(body: {
    image_base64: string;
    image_base64_2?: string;
    meme_text?: string;
    pet_name?: string;
    category_slug: string;
    style?: string;
  }) {
    return request<Transformation>("/transform", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async listTransformations(favoritesOnly = false) {
    const q = favoritesOnly ? "?favorites_only=true" : "";
    return request<{ items: Transformation[] }>(`/transformations${q}`);
  },
  async getTransformation(id: string) {
    return request<Transformation>(`/transformations/${id}`);
  },
  async toggleFavorite(id: string) {
    return request<{ favorite: boolean }>(`/transformations/${id}/favorite`, {
      method: "POST",
    });
  },
  async deleteTransformation(id: string) {
    return request<{ deleted: number }>(`/transformations/${id}`, { method: "DELETE" });
  },
  async usage() {
    return request<{ used: number; limit: number; is_premium: boolean; remaining: number }>(
      "/usage"
    );
  },
  async checkout(kind: string, origin: string) {
    return request<{ url: string; session_id: string }>("/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ kind, origin }),
    });
  },
  async billingStatus(session_id: string) {
    return request<{
      status: string;
      payment_status: string;
      amount_total: number;
      currency: string;
    }>(`/billing/status/${session_id}`);
  },
  async adminConfig() {
    return request<{
      daily_limit_free: number;
      price_premium_usd: number;
      price_pack_usd: number;
      features: Record<string, boolean>;
    }>("/admin/config");
  },
  async updateAdminConfig(payload: Record<string, unknown>) {
    return request("/admin/config", { method: "PUT", body: JSON.stringify(payload) });
  },
  async adminAnalytics() {
    return request<{
      total_users: number;
      premium_users: number;
      total_generations: number;
      total_favorites: number;
      paid_transactions: number;
    }>("/admin/analytics");
  },
};

export const BACKEND_URL = BASE;
