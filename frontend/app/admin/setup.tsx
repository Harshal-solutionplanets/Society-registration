import { appId, db } from "@/configs/firebaseConfig";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "expo-router";
import { doc, getDoc, setDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
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

export default function AdminSetup() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [formData, setFormData] = useState({
    societyName: "",
    societyAddress: "",
    registrationNo: "",
    pincode: "",
    googleLocation: "",
    wingCount: "",
    adminName: "",
    adminContact: "",
  });
  const [isDriveLinked, setIsDriveLinked] = useState(false);

  const [societyRef, setSocietyRef] = useState<any>(null);

  useEffect(() => {
    if (user) {
      fetchSocietyData();
    }
  }, [user]);

  const fetchSocietyData = async () => {
    if (!user) return;
    try {
      const societyDoc = await getDoc(
        doc(db, `artifacts/${appId}/public/data/societies`, user.uid),
      );
      if (societyDoc.exists()) {
        const data = societyDoc.data();
        setFormData({
          societyName: data.societyName || "",
          societyAddress: data.societyAddress || "",
          registrationNo: data.registrationNo || "",
          pincode: data.pincode || "",
          googleLocation: data.googleLocation || "",
          wingCount: data.wingCount?.toString() || "",
          adminName: data.adminName || "",
          adminContact: data.adminContact || "",
        });
        setIsDriveLinked(!!data.isDriveLinked);
        setIsEditMode(true);
      }
    } catch (error) {
      console.error("Error fetching society data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = async () => {
    await signOut();
    router.replace("/admin/auth");
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleLinkDrive = async () => {
    if (!user) return;
    try {
      const backendUrl =
        process.env.EXPO_PUBLIC_BACKEND_URL || "http://localhost:3001";
      const res = await fetch(
        `${backendUrl}/api/auth/google/url?adminUID=${user.uid}&appId=${appId}`,
      );
      const { url } = await res.json();
      if (url) {
        if (Platform.OS === "web") {
          const authWindow = window.open(url, "_blank", "width=600,height=700");

          // Poll for drive status update
          const checkStatus = setInterval(async () => {
            const societyDoc = await getDoc(
              doc(db, `artifacts/${appId}/public/data/societies`, user.uid),
            );
            if (societyDoc.exists() && societyDoc.data().isDriveLinked) {
              setIsDriveLinked(true);
              clearInterval(checkStatus);
              Toast.show({
                type: "success",
                text1: "Drive Linked",
                text2: "Google Drive connected successfully!",
              });
            }
          }, 3000);

          // Stop polling after 5 minutes
          setTimeout(() => clearInterval(checkStatus), 300000);
        } else {
          Toast.show({
            type: "info",
            text1: "Notice",
            text2: "Drive Linking is currently supported on Web only.",
          });
        }
      }
    } catch (error) {
      console.error("Link Drive Error:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Could not connect to backend server.",
      });
    }
  };

  const handleSetup = async () => {
    const { societyName, wingCount, pincode, adminName } = formData;

    // Validation for essential fields
    if (!societyName || !wingCount || !pincode || !adminName) {
      Toast.show({
        type: "error",
        text1: "Required Fields",
        text2: "Please fill in all essential fields.",
      });
      return;
    }

    if (!user || !user.email) {
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "User authentication failed. Please log in again.",
      });
      return;
    }

    if (!isDriveLinked) {
      Toast.show({
        type: "error",
        text1: "Drive Not Linked",
        text2: "Please connect your Google Drive first.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      let realFolderId = null;

      if (!isEditMode) {
        // Fetch the stored driveAccessToken from when they linked drive
        const societyDoc = await getDoc(
          doc(db, `artifacts/${appId}/public/data/societies`, user.uid),
        );
        const token = societyDoc.data()?.driveAccessToken;

        if (!token)
          throw new Error(
            "Drive access token missing. Please link drive again.",
          );

        // 1. Create the physical folder in Google Drive only during initial setup
        const driveResponse = await fetch(
          "https://www.googleapis.com/drive/v3/files",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: `${societyName.toUpperCase()}-DRIVE`,
              mimeType: "application/vnd.google-apps.folder",
            }),
          },
        );

        if (!driveResponse.ok) {
          const errorData = await driveResponse.json();
          throw new Error(
            errorData.error?.message || "Failed to create Google Drive folder",
          );
        }

        const driveData = await driveResponse.json();
        realFolderId = driveData.id;
      }

      // 2. Save everything to Firestore
      const updateData: any = {
        ...formData,
        wingCount: parseInt(wingCount),
        adminUserId: user.uid,
        adminEmail: user.email,
        updatedAt: new Date().toISOString(),
      };

      if (!isEditMode) {
        updateData.driveEmail = user.email;
        updateData.driveFolderId = realFolderId;
        updateData.isDriveLinked = true;
        updateData.role = "ADMIN";
        updateData.createdAt = new Date().toISOString();
      }

      await setDoc(
        doc(db, `artifacts/${appId}/public/data/societies`, user.uid),
        updateData,
        { merge: true },
      );

      Toast.show({
        type: "success",
        text1: isEditMode ? "Update Successful" : "Setup Successful",
        text2: isEditMode
          ? "Profile updated!"
          : "Society and Drive folder created!",
      });
      router.replace("/admin/dashboard");
    } catch (error: any) {
      console.error("Setup error:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: error.message || "Could not save society data.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.mainContainer}
    >
      <StatusBar barStyle="dark-content" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerContainer}>
          <Text style={styles.title}>
            {isEditMode ? "Society Profile" : "Society Setup"}
          </Text>
          <Text style={styles.description}>
            {isEditMode
              ? "Update your society details and administration information."
              : "Register your society to start managing staff documentation."}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionHeader}>GOOGLE DRIVE CONNECTION</Text>
          <View style={styles.driveStatusCard}>
            <View style={styles.driveIconRow}>
              <View
                style={[
                  styles.statusIndicator,
                  { backgroundColor: isDriveLinked ? "#22C55E" : "#EF4444" },
                ]}
              />
              <Text style={styles.driveStatusText}>
                {isDriveLinked
                  ? "Google Drive Connected"
                  : "Google Drive Not Connected"}
              </Text>
            </View>
            <Text style={styles.driveHelpText}>
              We need permission to create folders for staff documentation in
              your Google Drive.
            </Text>
            {!isDriveLinked && (
              <TouchableOpacity
                style={styles.connectDriveBtn}
                onPress={handleLinkDrive}
              >
                <Text style={styles.connectDriveBtnText}>
                  Connect Google Drive
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.divider} />
          <Text style={styles.sectionHeader}>SOCIETY INFORMATION</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Society Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Blue Ridge Society"
              placeholderTextColor="#94A3B8"
              value={formData.societyName}
              onChangeText={(val) => handleInputChange("societyName", val)}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Society Address</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="e.g. 123 Street, Pune, India"
              placeholderTextColor="#94A3B8"
              value={formData.societyAddress}
              onChangeText={(val) => handleInputChange("societyAddress", val)}
              multiline
            />
          </View>

          <View style={styles.row}>
            <View style={styles.flex1}>
              <Text style={styles.label}>Pincode *</Text>
              <TextInput
                style={styles.input}
                placeholder="411057"
                placeholderTextColor="#94A3B8"
                value={formData.pincode}
                onChangeText={(val) => handleInputChange("pincode", val)}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.label}>Wings/Blocks *</Text>
              <TextInput
                style={[styles.input, isEditMode && styles.inputDisabled]}
                placeholder="e.g. 3"
                placeholderTextColor="#94A3B8"
                value={formData.wingCount}
                onChangeText={(val) => handleInputChange("wingCount", val)}
                keyboardType="numeric"
                editable={!isEditMode}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Society Registration No.</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. SR/12345/2026"
              placeholderTextColor="#94A3B8"
              value={formData.registrationNo}
              onChangeText={(val) => handleInputChange("registrationNo", val)}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Google Maps Location URL</Text>
            <TextInput
              style={styles.input}
              placeholder="https://goo.gl/maps/..."
              placeholderTextColor="#94A3B8"
              value={formData.googleLocation}
              onChangeText={(val) => handleInputChange("googleLocation", val)}
            />
          </View>

          <View style={styles.divider} />

          <Text style={styles.sectionHeader}>ADMIN DETAILS</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Admin Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Harshal Patil"
              placeholderTextColor="#94A3B8"
              value={formData.adminName}
              onChangeText={(val) => handleInputChange("adminName", val)}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Admin Contact</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 9876543210"
              placeholderTextColor="#94A3B8"
              value={formData.adminContact}
              onChangeText={(val) => handleInputChange("adminContact", val)}
              keyboardType="phone-pad"
            />
          </View>

          <TouchableOpacity
            style={[
              styles.primaryButton,
              (isSubmitting || (!isEditMode && !isDriveLinked)) &&
                styles.buttonDisabled,
            ]}
            onPress={handleSetup}
            disabled={isSubmitting || (!isEditMode && !isDriveLinked)}
          >
            <Text style={styles.buttonText}>
              {isSubmitting
                ? isEditMode
                  ? "Updating..."
                  : "Registering..."
                : isEditMode
                  ? "Update Profile"
                  : "Complete Setup"}
            </Text>
          </TouchableOpacity>

          {isEditMode ? (
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
              disabled={isSubmitting}
            >
              <Text style={styles.backButtonText}>Cancel Updates</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.backButton}
              onPress={handleBackToLogin}
              disabled={isSubmitting}
            >
              <Text style={styles.backButtonText}>Back to Login</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: "#F1F5F9",
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 60,
  },
  headerContainer: {
    marginBottom: 32,
    alignItems: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  description: {
    fontSize: 16,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 5,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: "800",
    color: "#3B82F6",
    letterSpacing: 1.5,
    marginBottom: 20,
    marginTop: 8,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    color: "#0F172A",
  },
  inputDisabled: {
    backgroundColor: "#F1F5F9",
    color: "#94A3B8",
  },
  textArea: {
    height: 100,
    textAlignVertical: "top",
  },
  row: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 20,
  },
  flex1: {
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginVertical: 24,
  },
  primaryButton: {
    backgroundColor: "#0F172A",
    padding: 20,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 12,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  backButton: {
    marginTop: 20,
    padding: 12,
    alignItems: "center",
  },
  backButtonText: {
    color: "#64748B",
    fontSize: 15,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  driveStatusCard: {
    backgroundColor: "#F8FAFC",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 8,
  },
  driveIconRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  driveStatusText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  driveHelpText: {
    fontSize: 13,
    color: "#64748B",
    lineHeight: 18,
    marginBottom: 16,
  },
  connectDriveBtn: {
    backgroundColor: "#3B82F6",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  connectDriveBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
