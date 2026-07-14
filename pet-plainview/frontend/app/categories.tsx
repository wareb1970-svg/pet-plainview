import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";

import { useTheme } from "@/src/theme/ThemeProvider";
import { api, Category } from "@/src/api/client";

export default function Categories() {
  const { colors } = useTheme();
  const router = useRouter();
  const { current } = useLocalSearchParams<{ current?: string }>();
  const [groups, setGroups] = useState<Record<string, Category[]>>({});
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string>(current ?? "surprise");

  useEffect(() => {
    (async () => {
      try {
        const r = await api.categories();
        setGroups(r.groups);
      } catch {}
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!q.trim()) return groups;
    const needle = q.toLowerCase();
    const out: Record<string, Category[]> = {};
    Object.entries(groups).forEach(([g, list]) => {
      const items = list.filter((c) => c.label.toLowerCase().includes(needle));
      if (items.length) out[g] = items;
    });
    return out;
  }, [groups, q]);

  function pick(slug: string) {
    setSelected(slug);
    router.replace({ pathname: "/create", params: { slug } });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={["top"]}>
        <View style={styles.header}>
          <Pressable testID="cats-back" onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Choose a life</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
          <View style={[styles.search, { backgroundColor: colors.surfaceMuted }]}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              testID="cats-search"
              value={q}
              onChangeText={setQ}
              placeholder="Search themes"
              placeholderTextColor={colors.textMuted}
              style={{ flex: 1, color: colors.text }}
            />
          </View>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {/* Surprise Me pinned */}
        <Pressable testID="cat-surprise" onPress={() => pick("surprise")} style={{ marginHorizontal: 20 }}>
          <LinearGradient colors={colors.gradient} style={styles.surprise}>
            <View style={{ flex: 1 }}>
              <Text style={styles.surpriseT}>Surprise Me</Text>
              <Text style={styles.surpriseS}>Let AI pick something wild</Text>
            </View>
            {selected === "surprise" ? (
              <Ionicons name="checkmark-circle" size={22} color="#fff" />
            ) : (
              <Ionicons name="sparkles" size={22} color="#fff" />
            )}
          </LinearGradient>
        </Pressable>

        {Object.entries(filtered).map(([group, items]) => (
          <View key={group} style={{ marginTop: 20 }}>
            <Text style={[styles.groupTitle, { color: colors.textMuted }]}>{group.toUpperCase()}</Text>
            <View style={styles.grid}>
              {items.map((c) => {
                const active = selected === c.slug;
                return (
                  <Pressable
                    key={c.slug}
                    testID={`cat-pick-${c.slug}`}
                    onPress={() => pick(c.slug)}
                    style={[
                      styles.card,
                      {
                        backgroundColor: colors.surface,
                        borderColor: active ? colors.primary : colors.border,
                        borderWidth: active ? 2 : StyleSheet.hairlineWidth,
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 26 }}>{c.emoji}</Text>
                    <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>{c.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20 },
  headerTitle: { fontSize: 18, fontWeight: "800" },
  search: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, height: 44, borderRadius: 14 },
  surprise: {
    marginTop: 6,
    borderRadius: 22,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  surpriseT: { color: "#fff", fontWeight: "800", fontSize: 18 },
  surpriseS: { color: "rgba(255,255,255,0.9)", fontSize: 12, marginTop: 2 },

  groupTitle: {
    paddingHorizontal: 20,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  grid: {
    paddingHorizontal: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  card: {
    width: "31%",
    minHeight: 96,
    borderRadius: 18,
    padding: 12,
    justifyContent: "space-between",
  },
});
