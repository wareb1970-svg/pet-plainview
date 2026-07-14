import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  ScrollView,
  Platform,
  Share,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as MediaLibrary from "expo-media-library";
import { useLocalSearchParams, useRouter } from "expo-router";

import { useTheme } from "@/src/theme/ThemeProvider";
import { useAuth } from "@/src/auth/AuthProvider";
import { api, Transformation } from "@/src/api/client";

const TEMPLATES = [
  { key: "clean", label: "Clean", accent: ["#0F172A", "#334155"] as const },
  { key: "polaroid", label: "Polaroid", accent: ["#FFFFFF", "#F1F5F9"] as const },
  { key: "poster", label: "Movie Poster", accent: ["#111", "#7F1D1D"] as const },
  { key: "magazine", label: "Magazine", accent: ["#FDE68A", "#DC2626"] as const },
  { key: "wanted", label: "Wanted", accent: ["#D6B981", "#7C2D12"] as const },
  { key: "royal", label: "Royal", accent: ["#3B0764", "#F59E0B"] as const },
  { key: "card", label: "Trading Card", accent: ["#065F46", "#EAB308"] as const },
  { key: "fantasy", label: "Fantasy", accent: ["#3730A3", "#A21CAF"] as const },
  { key: "time", label: "Time", accent: ["#FFFFFF", "#B91C1C"] as const },
  { key: "meme", label: "Meme", accent: ["#FFFFFF", "#000000"] as const },
] as const;

type TplKey = (typeof TEMPLATES)[number]["key"];

export default function Result() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();

  const [item, setItem] = useState<Transformation | null>(null);
  const [loading, setLoading] = useState(true);
  const [tpl, setTpl] = useState<TplKey>("clean");
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const t = await api.getTransformation(id);
        setItem(t);
      } catch {}
      finally { setLoading(false); }
    })();
  }, [id]);

  async function toggleFav() {
    if (!item) return;
    const r = await api.toggleFavorite(item.id);
    setItem({ ...item, favorite: r.favorite });
  }

  async function regenerate() {
    if (!item) return;
    try {
      setRegenerating(true);
      const r = await api.transform({
        image_base64: item.image_base64, // reuse existing generated as reference is OK-ish; better would be original — future.
        pet_name: item.pet_name ?? undefined,
        category_slug: item.category_slug,
      });
      router.replace({ pathname: "/result/[id]", params: { id: r.id, fresh: "1" } });
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 402) router.push("/paywall");
    } finally {
      setRegenerating(false);
    }
  }

  async function download() {
    if (!item) return;
    if (Platform.OS === "web") {
      try {
        const link = document.createElement("a");
        link.href = `data:image/png;base64,${item.image_base64}`;
        link.download = `${item.name.replace(/\s+/g, "_")}.png`;
        link.click();
      } catch {}
      return;
    }
    try {
      const path = `${FileSystem.cacheDirectory}${item.id}.png`;
      await FileSystem.writeAsStringAsync(path, item.image_base64, { encoding: FileSystem.EncodingType.Base64 });
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (perm.granted) {
        await MediaLibrary.saveToLibraryAsync(path);
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path);
      }
    } catch {}
  }

  async function share() {
    if (!item) return;
    const message = `${item.name} — ${item.occupation}\n${item.biography}\n\nMade with What If My Pet Was… 🐾`;
    if (Platform.OS === "web") {
      try {
        if ((navigator as any).share) {
          await (navigator as any).share({ title: item.name, text: message });
        } else {
          await navigator.clipboard.writeText(message);
        }
      } catch {}
      return;
    }
    try {
      const path = `${FileSystem.cacheDirectory}${item.id}.png`;
      await FileSystem.writeAsStringAsync(path, item.image_base64, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { dialogTitle: item.name });
      } else {
        await Share.share({ message });
      }
    } catch {}
  }

  if (loading || !item) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const template = TEMPLATES.find((t) => t.key === tpl)!;
  const showWatermark = item.watermark && !user?.is_premium;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={["top"]}>
        <View style={styles.header}>
          <Pressable testID="result-back" onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            {item.category_label}
          </Text>
          <Pressable testID="fav-btn" onPress={toggleFav} style={styles.iconBtn}>
            <Ionicons
              name={item.favorite ? "heart" : "heart-outline"}
              size={22}
              color={item.favorite ? colors.accent : colors.text}
            />
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        {/* Portrait card */}
        <View style={{ paddingHorizontal: 20 }}>
          <View style={[styles.portraitCard, { borderColor: colors.border }]}>
            <LinearGradient colors={template.accent} style={StyleSheet.absoluteFillObject} />
            <View style={styles.portraitInner}>
              <Image
                source={{ uri: `data:image/png;base64,${item.image_base64}` }}
                style={styles.portrait}
                resizeMode="cover"
              />
              {showWatermark && (
                <View style={styles.watermark}>
                  <Text style={styles.watermarkText}>WHATIFMYPET</Text>
                </View>
              )}
              {template.key === "poster" && (
                <View style={styles.posterTitle}>
                  <Text style={styles.posterName}>{item.name.toUpperCase()}</Text>
                  <Text style={styles.posterSub}>{item.occupation}</Text>
                </View>
              )}
              {template.key === "magazine" && (
                <View style={styles.magHeader}>
                  <Text style={styles.magLogo}>PET WEEKLY</Text>
                  <Text style={styles.magCover}>{item.name}</Text>
                </View>
              )}
              {template.key === "wanted" && (
                <View style={styles.wantedHeader}>
                  <Text style={styles.wantedBig}>WANTED</Text>
                  <Text style={styles.wantedSub}>{item.name}</Text>
                </View>
              )}
              {template.key === "time" && (
                <View style={styles.timeHeader}>
                  <Text style={styles.timeLogo}>TIME</Text>
                </View>
              )}
              {template.key === "polaroid" && (
                <View style={styles.polaroidFoot}>
                  <Text style={styles.polaroidText}>{item.name}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Copy card */}
          <View style={[styles.copyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
            <Text style={[styles.occupation, { color: colors.primary }]}>{item.occupation}</Text>
            <Text style={[styles.personality, { color: colors.textMuted }]}>{item.personality}</Text>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Text style={[styles.bio, { color: colors.text }]}>{item.biography}</Text>
          </View>

          {/* Templates */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Share templates</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {TEMPLATES.map((t) => {
              const active = tpl === t.key;
              return (
                <Pressable
                  key={t.key}
                  testID={`tpl-${t.key}`}
                  onPress={() => setTpl(t.key)}
                  style={[
                    styles.tplChip,
                    {
                      backgroundColor: active ? colors.text : colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <LinearGradient colors={t.accent} style={styles.tplSwatch} />
                  <Text
                    style={{
                      color: active ? colors.bg : colors.text,
                      fontWeight: "700",
                      fontSize: 12,
                    }}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            <ActionBtn testID="regen-btn" icon="refresh" label={regenerating ? "…" : "Regenerate"} onPress={regenerate} disabled={regenerating} />
            <ActionBtn testID="dl-btn" icon="download" label="Download" onPress={download} />
            <ActionBtn testID="share-btn" icon="share-social" label="Share" onPress={share} highlight />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function ActionBtn({
  icon,
  label,
  onPress,
  highlight,
  disabled,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  highlight?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  const { colors } = useTheme();
  const bg = highlight ? colors.primary : colors.surface;
  const fg = highlight ? "#fff" : colors.text;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        actionStyles.btn,
        {
          backgroundColor: bg,
          borderColor: colors.border,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={18} color={fg} />
      <Text style={{ color: fg, fontWeight: "700", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

const actionStyles = StyleSheet.create({
  btn: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    flexDirection: "column",
  },
});

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20 },
  headerTitle: { fontSize: 16, fontWeight: "800", maxWidth: 220 },

  portraitCard: {
    borderRadius: 26,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
  },
  portraitInner: { padding: 12 },
  portrait: { width: "100%", aspectRatio: 1, borderRadius: 18, backgroundColor: "#000" },

  watermark: {
    position: "absolute",
    bottom: 22,
    right: 22,
    backgroundColor: "rgba(0,0,0,0.35)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  watermarkText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },

  posterTitle: { position: "absolute", left: 24, right: 24, bottom: 22 },
  posterName: { color: "#fff", fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },
  posterSub: { color: "rgba(255,255,255,0.85)", fontSize: 12, letterSpacing: 3, textTransform: "uppercase" },

  magHeader: { position: "absolute", top: 20, left: 24, right: 24, flexDirection: "row", justifyContent: "space-between" },
  magLogo: { color: "#DC2626", fontSize: 22, fontWeight: "900", fontStyle: "italic" },
  magCover: { color: "#111", fontWeight: "800", fontSize: 16 },

  wantedHeader: { position: "absolute", top: 22, left: 24, right: 24, alignItems: "center" },
  wantedBig: { color: "#7C2D12", fontSize: 32, fontWeight: "900", letterSpacing: 6 },
  wantedSub: { color: "#7C2D12", fontSize: 14, fontWeight: "800", marginTop: 2 },

  timeHeader: { position: "absolute", top: 18, left: 20 },
  timeLogo: { color: "#B91C1C", fontSize: 26, fontWeight: "900", fontStyle: "italic" },

  polaroidFoot: { position: "absolute", left: 24, right: 24, bottom: 20, alignItems: "center" },
  polaroidText: { color: "#111", fontWeight: "700", fontSize: 14 },

  copyCard: {
    marginTop: 16,
    padding: 18,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
  },
  name: { fontSize: 22, fontWeight: "800", letterSpacing: -0.3 },
  occupation: { fontSize: 13, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase", marginTop: 4 },
  personality: { fontSize: 14, marginTop: 8, lineHeight: 20 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 14 },
  bio: { fontSize: 15, lineHeight: 22 },

  sectionTitle: { color: "#fff", fontSize: 16, fontWeight: "800", marginTop: 22, marginBottom: 10 },

  tplChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tplSwatch: { width: 16, height: 16, borderRadius: 8 },

  actions: { flexDirection: "row", gap: 10, marginTop: 18 },
});
