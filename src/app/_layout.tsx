import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { SessionProvider, useSession } from "@/lib/session";
import { theme } from "@/lib/theme";

function Navigator() {
  const { driver, loading } = useSession();
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: theme.primary }}>
        <ActivityIndicator color={theme.white} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.primary },
        headerTintColor: theme.white,
        headerTitleStyle: { fontWeight: "700" },
        headerBackButtonDisplayMode: "minimal",
      }}
    >
      {/* Signed-out drivers only see the sign-in screen. */}
      <Stack.Protected guard={!driver}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!!driver}>
        <Stack.Screen name="index" options={{ title: "Rabbit Driver" }} />
        <Stack.Screen name="order/[id]" options={{ title: "Delivery" }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="light" />
      <Navigator />
    </SessionProvider>
  );
}
