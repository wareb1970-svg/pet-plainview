import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { useTheme } from "@/src/theme/ThemeProvider";
import { useAuth } from "@/src/auth/AuthProvider";
import { api } from "@/src/api/client";

type Analytics = {
  total_users: number;
  premium_users: number;
  total_generations: number;
  total_favorites: number;
  paid_transactions: number;
};

type Cfg = {
  daily_limit_free: number;
  price_premium_usd: number;
  price_pack_usd: number;
  features: Record<string, boolean>;
};

export default function Admin() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.is_admin) router.replace("/(tabs)");
  }, [user, router]);

  useEffect(() => {
    (async () => {
      try {
        const [a, c] = await Promise.all([api.adminAnalytics(), api.adminConfig()]);
        setAnalytics(a);
        setCfg(c as Cfg);
      } catch {}
      finally { setLoading(false); }
    })();
  }, []);

  async function save() {
    if (!cfg) return;
    try {
      setSaving(true);
      setMsg(null);
      const c = await api.updateAdminConfig({
        daily_limit_free: Number(cfg.daily_limit_free),
        price_premium_usd: Number(cfg.price_premium_usd),
        price_pack_usd: Number(cfg.price_pack_usd),
        features: cfg.features,
      });
      setCfg(c as Cfg);
      setMsg("Saved ✓");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={["top"]}>
        <View style={styles.header}>
          <Pressable testID="admin-back" onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Admin</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <KeyboardAwareScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 60, gap: 18 }}
          bottomOffset={40}
        >
          {/* Analytics */}
          <Text style={[styles.section, { color: colors.textMuted }]}>ANALYTICS</Text>
          <View style={styles.statGrid}>
            {analytics && (
              <>
                <Stat label="Users" value={analytics.total_users} />
                <Stat label="Premium" value={analytics.premium_users} />
                <Stat label="Generations" value={analytics.total_generations} />
                <Stat label="Favorites" value={analytics.total_favorites} />
                <Stat label="Paid txns" value={analytics.paid_transactions} />
              </>
            )}
          </View>

          {/* Config */}
          <Text style={[styles.section, { color: colors.textMuted, marginTop: 8 }]}>CONFIGURATION</Text>
          {cfg && (
            <View style={{ gap: 12 }}>
              <ConfigInput
                testID="cfg-daily-limit"
                label="Free daily limit"
                value={String(cfg.daily_limit_free)}
                onChangeText={(v) => setCfg({ ...cfg, daily_limit_free: Number(v) || 0 })}
                keyboard="number-pad"
              />
              <ConfigInput
                testID="cfg-premium-price"
                label="Premium price (USD/mo)"
                value={String(cfg.price_premium_usd)}
                onChangeText={(v) => setCfg({ ...cfg, price_premium_usd: Number(v) || 0 })}
                keyboard="decimal-pad"
              />
              <ConfigInput
                testID="cfg-pack-price"
                label="Content pack price (USD)"
                value={String(cfg.price_pack_usd)}
                onChangeText={(v) => setCfg({ ...cfg, price_pack_usd: Number(v) || 0 })}
                keyboard="decimal-pad"
              />

              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={{ color: colors.text, fontWeight: "800", marginBottom: 8 }}>Feature toggles</Text>
                {Object.entries(cfg.features).map(([k, v]) => (
                  <Pressable
                    key={k}
                    testID={`toggle-${k}`}
                    onPress={() => setCfg({ ...cfg, features: { ...cfg.features, [k]: !v } })}
                    style={styles.toggleRow}
                  >
                    <Text style={{ color: colors.text, flex: 1, fontSize: 14 }}>{k}</Text>
                    <View
                      style={[
                        styles.pill,
                        { backgroundColor: v ? colors.success : colors.surfaceMuted },
                      ]}
                    >
                      <Text style={{ color: "#fff", fontWeight: "800", fontSize: 11 }}>
                        {v ? "ON" : "OFF"}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>

              <Pressable
                testID="admin-save"
                onPress={save}
                disabled={saving}
                style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "800" }}>Save changes</Text>
                )}
              </Pressable>
              {msg && (
                <Text testID="admin-msg" style={{ color: colors.text, textAlign: "center" }}>
                  {msg}
                </Text>
              )}
            </View>
          )}
        </KeyboardAwareScrollView>
      )}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>{value}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function ConfigInput({
  label,
  value,
  onChangeText,
  keyboard,
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  keyboard?: "number-pad" | "decimal-pad";
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboard}
        style={{ color: colors.text, fontSize: 18, fontWeight: "700", marginTop: 6 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20 },
  headerTitle: { fontSize: 18, fontWeight: "800" },
  section: { fontSize: 12, fontWeight: "800", letterSpacing: 0.8 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: { padding: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, minWidth: "30%" },
  card: { padding: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  toggleRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  saveBtn: { height: 52, borderRadius: 999, alignItems: "center", justifyContent: "center", marginTop: 4 },
});
