import { appId, auth, db } from "@/configs/firebaseConfig";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signOut,
  User,
} from "firebase/auth";
import { doc, getDoc, getDocFromServer } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Toast from "react-native-toast-message";

export default function AdminAuth() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true); // START AS TRUE
  const hasRedirected = useRef(false);
  const isInitializing = useRef(true); // Track initial check phase

  // Helper function to handle the authenticated user
  const handleAuthenticatedUser = async (user: User) => {
    if (hasRedirected.current || !user?.email) return;

    console.log("[Auth] Processing user:", user?.email);

    Toast.show({
      type: "info",
      text1: "Checking Account...",
      text2: `Logged in as ${user.email}`,
    });

    // Domain validation
    if (user.email && !user.email.toLowerCase().endsWith("@gmail.com")) {
      console.log("[Auth] Invalid domain, signing out");
      await signOut(auth);
      Toast.show({
        type: "error",
        text1: "Invalid Email Domain",
        text2: "Only @gmail.com accounts are allowed for admin registration.",
      });
      return;
    }

    // Check if society exists - FORCE SERVER READ TO AVOID CACHE POLLUTION
    console.log("[Auth] Checking Firestore for society...");
    const societyDocRef = doc(
      db,
      `artifacts/${appId}/public/data/societies`,
      user?.uid,
    );

    let societyDoc;
    try {
      // CRITICAL: Always use getDocFromServer to bypass cache
      societyDoc = await getDocFromServer(societyDocRef);
      console.log("[Auth] Server fetch successful");

      if (societyDoc.exists()) {
        const data = societyDoc.data();
        console.log("[Auth] Document data:", data);

        // CRITICAL: Verify the document has actual setup data, not just the drive link stub
        const hasCompleteSetup =
          data.societyName && data.driveFolderId && data.role === "ADMIN";

        if (hasCompleteSetup) {
          console.log(
            "[Auth] Complete society profile found, redirecting to dashboard",
          );

          // User is a fully registered admin - show welcome message
          Toast.show({
            type: "success",
            text1: `Welcome back!`,
            text2: `Logged in to ${data.societyName || "your dashboard"}`,
            visibilityTime: 3000,
          });

          hasRedirected.current = true;
          router.replace("/admin/dashboard");
        } else {
          console.log(
            "[Auth] Incomplete profile (only drive link), redirecting to setup",
          );

          // New admin but drive is linked - move to setup
          hasRedirected.current = true;
          router.replace("/admin/setup");
        }
      } else {
        console.log("[Auth] No society document found, going to setup");
        hasRedirected.current = true;
        router.replace("/admin/setup");
      }
    } catch (e: any) {
      console.error("[Auth] Server fetch FAILED:", e);
      console.error("[Auth] Error code:", e.code);
      console.error("[Auth] Error message:", e.message);
      // If server fetch fails, redirect to setup to be safe
      hasRedirected.current = true;
      router.replace("/admin/setup");
    }
  };

  useEffect(() => {
    console.log("[Auth] Starting auth listeners...");

    const checkInitialState = async () => {
      try {
        // 1. Check getRedirectResult first
        const result = await getRedirectResult(auth);
        console.log(
          "[Auth] getRedirectResult:",
          result ? "User found" : "No result",
        );

        if (result?.user) {
          await handleAuthenticatedUser(result.user);
        } else {
          // 2. If no redirect result, check current user
          const user = auth.currentUser;
          if (user) {
            await handleAuthenticatedUser(user);
          }
        }
      } catch (error: any) {
        console.error(
          "[Auth] Initialization error:",
          error.code,
          error.message,
        );
      } finally {
        setLoading(false);
        isInitializing.current = false;
      }
    };

    // 3. Backup listener for auth changes
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log("[Auth] onAuthStateChanged:", user?.email || "No user");

      // If we already finished initialization and a user appears, handle it
      if (user && !isInitializing.current && !hasRedirected.current) {
        handleAuthenticatedUser(user);
      }
    });

    const handleMessage = async (event: MessageEvent) => {
      // Security: You might want to check event.origin here in production
      console.log("[Auth] Received message:", event.data?.type);

      if (
        event.data &&
        event.data.type === "GOOGLE_AUTH_SUCCESS" &&
        event.data.token
      ) {
        console.log("[Auth] Received unified token from popup");
        setLoading(true);
        try {
          await signInWithCustomToken(auth, event.data.token);
        } catch (error) {
          console.error("[Auth] Custom Token Sign-in failed:", error);
          setLoading(false);
          Toast.show({
            type: "error",
            text1: "Login Failed",
            text2: "Could not finalize registration.",
          });
        }
      } else if (event.data && event.data.type === "GOOGLE_HANDSHAKE_SUCCESS") {
        console.log("[Auth] Handshake success, moving to setup...");
        setLoading(false); // Stop buffer before navigating
        router.replace({
          pathname: "/admin/setup",
          params: {
            setupEmail: event.data.email,
            setupSessionId: event.data.setupSessionId,
          },
        });
      } else if (event.data && event.data.type === "GOOGLE_AUTH_ERROR") {
        console.log("[Auth] Error message received:", event.data.message);
        setLoading(false);
        Toast.show({
          type: "error",
          text1: "Login Failed",
          text2: event.data.message || "Please check your credentials.",
        });
      }
    };

    window.addEventListener("message", handleMessage);
    checkInitialState();

    return () => {
      unsubscribe();
      window.removeEventListener("message", handleMessage);
    };
  }, []);
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState("");

  // Forgot Password States
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [isForgotLoading, setIsForgotLoading] = useState(false);

  const handleEmailChange = (val: string) => {
    setEmail(val);
    if (val.length > 0) {
      if (!val.toLowerCase().endsWith("@gmail.com")) {
        setEmailError("Only @gmail.com accounts are permitted");
      } else {
        setEmailError("");
      }
    } else {
      setEmailError("");
    }
  };

  const handleAuth = async () => {
    if (!email || !password) {
      Toast.show({ type: "error", text1: "Error", text2: "Missing fields" });
      return;
    }

    // Validate email domain BEFORE any Firebase calls
    if (!email.toLowerCase().endsWith("@gmail.com")) {
      setEmailError("Only @gmail.com accounts are permitted.");
      Toast.show({
        type: "error",
        text1: "Access Denied",
        text2: "Please use your @gmail.com account.",
      });
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        // 1. SIGN IN
        const userCredential = await signInWithEmailAndPassword(
          auth,
          email,
          password,
        );
        const uid = userCredential.user.uid;

        // 2. CHECK AUTHORIZATION (Is this user in our Firestore?)
        const societyDocRef = doc(
          db,
          `artifacts/${appId}/public/data/societies`,
          uid,
        );
        const societyDoc = await getDoc(societyDocRef);

        if (!societyDoc.exists()) {
          // User exists in Firebase Auth but NOT in our Society Database
          await signOut(auth); // Kick them out
          Toast.show({
            type: "info",
            text1: "Not Registered",
            text2: "Account not found. Please Sign-up first.",
          });
          setIsLogin(false); // Move them to Register tab automatically
          return;
        }

        if (societyDoc.exists()) {
          // Society document exists, we can proceed to dashboard
        }
      } else {
        // REGISTRATION FLOW - Email already validated above
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (error: any) {
      Toast.show({
        type: "error",
        text1: "Authentication Failed",
        text2: "Invalid Email or Password",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    const isWeb = Platform.OS === "web";
    const backendUrl = isWeb
      ? window.location.origin + "/api"
      : process.env.EXPO_PUBLIC_BACKEND_URL ||
        "https://asia-south1-zonect-8d847.cloudfunctions.net/api";

    // Use a unified URL that handles both Identity + Drive in ONE popup
    // We pass isSignup flag to determine if we need to force 'consent' prompt
    const url = `${backendUrl}/auth/google/url?appId=${appId}&isSignup=${!isLogin}`;

    if (Platform.OS === "web") {
      const popup = window.open(url, "Google Sign In", "width=600,height=700");

      // Safeguard: If user closes the popup manually OR it finishes without a message
      const checkPopup = setInterval(() => {
        if (!popup || popup.closed) {
          clearInterval(checkPopup);
          // Small delay to allow any pending postMessage to arrive first
          setTimeout(() => setLoading(false), 1000);
        }
      }, 1000);
    } else {
      Linking.openURL(url);
    }
  };

  // Forgot Password Handlers
  const handleForgotPassword = async () => {
    if (!email) {
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Enter your registered admin email.",
      });
      return;
    }

    setIsForgotLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      Toast.show({
        type: "success",
        text1: "Email Sent",
        text2: "Please check your inbox for reset instructions.",
      });
      setShowForgotPassword(false);
    } catch (err: any) {
      console.error(err);
      Toast.show({
        type: "error",
        text1: "Error",
        text2:
          err.code === "auth/user-not-found"
            ? "Account not found."
            : "Failed to send reset email.",
      });
    } finally {
      setIsForgotLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Initializing Session...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Society Admin</Text>
        <Text style={styles.subtitle}>
          {isLogin ? "Login to Manage your Society" : "Register your Society"}
        </Text>

        <View style={styles.card}>
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, isLogin && styles.activeTab]}
              onPress={() => setIsLogin(true)}
            >
              <Text style={[styles.tabText, isLogin && styles.activeTabText]}>
                Login
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, !isLogin && styles.activeTab]}
              onPress={() => setIsLogin(false)}
            >
              <Text style={[styles.tabText, !isLogin && styles.activeTabText]}>
                Register
              </Text>
            </TouchableOpacity>
          </View>

          {/* ===== EMAIL/PASSWORD FIELDS - COMMENTED FOR INITIAL DEPLOYMENT =====
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email Address</Text>
            <TextInput
              style={[styles.input, emailError ? styles.inputError : null]}
              placeholder="admin@gmail.com"
              placeholderTextColor="#94A3B8"
              value={email}
              onChangeText={handleEmailChange}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            {emailError ? (
              <Text style={styles.errorText}>{emailError}</Text>
            ) : null}
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

          {isLogin && (
            <TouchableOpacity
              style={styles.forgotLink}
              onPress={() => setShowForgotPassword(true)}
            >
              <Text style={styles.forgotLinkText}>Forgot Password?</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleAuth}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>
                {isLogin ? "Login" : "Register"}
              </Text>
            )}
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>
          ===== END EMAIL/PASSWORD FIELDS ===== */}

          <TouchableOpacity
            style={styles.googleButton}
            onPress={handleGoogleSignIn}
          >
            <View style={styles.googleButtonContent}>
              <Ionicons
                name="logo-google"
                size={20}
                color="#475569"
                style={styles.googleIcon}
              />
              <Text style={styles.googleButtonText}>
                {isLogin ? "Sign in with Google" : "Sign up with Google"}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/");
            }
          }}
        >
          <Text style={styles.backButtonText}>Back to Home</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ===== FORGOT PASSWORD MODAL - COMMENTED FOR INITIAL DEPLOYMENT =====
      {showForgotPassword && (
        <View style={[StyleSheet.absoluteFill, styles.overlay]}>
          <View style={styles.forgotCard}>
            <View style={styles.forgotHeader}>
              <Text style={styles.forgotTitle}>Reset Password</Text>
              <TouchableOpacity onPress={() => setShowForgotPassword(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View>
              <Text style={styles.forgotDesc}>
                Enter your registered admin email to receive a password reset
                link.
              </Text>
              <TextInput
                style={styles.input}
                placeholder="admin@gmail.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={[
                  styles.button,
                  isForgotLoading && styles.buttonDisabled,
                ]}
                onPress={handleForgotPassword}
                disabled={isForgotLoading}
              >
                {isForgotLoading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.buttonText}>Send Reset Email</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
      ===== END FORGOT PASSWORD MODAL ===== */}
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
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#64748B",
    textAlign: "center",
    marginBottom: 32,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 4,
  },
  tabs: {
    flexDirection: "row",
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  activeTab: {
    borderBottomColor: "#3B82F6",
  },
  tabText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#94A3B8",
  },
  activeTabText: {
    color: "#3B82F6",
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 8,
    marginLeft: 4,
  },
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
  },
  input: {
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: "#0F172A",
  },
  eyeButton: {
    padding: 12,
  },
  button: {
    backgroundColor: "#3B82F6",
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E2E8F0",
  },
  dividerText: {
    marginHorizontal: 12,
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  googleButton: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  googleButtonContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  googleIcon: {
    marginRight: 10,
  },
  googleButtonText: {
    color: "#475569",
    fontSize: 16,
    fontWeight: "700",
  },
  backButton: {
    marginTop: 32,
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#FEF2F2",
  },
  backButtonText: {
    color: "#EF4444",
    fontSize: 14,
    fontWeight: "700",
  },
  errorText: {
    color: "#EF4444",
    fontSize: 11,
    marginTop: 4,
    marginLeft: 4,
    fontWeight: "600",
  },
  inputError: {
    borderColor: "#EF4444",
    backgroundColor: "#FFF1F2",
  },
  forgotLink: {
    alignSelf: "flex-end",
    marginTop: -10,
    marginBottom: 20,
    marginRight: 4,
  },
  forgotLinkText: {
    color: "#3B82F6",
    fontSize: 13,
    fontWeight: "700",
  },
  overlay: {
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    zIndex: 1000,
    justifyContent: "center",
    padding: 24,
  },
  forgotCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.2,
    shadowRadius: 30,
    elevation: 10,
  },
  forgotHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  forgotTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
  },
  forgotDesc: {
    fontSize: 14,
    color: "#64748B",
    lineHeight: 20,
    marginBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
  loadingText: {
    marginTop: 16,
    color: "#64748B",
    fontSize: 14,
    fontWeight: "600",
  },
});
