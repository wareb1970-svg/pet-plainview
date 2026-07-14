import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Image, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useTheme } from "@/src/theme/ThemeProvider";
import { api, Transformation } from "@/src/api/client";

export default function Gallery() {
  const { colors } = useTheme();
  const router = useRouter();
  const [items, setItems] = useState<Transformation[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "favs">("all");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.listTransformations(tab === "favs");
      setItems(r.items);
    } catch {}
  }, [tab]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={["top"]}>
        <View style={styles.header}>
          <Text style={[styles.h1, { color: colors.text }]}>Gallery</Text>
          <View style={[styles.tabs, { backgroundColor: colors.surfaceMuted }]}>
            <Pressable
              testID="tab-all"
              onPress={() => setTab("all")}
              style={[styles.tab, tab === "all" && { backgroundColor: colors.surfaceElevated }]}
            >
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>All</Text>
            </Pressable>
            <Pressable
              testID="tab-favs"
              onPress={() => setTab("favs")}
              style={[styles.tab, tab === "favs" && { backgroundColor: colors.surfaceElevated }]}
            >
              <Ionicons name="heart" size={14} color={colors.accent} />
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>Favorites</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : items.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="images-outline" size={40} color={colors.textMuted} />
          <Text style={{ color: colors.text, fontWeight: "800", marginTop: 10, fontSize: 16 }}>
            Nothing here yet
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: "center", marginTop: 6 }}>
            Transformations you create will show up here.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.grid}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {items.map((it) => (
            <Pressable
              key={it.id}
              testID={`gallery-item-${it.id}`}
              onPress={() => router.push({ pathname: "/result/[id]", params: { id: it.id } })}
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Image
                source={{ uri: `data:image/png;base64,${it.image_base64}` }}
                style={styles.img}
              />
              <View style={{ padding: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  {it.favorite && <Ionicons name="heart" size={12} color={colors.accent} />}
                  <Text style={{ color: colors.text, fontWeight: "700" }} numberOfLines={1}>
                    {it.name}
                  </Text>
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                  {it.occupation}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  h1: { fontSize: 30, fontWeight: "800", letterSpacing: -0.5 },
  tabs: { flexDirection: "row", padding: 4, borderRadius: 999 },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  grid: {
    paddingHorizontal: 20,
    paddingBottom: 120,
    gap: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  card: { width: "48%", borderRadius: 20, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth },
  img: { width: "100%", aspectRatio: 1, backgroundColor: "#000" },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
});
