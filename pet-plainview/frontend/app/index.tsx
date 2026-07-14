import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useTheme } from "@/src/theme/ThemeProvider";

/**
 * Root splash — the auth Gate in _layout.tsx will redirect us to /login or /(tabs).
 */
export default function Index() {
  const { colors } = useTheme();

  useEffect(() => {
    // no-op — Gate handles routing
  }, []);

  return (
    <View
      testID="app-splash"
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
