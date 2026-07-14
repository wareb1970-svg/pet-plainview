import { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Platform, ActivityIndicator, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";

import { useTheme } from "@/src/theme/ThemeProvider";
import { useAuth } from "@/src/auth/AuthProvider";
import { api } from "@/src/api/client";

const FEATURES = [
  { icon: "infinite", label: "Unlimited generations" },
  { icon: "sparkles", label: "All 40+ transformation themes" },
  { icon: "image", label: "HD downloads, no watermark" },
  { icon: "flash", label: "Priority AI processing" },
  { icon: "cloud", label: "Cloud history across devices" },
  { icon: "gift", label: "Early access to new content packs" },
] as const;

export default function Paywall() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prices, setPrices] = useState<{ premium: number; pack: number }>({ premium: 9.99, pack: 4.99 });

  useEffect(() => {
    if (user?.is_premium) router.replace("/(tabs)/settings");
  }, [user, router]);

  async function upgrade(kind: "subscription" | "pack") {
    try {
      setBusy(true);
      setError(null);
      const origin =
        Platform.OS === "web" && typeof window !== "undefined"
          ? window.location.origin
          : (process.env.EXPO_PUBLIC_BACKEND_URL as string);
      const res = await api.checkout(kind, origin);
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.location.href = res.url;
      } else {
        await WebBrowser.openBrowserAsync(res.url);
        // Poll for completion after user returns
        setTimeout(async () => {
          await refresh();
        }, 3000);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#0B0B0F" }}>
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        <View style={styles.header}>
          <Pressable testID="paywall-close" onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>Go Premium</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          <LinearGradient colors={["#7C3AED", "#EC4899", "#F97316"]} style={styles.hero}>
            <View style={styles.gemWrap}>
              <Ionicons name="diamond" size={30} color="#fff" />
            </View>
            <Text style={styles.heroTitle}>Unlimited pet magic</Text>
            <Text style={styles.heroSub}>
              Everything you love, no limits. Cancel anytime.
            </Text>
          </LinearGradient>

          <View style={styles.features}>
            {FEATURES.map((f) => (
              <View key={f.label} style={styles.feature}>
                <View style={styles.featureIcon}>
                  <Ionicons name={f.icon as keyof typeof Ionicons.glyphMap} size={16} color="#fff" />
                </View>
                <Text style={styles.featureText}>{f.label}</Text>
              </View>
            ))}
          </View>

          <Pressable testID="upgrade-monthly" disabled={busy} onPress={() => upgrade("subscription")}>
            <LinearGradient colors={colors.gradient} style={styles.cta}>
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.ctaText}>Go Premium — ${prices.premium.toFixed(2)}/mo</Text>
                </>
              )}
            </LinearGradient>
          </Pressable>

          <Pressable testID="buy-pack" disabled={busy} onPress={() => upgrade("pack")} style={styles.packBtn}>
            <Ionicons name="cube-outline" size={18} color="#fff" />
            <Text style={styles.packText}>Or get 20 generations — ${prices.pack.toFixed(2)}</Text>
          </Pressable>

          {error && (
            <Text testID="paywall-error" style={{ color: "#FF6B6B", textAlign: "center", marginTop: 14 }}>
              {error}
            </Text>
          )}

          <Text style={styles.legal}>Secure payments processed by Stripe.</Text>
        </ScrollView>
      </SafeAreaView>
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
  headerTitle: { color: "#fff", fontSize: 16, fontWeight: "800" },
  hero: { borderRadius: 26, padding: 24, alignItems: "flex-start", gap: 6, marginBottom: 20 },
  gemWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  heroTitle: { color: "#fff", fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  heroSub: { color: "rgba(255,255,255,0.85)", fontSize: 14 },
  features: { gap: 12, marginBottom: 24 },
  feature: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 16,
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
  },
  featureIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  featureText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  cta: {
    height: 56,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  ctaText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  packBtn: {
    marginTop: 12,
    height: 52,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  packText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  legal: { color: "rgba(255,255,255,0.5)", textAlign: "center", fontSize: 11, marginTop: 20 },
});
