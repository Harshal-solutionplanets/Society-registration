import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { Slot, usePathname, useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import Toast from "react-native-toast-message";

function LayoutContent() {
  const { appState } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Don't redirect while the app is still checking Firebase
    if (appState === "loading") return;

    // Only redirect if we are on the base root or auth page
    // Define specific path groups
    const landingPaths = ["/", "/admin/auth"];
    const isLandingPage = landingPaths.includes(pathname);
    const isSetupPage = pathname === "/admin/setup";

    if (appState === "login" && !isLandingPage && !isSetupPage) {
      // Unauthenticated users can only be on landing/auth or setup (for registration)
      router.replace("/");
    } else if (appState === "admin_setup" && !isSetupPage) {
      // Admins who haven't completed setup are forced to setup page
      router.replace("/admin/setup");
    } else if (appState === "admin_dashboard" && isLandingPage) {
      // Fully registered admins on landing/auth are sent to dashboard
      router.replace("/admin/dashboard");
    } else if (appState === "resident_dashboard" && isLandingPage) {
      router.replace("/resident/dashboard");
    }
  }, [appState, pathname]);

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
