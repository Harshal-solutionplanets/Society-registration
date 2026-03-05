import { auth } from "@/configs/firebaseConfig";
import { useAuth } from "@/hooks/useAuth";
import { linkResidentToUser, mockResidentSignIn } from "@/utils/authUtils";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { signInAnonymously } from "firebase/auth";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Toast from "react-native-toast-message";

export default function ResidentAuth() {
  const router = useRouter();
  const { appState, isLoading, refreshUser } = useAuth();

  // Resident Login Fields
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleResidentLogin = async () => {
    // Trim spaces from inputs
    const cleanUsername = username.trim();
    const cleanPassword = password.trim();

    // Validation with Toast pop-ups
    if (!cleanUsername) {
      Toast.show({
        type: "error",
        text1: "Missing Field",
        text2: "Please enter your Username",
      });
      return;
    }
    if (!cleanPassword) {
      Toast.show({
        type: "error",
        text1: "Missing Field",
        text2: "Please enter your Password",
      });
      return;
    }

    setIsLoggingIn(true);
    try {
      // 1. Sign in anonymously to get a UID
      let user = auth.currentUser;
      if (!user) {
        const userCredential = await signInAnonymously(auth);
        user = userCredential.user;
      }

      // 2. Find the unit and verify credentials
      const { unit, adminUID } = await mockResidentSignIn(
        cleanUsername,
        cleanPassword,
      );

      // 3. Link the authenticated resident to the current Firebase user
      await linkResidentToUser(user, unit, adminUID);

      // Force a refresh of the auth state (Triggers immediate redirect)
      await refreshUser();

      Toast.show({
        type: "success",
        text1: "Login Successful",
        text2: `Welcome to ${unit.societyName || "your society"}`,
      });
    } catch (error: any) {
      console.error("Login Error:", error);
      Toast.show({
        type: "error",
        text1: "Login Failed",
        text2: "Invalid login credentials. Please contact society admin.",
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#14B8A6" />
      </View>
    );
  }

  if (appState === "admin_setup") return <Redirect href="/admin/setup" />;
  if (appState === "admin_dashboard")
    return <Redirect href="/admin/dashboard" />;
  if (appState === "resident_dashboard")
    return <Redirect href="/resident/dashboard" />;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <StatusBar barStyle="dark-content" />

      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.replace("/")}
      >
        <Ionicons name="arrow-back" size={24} color="#14B8A6" />
        <Text style={styles.backButtonText}>Back</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.adminButton}
        onPress={() => router.push("/admin/auth")}
      >
        <Text style={styles.adminButtonText}>Admin Login</Text>
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerSection}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <Image
              source={require("../../assets/images/logo.png")}
              style={{ width: 40, height: 40 }}
              resizeMode="contain"
            />
            <Text
              style={{
                fontSize: 24,
                fontWeight: "900",
                color: "#14B8A6",
                marginLeft: 10,
                letterSpacing: -0.5,
              }}
            >
              Zonect
            </Text>
          </View>
          <Text style={styles.title}>Resident Access</Text>
          <Text style={styles.subtitle}>
            Enter your credentials provided by the society admin
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. BLD-A-101"
              placeholderTextColor="#94A3B8"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="characters"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="••••••••"
                placeholderTextColor="#94A3B8"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color="#64748B"
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, isLoggingIn && styles.buttonDisabled]}
            onPress={handleResidentLogin}
            disabled={isLoggingIn}
          >
            {isLoggingIn ? (
              <ActivityIndicator color="white" />
            ) : (
              <View style={styles.buttonInner}>
                <Text style={styles.buttonText}>Sign In</Text>
                <Ionicons
                  name="arrow-forward"
                  size={18}
                  color="#fff"
                  style={{ marginLeft: 8 }}
                />
              </View>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.footerText}>
          Need help? Please contact your society Admin.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
  headerSection: {
    alignItems: "center",
    marginBottom: 28,
    maxWidth: 400,
    width: "100%",
    alignSelf: "center",
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#E6FFFA",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F2A3D",
  },
  subtitle: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
    marginTop: 6,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#0F2A3D",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 3,
    maxWidth: 400,
    width: "100%",
    alignSelf: "center",
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F2A3D",
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    backgroundColor: "#F1F5F9",
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: "#0F2A3D",
  },
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
  },
  eyeButton: {
    padding: 12,
  },
  button: {
    backgroundColor: "#14B8A6",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
    shadowColor: "#14B8A6",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  backButton: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 30,
    left: 20,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 100,
  },
  backButtonText: {
    color: "#14B8A6",
    fontSize: 15,
    fontWeight: "700",
    marginLeft: 4,
  },
  adminButton: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 30,
    right: 20,
    backgroundColor: "#FFFFFF",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    zIndex: 100,
  },
  adminButtonText: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: "700",
  },
  footerText: {
    textAlign: "center",
    color: "#94A3B8",
    fontSize: 13,
    marginTop: 40,
  },
});
