import { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  TextInput,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { useTheme } from "@/src/theme/ThemeProvider";
import { useAuth } from "@/src/auth/AuthProvider";
import { api } from "@/src/api/client";


export default function Login() {
  const { colors, isDark } = useTheme();
  const { setSession } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const googleClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID as string | undefined;

  useEffect(() => {
    if (Platform.OS !== "web" || !googleClientId || typeof document === "undefined") return;
    const setup = () => {
      const g = (window as any).google;
      const host = document.getElementById("google-signin-btn");
      if (!g?.accounts?.id || !host) return;
      g.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (resp: any) => {
          try {
            setBusy(true);
            setError(null);
            const res = await api.authGoogle(resp.credential);
            await setSession(res.session_token, res.user);
            router.replace("/(tabs)");
          } catch (e: any) {
            setError(e?.message ?? "Google sign-in failed. Please try again.");
          } finally {
            setBusy(false);
          }
        },
      });
      host.innerHTML = "";
      g.accounts.id.renderButton(host, { theme: "outline", size: "large", width: 320, text: "continue_with" });
    };
    if ((window as any).google?.accounts?.id) { setup(); return; }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = setup;
    document.head.appendChild(s);
  }, [googleClientId]);

  async function submit() {
    if (busy) return;
    setError(null);
    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      const res =
        mode === "login"
          ? await api.authLogin(email.trim(), password)
          : await api.authRegister(email.trim(), password, name.trim() || undefined);
      await setSession(res.session_token, res.user);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]} testID="login-screen">
      <Image
        source={require("@/assets/images/login-hero.jpg")}
        style={styles.hero}
        resizeMode="cover"
      />

      <SafeAreaView style={styles.sheet} edges={["bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ width: "100%" }}
        >
          <ScrollView
            contentContainerStyle={styles.form}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.badgeRow}>
              <LinearGradient colors={colors.gradient} style={styles.badge}>
                <Text style={styles.badgeText}>AI Pet Portraits</Text>
              </LinearGradient>
            </View>
            <Text style={[styles.h1, { color: colors.text }]}>
              What If My Pet Was…
            </Text>
            <Text style={[styles.sub, { color: colors.textMuted }]}>
              {mode === "login"
                ? "Welcome back. Sign in to keep creating."
                : "Create an account to transform your pet."}
            </Text>

            {Platform.OS === "web" && googleClientId ? (
              <>
                <View nativeID="google-signin-btn" style={{ alignItems: "center", marginBottom: 14, minHeight: 44 }} />
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: colors.textMuted, opacity: 0.3 }} />
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>or use email</Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: colors.textMuted, opacity: 0.3 }} />
                </View>
              </>
            ) : null}

            {mode === "register" && (
              <TextInput
                testID="name-input"
                style={[styles.input, { color: colors.text, borderColor: colors.textMuted }]}
                placeholder="Your name (optional)"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="words"
                value={name}
                onChangeText={setName}
              />
            )}
            <TextInput
              testID="email-input"
              style={[styles.input, { color: colors.text, borderColor: colors.textMuted }]}
              placeholder="Email"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              testID="password-input"
              style={[styles.input, { color: colors.text, borderColor: colors.textMuted }]}
              placeholder={mode === "register" ? "Password (8+ characters)" : "Password"}
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              autoComplete={mode === "register" ? "new-password" : "password"}
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={submit}
            />

            <Pressable
              testID="auth-submit-button"
              onPress={submit}
              disabled={busy}
              style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
            >
              <LinearGradient colors={colors.gradient} style={styles.ctaGrad}>
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.ctaText}>
                    {mode === "login" ? "Sign In" : "Create Account"}
                  </Text>
                )}
              </LinearGradient>
            </Pressable>

            {error && (
              <Text testID="login-error" style={[styles.err, { color: colors.danger }]}>
                {error}
              </Text>
            )}

            <Pressable
              testID="auth-mode-toggle"
              onPress={() => {
                setMode(mode === "login" ? "register" : "login");
                setError(null);
              }}
            >
              <Text style={[styles.toggle, { color: colors.textMuted }]}>
                {mode === "login"
                  ? "New here? Create an account"
                  : "Already have an account? Sign in"}
              </Text>
            </Pressable>

            <Text style={[styles.legal, { color: colors.textMuted }]}>
              By continuing you agree to our Terms of Service and Privacy Policy.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: { position: "absolute", top: 0, left: 0, right: 0, height: "55%" },
  sheet: { flex: 1, justifyContent: "flex-end" },
  form: { paddingHorizontal: 24, paddingBottom: 16, alignItems: "stretch" },
  badgeRow: { flexDirection: "row", marginBottom: 12 },
  badge: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  badgeText: { color: "#fff", fontWeight: "700", fontSize: 12, letterSpacing: 0.5 },
  h1: { fontSize: 32, fontWeight: "800", marginBottom: 6 },
  sub: { fontSize: 15, marginBottom: 20 },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 16,
    marginBottom: 12,
  },
  cta: { borderRadius: 16, overflow: "hidden", marginTop: 4 },
  ctaGrad: { paddingVertical: 16, alignItems: "center", justifyContent: "center" },
  ctaText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  err: { marginTop: 12, textAlign: "center", fontSize: 14 },
  toggle: { marginTop: 16, textAlign: "center", fontSize: 15, fontWeight: "600" },
  legal: { marginTop: 18, textAlign: "center", fontSize: 12 },
});
