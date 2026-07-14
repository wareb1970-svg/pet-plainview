import { View, Text, StyleSheet, Pressable, ScrollView, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useTheme, ThemeMode } from "@/src/theme/ThemeProvider";
import { useAuth } from "@/src/auth/AuthProvider";

export default function Settings() {
  const { colors, mode, setMode } = useTheme();
  const { user, logout } = useAuth();
  const router = useRouter();

  const modes: { key: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: "system", label: "System", icon: "phone-portrait-outline" },
    { key: "light", label: "Light", icon: "sunny-outline" },
    { key: "dark", label: "Dark", icon: "moon-outline" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={["top"]}>
        <View style={styles.header}>
          <Text style={[styles.h1, { color: colors.text }]}>Settings</Text>
        </View>
      </SafeAreaView>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 140, gap: 18 }} showsVerticalScrollIndicator={false}>
        {/* Account */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            {user?.picture ? (
              <Image source={{ uri: user.picture }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: colors.surfaceMuted, alignItems: "center", justifyContent: "center" }]}>
                <Text style={{ color: colors.text, fontWeight: "800", fontSize: 20 }}>
                  {(user?.name || "?").charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16 }}>{user?.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 13 }} numberOfLines={1}>
                {user?.email}
              </Text>
            </View>
            {user?.is_premium ? (
              <View style={[styles.premiumBadge, { backgroundColor: colors.surfaceMuted }]}>
                <Ionicons name="diamond" size={12} color={colors.warning} />
                <Text style={{ color: colors.text, fontWeight: "800", fontSize: 11 }}>PREMIUM</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Subscription */}
        {!user?.is_premium && (
          <Pressable testID="upgrade-card" onPress={() => router.push("/paywall")}>
            <LinearGradient colors={colors.gradient} style={styles.upgrade}>
              <View style={{ flex: 1 }}>
                <Text style={styles.upgradeTitle}>Go Premium</Text>
                <Text style={styles.upgradeSub}>
                  Unlimited generations · HD · no watermark · all packs
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color="#fff" />
            </LinearGradient>
          </Pressable>
        )}

        {/* Theme */}
        <SectionTitle text="Appearance" />
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, padding: 6 }]}>
          {modes.map((m, i) => {
            const active = mode === m.key;
            return (
              <Pressable
                key={m.key}
                testID={`theme-${m.key}`}
                onPress={() => setMode(m.key)}
                style={[
                  styles.themeRow,
                  {
                    borderBottomWidth: i < modes.length - 1 ? StyleSheet.hairlineWidth : 0,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={[styles.themeIcon, { backgroundColor: colors.surfaceMuted }]}>
                  <Ionicons name={m.icon} size={16} color={colors.text} />
                </View>
                <Text style={{ color: colors.text, fontWeight: "600", flex: 1 }}>{m.label}</Text>
                {active && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
              </Pressable>
            );
          })}
        </View>

        {/* Usage */}
        <SectionTitle text="Usage today" />
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>
            {user?.is_premium
              ? "Unlimited generations"
              : `${user?.daily_used ?? 0} of ${user?.daily_limit ?? 3} used`}
          </Text>
          <View style={[styles.progressBg, { backgroundColor: colors.surfaceMuted }]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${user?.is_premium ? 100 : Math.min(100, ((user?.daily_used ?? 0) / (user?.daily_limit || 1)) * 100)}%`,
                  backgroundColor: colors.primary,
                },
              ]}
            />
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>
            Free daily limit resets at midnight UTC.
          </Text>
        </View>

        {/* Admin */}
        {user?.is_admin && (
          <Pressable
            testID="admin-link"
            onPress={() => router.push("/admin")}
            style={[styles.linkRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
            <Text style={{ color: colors.text, fontWeight: "700", flex: 1 }}>Admin dashboard</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        )}

        {/* Logout */}
        <Pressable
          testID="logout-btn"
          onPress={logout}
          style={[styles.linkRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          <Text style={{ color: colors.danger, fontWeight: "700", flex: 1 }}>Sign out</Text>
        </Pressable>

        <Text style={{ color: colors.textMuted, textAlign: "center", fontSize: 12, marginTop: 8 }}>
          What If My Pet Was… · Made with love and AI
        </Text>
      </ScrollView>
    </View>
  );
}

function SectionTitle({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "800", letterSpacing: 0.8, marginTop: 6 }}>
      {text.toUpperCase()}
    </Text>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 10 },
  h1: { fontSize: 30, fontWeight: "800", letterSpacing: -0.5 },
  card: { padding: 16, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  premiumBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999 },

  upgrade: {
    padding: 18,
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  upgradeTitle: { color: "#fff", fontWeight: "800", fontSize: 17 },
  upgradeSub: { color: "rgba(255,255,255,0.9)", fontSize: 12, marginTop: 2 },

  themeRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 14 },
  themeIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },

  progressBg: { height: 8, borderRadius: 999, marginTop: 12, overflow: "hidden" },
  progressFill: { height: 8, borderRadius: 999 },

  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
