import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Platform,
  ActivityIndicator,
  Animated,
  Easing,
  ScrollView,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { useLocalSearchParams, useRouter } from "expo-router";

import { useTheme } from "@/src/theme/ThemeProvider";
import { useAuth } from "@/src/auth/AuthProvider";
import { api, Category, Style } from "@/src/api/client";

// simple styled input replacement
import { TextInput } from "react-native";

export default function Create() {
  const { colors } = useTheme();
  const { user, refresh } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ slug?: string }>();

  const [image, setImage] = useState<{ uri: string; b64: string } | null>(null);
  const [image2, setImage2] = useState<{ uri: string; b64: string } | null>(null);
  const [pickSlot, setPickSlot] = useState<1 | 2>(1);
  const [petName, setPetName] = useState("");
  const [slug, setSlug] = useState<string>(params.slug ?? "surprise");
  const [memeText, setMemeText] = useState("");
  const [style, setStyle] = useState<string>("realistic");
  const [stylesList, setStylesList] = useState<Style[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cats, setCats] = useState<Category[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.categories();
        setCats(r.categories);
        setStylesList(r.styles ?? []);
        if (r.default_style) setStyle(r.default_style);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (params.slug) setSlug(params.slug as string);
  }, [params.slug]);

  const activeLabel = useMemo(() => {
    if (slug === "surprise") return "Surprise Me";
    return cats.find((c) => c.slug === slug)?.label ?? slug;
  }, [slug, cats]);

  async function ensureLibraryPerm() {
    const res = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return res.granted;
  }
  async function ensureCameraPerm() {
    const res = await ImagePicker.requestCameraPermissionsAsync();
    return res.granted;
  }


  async function toWebSafeUri(uri: string, mimeType?: string | null, fileName?: string | null): Promise<string> {
    // iPhone photos are often HEIC, which desktop browsers can't decode.
    // On web, convert HEIC/HEIF to JPEG before processing.
    if (Platform.OS !== "web") return uri;
    const hint = `${mimeType || ""} ${fileName || ""} ${uri}`.toLowerCase();
    if (!/heic|heif/.test(hint)) return uri;
    try {
      const heic2any = (await import("heic2any")).default as any;
      const blob = await (await fetch(uri)).blob();
      const out = await heic2any({ blob, toType: "image/jpeg", quality: 0.9 });
      const jpeg = Array.isArray(out) ? out[0] : out;
      return URL.createObjectURL(jpeg as Blob);
    } catch {
      throw new Error("This photo is in HEIC format and couldn't be converted. Please use a JPG or PNG.");
    }
  }

  async function processPicked(uri: string) {
    // Downscale so base64 is small enough for JSON POSTs
    const manip = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1024 } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    if (!manip.base64) throw new Error("Couldn't read image");
    if (pickSlot === 2) setImage2({ uri: manip.uri, b64: manip.base64 });
    else setImage({ uri: manip.uri, b64: manip.base64 });
  }

  function resetSlotSoon() { setTimeout(() => setPickSlot(1), 400); }

  async function pickFromLibrary() {
    if (!(await ensureLibraryPerm())) {
      setError("We need access to your photos to pick a pet picture.");
      return;
    }
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: false,
    });
    if (r.canceled || !r.assets[0]) return;
    try {
      const a = r.assets[0];
      await processPicked(await toWebSafeUri(a.uri, (a as any).mimeType, (a as any).fileName));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      resetSlotSoon();
    }
  }

  async function takePhoto() {
    if (Platform.OS === "web") {
      // web fallback to image picker
      return pickFromLibrary();
    }
    if (!(await ensureCameraPerm())) {
      setError("Camera access is needed to snap your pet.");
      return;
    }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.9 });
    if (r.canceled || !r.assets[0]) return;
    try {
      const a = r.assets[0];
      await processPicked(await toWebSafeUri(a.uri, (a as any).mimeType, (a as any).fileName));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function generate() {
    if (!image) {
      setError("Please upload or take a pet photo first.");
      return;
    }
    if (!user?.is_premium && (user?.daily_used ?? 0) >= (user?.daily_limit ?? 3) && (user?.pack_credits ?? 0) <= 0) {
      router.push("/paywall");
      return;
    }
    try {
      setBusy(true);
      setError(null);
      const res = await api.transform({
        image_base64: image.b64,
        image_base64_2: image2?.b64,
        meme_text: slug === "meme_custom" ? memeText.trim() || undefined : undefined,
        pet_name: petName.trim() || undefined,
        category_slug: slug,
        style,
      });
      await refresh();
      router.replace({ pathname: "/result/[id]", params: { id: res.id, fresh: "1" } });
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 402) {
        router.push("/paywall");
      } else {
        setError(err.message || "Something went wrong");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={["top"]}>
        <View style={styles.header}>
          <Pressable testID="create-back" onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Create</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 18 }}
        bottomOffset={90}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Photo */}
        <Text style={[styles.stepTitle, { color: colors.text }]}>1. Add a pet photo</Text>
        <View style={[styles.photoBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {image ? (
            <>
              <Image source={{ uri: image.uri }} style={styles.photo} />
              <Pressable
                testID="clear-photo"
                onPress={() => { setImage(null); setImage2(null); }}
                style={[styles.clearBtn, { backgroundColor: colors.overlay }]}
              >
                <Ionicons name="close" size={16} color="#fff" />
              </Pressable>
            </>
          ) : (
            <View style={styles.photoPlaceholder}>
              <Ionicons name="paw" size={30} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, marginTop: 8, fontSize: 13 }}>
                Front-facing, well-lit photos work best
              </Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable testID="pick-library" onPress={pickFromLibrary} style={[styles.pickBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="image-outline" size={18} color={colors.text} />
            <Text style={{ color: colors.text, fontWeight: "700" }}>Upload</Text>
          </Pressable>
          <Pressable testID="take-photo" onPress={takePhoto} style={[styles.pickBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="camera-outline" size={18} color={colors.text} />
            <Text style={{ color: colors.text, fontWeight: "700" }}>Camera</Text>
          </Pressable>
        </View>

        {image && (
          <View style={{ marginTop: 10 }}>
            {image2 ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Image source={{ uri: image2.uri }} style={{ width: 54, height: 54, borderRadius: 12 }} />
                <Text style={{ color: colors.text, fontWeight: "700", flex: 1 }}>Fusion mode: two pets will be blended!</Text>
                <Pressable testID="clear-photo-2" onPress={() => setImage2(null)}>
                  <Ionicons name="close-circle" size={22} color={colors.textMuted} />
                </Pressable>
              </View>
            ) : (
              <Pressable
                testID="add-second-pet"
                onPress={() => { setPickSlot(2); pickFromLibrary(); }}
                style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 }}
              >
                <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}>
                  Add a second pet to FUSE them (optional)
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {/* 2. Pet name */}
        <Text style={[styles.stepTitle, { color: colors.text, marginTop: 6 }]}>2. Pet name (optional)</Text>
        <TextInput
          testID="pet-name-input"
          value={petName}
          onChangeText={setPetName}
          placeholder="e.g. Biscuit"
          placeholderTextColor={colors.textMuted}
          style={[
            styles.input,
            { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
          ]}
          returnKeyType="done"
        />

        {/* 3. Style */}
        <Text style={[styles.stepTitle, { color: colors.text, marginTop: 6 }]}>3. Style</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingRight: 6 }}
          style={{ flexGrow: 0 }}
        >
          {stylesList.map((s) => {
            const active = style === s.key;
            return (
              <Pressable
                key={s.key}
                testID={`style-${s.key}`}
                onPress={() => setStyle(s.key)}
                style={[
                  styles.styleChip,
                  {
                    backgroundColor: active ? colors.text : colors.surface,
                    borderColor: active ? colors.text : colors.border,
                  },
                ]}
              >
                <Text
                  style={{
                    color: active ? colors.bg : colors.text,
                    fontWeight: "700",
                    fontSize: 13,
                  }}
                >
                  {s.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* 4. Category */}
        <Text style={[styles.stepTitle, { color: colors.text, marginTop: 6 }]}>4. Pick a life</Text>
        <Pressable
          testID="open-categories"
          onPress={() => router.push({ pathname: "/categories", params: { current: slug } })}
          style={[styles.categoryRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View
            style={[
              styles.catIcon,
              { backgroundColor: colors.surfaceMuted },
            ]}
          >
            <Text style={{ fontSize: 22 }}>
              {slug === "surprise" ? "✨" : (cats.find((c) => c.slug === slug)?.emoji ?? "✨")}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: "800", fontSize: 15 }}>{activeLabel}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>Tap to change</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>

        {slug === "meme_custom" && (
          <View style={{ marginTop: 10 }}>
            <Text style={[styles.stepTitle, { color: colors.text }]}>What's the meme?</Text>
            <TextInput
              testID="meme-text-input"
              value={memeText}
              onChangeText={(t) => setMemeText(t.slice(0, 120))}
              placeholder={'A few words — e.g. "when the treat bag crinkles"'}
              placeholderTextColor={colors.textMuted}
              maxLength={120}
              style={[
                styles.input,
                { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
              ]}
              returnKeyType="done"
            />
          </View>
        )}

        {error && (
          <Text testID="create-error" style={{ color: colors.danger, textAlign: "center" }}>
            {error}
          </Text>
        )}
      </KeyboardAwareScrollView>

      {/* Sticky generate */}
      <View style={[styles.sticky, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <SafeAreaView edges={["bottom"]}>
          <Pressable
            testID="generate-btn"
            disabled={busy || !image}
            onPress={generate}
            style={{ opacity: !image ? 0.5 : 1 }}
          >
            <LinearGradient colors={colors.gradient} style={styles.generateGrad}>
              {busy ? (
                <>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.generateText}>Creating magic…</Text>
                </>
              ) : (
                <>
                  <Ionicons name="sparkles" size={18} color="#fff" />
                  <Text style={styles.generateText}>Generate Transformation</Text>
                </>
              )}
            </LinearGradient>
          </Pressable>
        </SafeAreaView>
      </View>

      {busy && <FullscreenLoader />}
    </View>
  );
}

function FullscreenLoader() {
  const { colors } = useTheme();
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1200, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(anim, { toValue: 0, duration: 1200, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] });
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });

  return (
    <View style={[StyleSheet.absoluteFillObject, styles.loaderOverlay]}>
      <LinearGradient
        colors={["rgba(0,0,0,0.85)", "rgba(0,0,0,0.92)"]}
        style={StyleSheet.absoluteFillObject}
      />
      <Animated.View style={{ transform: [{ scale }], opacity }}>
        <LinearGradient colors={colors.gradient} style={styles.orb}>
          <Ionicons name="sparkles" size={38} color="#fff" />
        </LinearGradient>
      </Animated.View>
      <Text style={styles.loaderTitle}>Analyzing your pet…</Text>
      <Text style={styles.loaderSub}>Preserving that unmistakable face 🐾</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 12,
    paddingBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20 },
  headerTitle: { fontSize: 18, fontWeight: "800" },
  stepTitle: { fontSize: 15, fontWeight: "800", letterSpacing: -0.2 },

  photoBox: { height: 260, borderRadius: 24, borderWidth: 1, borderStyle: "dashed", overflow: "hidden", alignItems: "center", justifyContent: "center" },
  photo: { width: "100%", height: "100%" },
  photoPlaceholder: { alignItems: "center", padding: 20 },
  clearBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    borderRadius: 999,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  pickBtn: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: {
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 52,
    fontSize: 15,
    borderWidth: StyleSheet.hairlineWidth,
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  styleChip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  catIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  sticky: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  generateGrad: {
    height: 54,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  generateText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  loaderOverlay: { alignItems: "center", justifyContent: "center", gap: 16 },
  orb: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center" },
  loaderTitle: { color: "#fff", fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  loaderSub: { color: "rgba(255,255,255,0.75)", fontSize: 13 },
});
