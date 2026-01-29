import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { Slot, useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import Toast from "react-native-toast-message";

function LayoutContent() {
  const { user, appState } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Don't redirect while the app is still checking Firebase
    if (appState === "loading") return;

    if (appState === "login") {
      router.replace("/");
    } else if (appState === "admin_setup") {
      router.replace("/admin/setup");
    } else if (appState === "admin_dashboard") {
      router.replace("/admin/dashboard");
    } else if (appState === "resident_dashboard") {
      router.replace("/resident/dashboard");
    }
  }, [appState]);

  if (appState === "loading") {
    return (
      <View style={{ flex: 1, justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return <Slot />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <LayoutContent />
      <Toast />
    </AuthProvider>
  );
}
