import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { useTheme } from "@/src/theme/ThemeProvider";
import { useAuth } from "@/src/auth/AuthProvider";
import { api } from "@/src/api/client";

export default function BillingSuccess() {
  const { colors } = useTheme();
  const router = useRouter();
  const { refresh } = useAuth();
  const { session_id } = useLocalSearchParams<{ session_id?: string }>();
  const [status, setStatus] = useState<"polling" | "paid" | "failed" | "expired">("polling");
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    let mounted = true;
    if (!session_id) {
      setStatus("failed");
      return;
    }
    async function poll(i: number) {
      if (!mounted) return;
      if (i > 15) {
        setStatus("expired");
        return;
      }
      try {
        const r = await api.billingStatus(session_id as string);
        setAttempts(i);
        if (r.payment_status === "paid") {
          await refresh();
          setStatus("paid");
          return;
        }
        if (r.status === "expired") {
          setStatus("expired");
          return;
        }
      } catch {}
      setTimeout(() => poll(i + 1), 2000);
    }
    poll(1);
    return () => {
      mounted = false;
    };
  }, [session_id, refresh]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
        {status === "polling" && (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.title, { color: colors.text }]}>Confirming your payment…</Text>
            <Text style={[styles.sub, { color: colors.textMuted }]}>Attempt {attempts}/15</Text>
          </>
        )}
        {status === "paid" && (
          <>
            <LinearGradient colors={colors.gradient} style={styles.iconBig}>
              <Ionicons name="checkmark" size={40} color="#fff" />
            </LinearGradient>
            <Text style={[styles.title, { color: colors.text }]}>You&apos;re Premium! 🎉</Text>
            <Text style={[styles.sub, { color: colors.textMuted }]}>
              Unlimited transformations unlocked. Enjoy!
            </Text>
            <Pressable
              testID="return-home"
              onPress={() => router.replace("/(tabs)")}
              style={{ marginTop: 22 }}
            >
              <LinearGradient colors={colors.gradient} style={styles.cta}>
                <Text style={{ color: "#fff", fontWeight: "800" }}>Back to Home</Text>
              </LinearGradient>
            </Pressable>
          </>
        )}
        {(status === "failed" || status === "expired") && (
          <>
            <View style={[styles.iconBig, { backgroundColor: colors.surfaceMuted }]}>
              <Ionicons name="alert-circle-outline" size={40} color={colors.danger} />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Payment didn&apos;t complete</Text>
            <Text style={[styles.sub, { color: colors.textMuted }]}>You haven&apos;t been charged.</Text>
            <Pressable
              testID="try-again"
              onPress={() => router.replace("/paywall")}
              style={{ marginTop: 22 }}
            >
              <LinearGradient colors={colors.gradient} style={styles.cta}>
                <Text style={{ color: "#fff", fontWeight: "800" }}>Try again</Text>
              </LinearGradient>
            </Pressable>
          </>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  iconBig: {
    width: 84,
    height: 84,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: "800", textAlign: "center" },
  sub: { fontSize: 14, marginTop: 8, textAlign: "center" },
  cta: { paddingHorizontal: 26, paddingVertical: 14, borderRadius: 999 },
});
