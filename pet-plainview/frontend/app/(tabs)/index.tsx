import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";

import { useTheme } from "@/src/theme/ThemeProvider";
import { useAuth } from "@/src/auth/AuthProvider";
import { api, Category, Transformation } from "@/src/api/client";

const HERO_BG =
  "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MDV8MHwxfHNlYXJjaHwxfHxjdXRlJTIwY2F0JTIwbG9va2luZyUyMGF0JTIwY2FtZXJhfGVufDB8fHx8MTc4Mzk1NDk4NXww&ixlib=rb-4.1.0&q=85";

export default function Home() {
  const { colors, isDark } = useTheme();
  const { user, refresh } = useAuth();
  const router = useRouter();

  const [cats, setCats] = useState<Category[]>([]);
  const [recent, setRecent] = useState<Transformation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, r] = await Promise.all([api.categories(), api.listTransformations()]);
      setCats(c.categories);
      setRecent(r.items.slice(0, 8));
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      load();
    }, [refresh, load])
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refresh(), load()]);
    setRefreshing(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={["top"]}>
        <View style={styles.header}>
          <View style={styles.avatarWrap}>
            {user?.picture ? (
              <Image source={{ uri: user.picture }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: colors.surfaceMuted, alignItems: "center", justifyContent: "center" }]}>
                <Text style={{ color: colors.text, fontWeight: "700" }}>
                  {(user?.name || "?").charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View>
              <Text style={[styles.hi, { color: colors.textMuted }]}>Welcome back</Text>
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                {user?.name || "Friend"}
              </Text>
            </View>
          </View>
          <Pressable
            testID="usage-chip"
            onPress={() => (user?.is_premium ? null : router.push("/paywall"))}
            style={[styles.usage, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <Ionicons
              name={user?.is_premium ? "diamond" : "flash"}
              size={14}
              color={user?.is_premium ? colors.warning : colors.primary}
            />
            <Text style={[styles.usageText, { color: colors.text }]}>
              {user?.is_premium ? "Premium" : `${Math.max((user?.daily_limit ?? 3) - (user?.daily_used ?? 0), 0)} left`}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Surprise Me hero */}
        <Pressable
          testID="surprise-me-cta"
          onPress={() => router.push({ pathname: "/create", params: { slug: "surprise" } })}
          style={styles.heroPress}
        >
          <View style={styles.heroCard}>
            <Image source={{ uri: HERO_BG }} style={StyleSheet.absoluteFillObject} />
            <LinearGradient
              colors={["rgba(0,0,0,0.05)", "rgba(0,0,0,0.75)"]}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.heroContent}>
              <View style={styles.heroBadge}>
                <Ionicons name="sparkles" size={12} color="#fff" />
                <Text style={styles.heroBadgeText}>SURPRISE ME</Text>
              </View>
              <Text style={styles.heroTitle}>Let AI pick a life for your pet</Text>
              <Text style={styles.heroSub}>One tap. Wildly delightful results.</Text>
              <View style={styles.heroBtn}>
                <Text style={styles.heroBtnText}>Start magic</Text>
                <Ionicons name="arrow-forward" size={16} color="#0B0B0F" />
              </View>
            </View>
          </View>
        </Pressable>

        {/* Section: Featured Categories */}
        <SectionHeader title="Popular themes" onSeeAll={() => router.push("/categories")} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingBottom: 4 }}
        >
          {cats.slice(0, 12).map((c) => (
            <CategoryTile key={c.slug} category={c} />
          ))}
        </ScrollView>

        {/* Section: Recent */}
        <SectionHeader
          title="Your recent"
          onSeeAll={recent.length > 0 ? () => router.push("/(tabs)/gallery") : undefined}
        />
        {loading ? (
          <ActivityIndicator style={{ marginTop: 12 }} color={colors.primary} />
        ) : recent.length === 0 ? (
          <View style={[styles.emptyBox, { borderColor: colors.border }]}>
            <Ionicons name="paw" size={26} color={colors.textMuted} />
            <Text style={{ color: colors.text, fontWeight: "700", marginTop: 8 }}>No transformations yet</Text>
            <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 4, textAlign: "center" }}>
              Upload a pet photo and pick a theme to get started.
            </Text>
            <Pressable
              testID="empty-start-cta"
              onPress={() => router.push("/create")}
              style={{ marginTop: 12 }}
            >
              <LinearGradient colors={colors.gradient} style={styles.emptyCta}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>Create your first</Text>
              </LinearGradient>
            </Pressable>
          </View>
        ) : (
          <View style={styles.recentGrid}>
            {recent.map((r) => (
              <Pressable
                key={r.id}
                testID={`recent-${r.id}`}
                onPress={() => router.push({ pathname: "/result/[id]", params: { id: r.id } })}
                style={[styles.recentItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Image
                  source={{ uri: `data:image/png;base64,${r.image_base64}` }}
                  style={styles.recentImg}
                />
                <Text style={[styles.recentLabel, { color: colors.text }]} numberOfLines={1}>
                  {r.name}
                </Text>
                <Text style={[styles.recentSub, { color: colors.textMuted }]} numberOfLines={1}>
                  {r.occupation}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Floating action */}
      <Pressable
        testID="fab-create"
        onPress={() => router.push("/create")}
        style={styles.fab}
      >
        <LinearGradient colors={colors.gradient} style={styles.fabGrad}>
          <Ionicons name="camera" size={20} color="#fff" />
          <Text style={styles.fabText}>New</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

function SectionHeader({ title, onSeeAll }: { title: string; onSeeAll?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {onSeeAll && (
        <Pressable testID={`see-all-${title}`} onPress={onSeeAll}>
          <Text style={{ color: colors.primary, fontWeight: "600" }}>See all</Text>
        </Pressable>
      )}
    </View>
  );
}

function CategoryTile({ category }: { category: Category }) {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <Pressable
      testID={`cat-${category.slug}`}
      onPress={() => router.push({ pathname: "/create", params: { slug: category.slug } })}
      style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.97 : 1 }] }]}
    >
      <LinearGradient
        colors={colors.gradientSoft}
        style={[styles.tile, { borderColor: colors.border }]}
      >
        <Text style={{ fontSize: 30 }}>{category.emoji}</Text>
        <Text style={[styles.tileLabel, { color: colors.text }]}>{category.label}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 11 }}>{category.group}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  avatarWrap: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  hi: { fontSize: 12 },
  name: { fontSize: 16, fontWeight: "700" },
  usage: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  usageText: { fontSize: 12, fontWeight: "700" },

  heroPress: { marginHorizontal: 20, marginTop: 6 },
  heroCard: {
    height: 220,
    borderRadius: 28,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  heroContent: { padding: 20, gap: 8 },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderColor: "rgba(255,255,255,0.35)",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  heroBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  heroTitle: { color: "#fff", fontSize: 26, fontWeight: "800", letterSpacing: -0.5, lineHeight: 30 },
  heroSub: { color: "rgba(255,255,255,0.85)", fontSize: 14 },
  heroBtn: {
    marginTop: 8,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  heroBtnText: { color: "#0B0B0F", fontWeight: "700", fontSize: 14 },

  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },

  tile: {
    width: 108,
    padding: 14,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
    alignItems: "flex-start",
  },
  tileLabel: { fontSize: 14, fontWeight: "700" },

  recentGrid: {
    paddingHorizontal: 20,
    gap: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  recentItem: {
    width: "48%",
    borderRadius: 18,
    padding: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  recentImg: { width: "100%", aspectRatio: 1, borderRadius: 12, marginBottom: 8, backgroundColor: "#000" },
  recentLabel: { fontSize: 14, fontWeight: "700" },
  recentSub: { fontSize: 12, marginTop: 2 },

  emptyBox: {
    marginHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: "dashed",
    padding: 22,
    alignItems: "center",
  },
  emptyCta: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999 },

  fab: { position: "absolute", right: 20, bottom: 88, borderRadius: 999, overflow: "hidden" },
  fabGrad: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 999,
  },
  fabText: { color: "#fff", fontWeight: "800" },
});
