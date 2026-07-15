import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Platform, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";

import { useTheme } from "@/src/theme/ThemeProvider";
import { useAuth } from "@/src/auth/AuthProvider";
import { api } from "@/src/api/client";

const TIERS = [
  { kind: "pack_10", credits: 10, price: 2.99, tag: null, per: "30¢ / image" },
  { kind: "pack_20", credits: 20, price: 4.99, tag: "MOST POPULAR", per: "25¢ / image" },
  { kind: "pack_35", credits: 35, price: 7.79, tag: "BEST VALUE", per: "22¢ / image" },
] as const;

const FEATURES = [
  { icon: "color-palette", label: "Every theme & art style included" },
  { icon: "images", label: "Credits never expire" },
  { icon: "image", label: "HD downloads, no watermark" },
  { icon: "flash", label: "Fusion mode — blend two pets" },
] as const;

export default function Paywall() {
  const { colors } = useTheme();
  const router = useRouter();
  const { refresh } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buy(kind: string) {
    try {
      setBusy(kind);
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
        setTimeout(async () => { await refresh(); }, 3000);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#0B0B0F" }}>
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        <View style={styles.header}>
          <Pressable testID="paywall-close" onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>Get Generations</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          <LinearGradient colors={["#7C3AED", "#EC4899", "#F97316"]} style={styles.hero}>
            <View style={styles.gemWrap}>
              <Ionicons name="sparkles" size={30} color="#fff" />
            </View>
            <Text style={styles.heroTitle}>More pet magic</Text>
            <Text style={styles.heroSub}>Pay once. Use anytime. No subscription, ever.</Text>
          </LinearGradient>

          {TIERS.map((t) => (
            <Pressable key={t.kind} testID={`buy-${t.kind}`} disabled={busy !== null} onPress={() => buy(t.kind)}>
              <View style={[styles.tier, t.tag === "MOST POPULAR" && styles.tierHot]}>
                {t.tag && (
                  <View style={[styles.badge, t.tag === "BEST VALUE" && { backgroundColor: "#059669" }]}>
                    <Text style={styles.badgeText}>{t.tag}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.tierTitle}>{t.credits} generations</Text>
                  <Text style={styles.tierPer}>{t.per}</Text>
                </View>
                {busy === t.kind ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.tierPrice}>${t.price.toFixed(2)}</Text>
                )}
              </View>
            </Pressable>
          ))}

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
  header: { paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20 },
  headerTitle: { color: "#fff", fontSize: 16, fontWeight: "800" },
  hero: { borderRadius: 26, padding: 24, alignItems: "flex-start", gap: 6, marginBottom: 20 },
  gemWrap: { width: 56, height: 56, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  heroTitle: { color: "#fff", fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  heroSub: { color: "rgba(255,255,255,0.85)", fontSize: 14 },
  tier: { flexDirection: "row", alignItems: "center", gap: 12, padding: 18, marginBottom: 12, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  tierHot: { borderColor: "#EC4899", borderWidth: 2, backgroundColor: "rgba(236,72,153,0.08)" },
  badge: { position: "absolute", top: -9, left: 16, backgroundColor: "#EC4899", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },
  tierTitle: { color: "#fff", fontSize: 17, fontWeight: "800" },
  tierPer: { color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 2 },
  tierPrice: { color: "#fff", fontSize: 19, fontWeight: "900" },
  features: { gap: 12, marginTop: 10, marginBottom: 10 },
  feature: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 16, borderColor: "rgba(255,255,255,0.08)", borderWidth: 1 },
  featureIcon: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.1)" },
  featureText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  legal: { color: "rgba(255,255,255,0.5)", textAlign: "center", fontSize: 11, marginTop: 20 },
});
