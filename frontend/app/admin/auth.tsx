import { appId, auth, db } from "@/configs/firebaseConfig";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Toast from "react-native-toast-message";

export default function AdminAuth() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState("");

  // Forgot Password States
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [isForgotLoading, setIsForgotLoading] = useState(false);

  const handleEmailChange = (val: string) => {
    setEmail(val);
    if (!isLogin && val.length > 0) {
      if (!val.toLowerCase().endsWith("@gmail.com")) {
        setEmailError("Only @gmail.com leads are allowed");
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

    // Validate email domain for registration BEFORE any Firebase calls
    if (!isLogin && !email.toLowerCase().endsWith("@gmail.com")) {
      setEmailError("Only @gmail.com leads are allowed");
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
    const provider = new GoogleAuthProvider();

    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // CHECK DOMAIN IMMEDIATELY - before anything else
      if (user.email && !user.email.toLowerCase().endsWith("@gmail.com")) {
        // Sign out and wait for it to complete
        await signOut(auth);
        Toast.show({
          type: "error",
          text1: "Invalid Email Domain",
          text2: "Only @gmail.com accounts are allowed for admin registration.",
        });
        return;
      }

      const societyDocRef = doc(
        db,
        `artifacts/${appId}/public/data/societies`,
        user.uid,
      );
      const societyDoc = await getDoc(societyDocRef);

      if (isLogin && !societyDoc.exists()) {
        await signOut(auth);
        Toast.show({
          type: "info",
          text1: "Society Not Found",
          text2: "Please register your society first.",
        });
        setIsLogin(false);
        return;
      }

      Toast.show({
        type: "success",
        text1: isLogin ? "Welcome Back!" : "Account Created!",
        text2: "Redirecting...",
      });
    } catch (error: any) {
      Toast.show({
        type: "error",
        text1: "Login Failed",
        text2: error.message,
      });
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
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Back to Home</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Forgot Password Modal Content (Simplified as conditional Overlay or replacement) */}
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
});
