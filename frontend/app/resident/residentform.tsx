import { appId, db } from "@/configs/firebaseConfig";
import { useAuth } from "@/hooks/useAuth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { doc, getDoc, setDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
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

export default function ResidentForm() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionData, setSessionData] = useState<any>(null);

  const [formData, setFormData] = useState({
    residentName: "",
    residentMobile: "",
    status: "VACANT", // VACANT or OCCUPIED
    familyMembers: "1",
    alternateMobile: "",
    ownership: "SELF_OWNED", // RENTAL or SELF_OWNED
  });

  useEffect(() => {
    fetchResidentSession();
  }, []);

  const fetchResidentSession = async () => {
    try {
      const session = await AsyncStorage.getItem("resident_session");
      if (session) {
        const data = JSON.parse(session);
        setSessionData(data);

        // Pre-fill if data exists in Firestore
        if (data.adminUID && data.id) {
          const residentDoc = await getDoc(
            doc(
              db,
              `artifacts/${appId}/public/data/societies/${data.adminUID}/Residents`,
              data.id,
            ),
          );

          if (residentDoc.exists()) {
            const existingData = residentDoc.data();
            setFormData({
              residentName: existingData.residentName || "",
              residentMobile: existingData.residentMobile || "",
              status: existingData.status || "VACANT",
              familyMembers: existingData.familyMembers?.toString() || "1",
              alternateMobile: existingData.alternateMobile || "",
              ownership: existingData.ownership || "SELF_OWNED",
            });
          } else {
            // Fallback to session data if Firestore doc doesn't exist yet
            setFormData((prev) => ({
              ...prev,
              residentName: data.residentName || "",
              status: data.status || "VACANT",
            }));
          }
        }
      }
    } catch (error) {
      console.error("Error fetching resident session:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const toggleStatus = () => {
    setFormData((prev) => ({
      ...prev,
      status: prev.status === "VACANT" ? "OCCUPIED" : "VACANT",
    }));
  };

  const toggleOwnership = () => {
    setFormData((prev) => ({
      ...prev,
      ownership: prev.ownership === "SELF_OWNED" ? "RENTAL" : "SELF_OWNED",
    }));
  };

  const handleSubmit = async () => {
    const { residentName, residentMobile, familyMembers } = formData;

    if (!residentName || !residentMobile || !familyMembers) {
      Toast.show({
        type: "error",
        text1: "Required Fields",
        text2: "Please fill in all required fields.",
      });
      return;
    }

    if (!sessionData || !sessionData.adminUID || !sessionData.id) {
      Toast.show({
        type: "error",
        text1: "Session Error",
        text2: "Could not identify your unit. Please log in again.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const residentPath = `artifacts/${appId}/public/data/societies/${sessionData.adminUID}/Residents/${sessionData.id}`;

      const updateData = {
        ...formData,
        familyMembers: parseInt(formData.familyMembers),
        updatedAt: new Date().toISOString(),
      };

      // 1. Save to Firestore
      await setDoc(doc(db, residentPath), updateData, { merge: true });

      // 2. Update local session
      const newSession = { ...sessionData, ...updateData };
      await AsyncStorage.setItem(
        "resident_session",
        JSON.stringify(newSession),
      );

      Toast.show({
        type: "success",
        text1: "Profile Updated",
        text2: "Your information has been saved successfully.",
      });

      router.replace("/resident/dashboard");
    } catch (error: any) {
      console.error("Form submission error:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: error.message || "Could not save your information.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

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
          <Text style={styles.title}>Resident Profile</Text>
          <Text style={styles.description}>
            Please provide your details for society records.
          </Text>
          <Text style={styles.unitBadge}>
            Unit {sessionData?.unitName} | {sessionData?.wingName}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionHeader}>PERSONAL INFORMATION</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Full Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Harshal Patil"
              placeholderTextColor="#94A3B8"
              value={formData.residentName}
              onChangeText={(val) => handleInputChange("residentName", val)}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Contact Number *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 9876543210"
              placeholderTextColor="#94A3B8"
              value={formData.residentMobile}
              onChangeText={(val) => handleInputChange("residentMobile", val)}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Alternate Contact Number</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 9876543211"
              placeholderTextColor="#94A3B8"
              value={formData.alternateMobile}
              onChangeText={(val) => handleInputChange("alternateMobile", val)}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.row}>
            <View style={styles.flex1}>
              <Text style={styles.label}>Family Members *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 4"
                placeholderTextColor="#94A3B8"
                value={formData.familyMembers}
                onChangeText={(val) => handleInputChange("familyMembers", val)}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={styles.divider} />

          <Text style={styles.sectionHeader}>STATUS & OWNERSHIP</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Resident Status</Text>
            <TouchableOpacity
              style={[
                styles.toggleContainer,
                formData.status === "OCCUPIED"
                  ? styles.toggleOccupied
                  : styles.toggleVacant,
              ]}
              onPress={toggleStatus}
            >
              <View
                style={[
                  styles.toggleIndicator,
                  formData.status === "OCCUPIED"
                    ? styles.indicatorRight
                    : styles.indicatorLeft,
                ]}
              />
              <Text
                style={[
                  styles.toggleText,
                  formData.status === "VACANT" && styles.activeToggleText,
                ]}
              >
                VACANT
              </Text>
              <Text
                style={[
                  styles.toggleText,
                  formData.status === "OCCUPIED" && styles.activeToggleText,
                ]}
              >
                OCCUPIED
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Flat Ownership</Text>
            <TouchableOpacity
              style={[
                styles.toggleContainer,
                formData.ownership === "RENTAL"
                  ? styles.toggleRental
                  : styles.toggleSelf,
              ]}
              onPress={toggleOwnership}
            >
              <View
                style={[
                  styles.toggleIndicator,
                  formData.ownership === "RENTAL"
                    ? styles.indicatorRight
                    : styles.indicatorLeft,
                ]}
              />
              <Text
                style={[
                  styles.toggleText,
                  formData.ownership === "SELF_OWNED" &&
                    styles.activeToggleText,
                ]}
              >
                SELF OWNED
              </Text>
              <Text
                style={[
                  styles.toggleText,
                  formData.ownership === "RENTAL" && styles.activeToggleText,
                ]}
              >
                RENTAL
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[
              styles.primaryButton,
              isSubmitting && styles.buttonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            <Text style={styles.buttonText}>
              {isSubmitting ? "Saving..." : "Save Profile"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            disabled={isSubmitting}
          >
            <Text style={styles.backButtonText}>Cancel</Text>
          </TouchableOpacity>
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
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
    marginBottom: 12,
  },
  unitBadge: {
    backgroundColor: "#3B82F6",
    color: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    fontSize: 14,
    fontWeight: "700",
    overflow: "hidden",
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
  toggleContainer: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    height: 56,
    position: "relative",
    alignItems: "center",
    padding: 4,
  },
  toggleVacant: {
    borderColor: "#E2E8F0",
    borderWidth: 1,
  },
  toggleOccupied: {
    borderColor: "#22C55E",
    borderWidth: 1,
  },
  toggleSelf: {
    borderColor: "#E2E8F0",
    borderWidth: 1,
  },
  toggleRental: {
    borderColor: "#F59E0B",
    borderWidth: 1,
  },
  toggleIndicator: {
    position: "absolute",
    width: "50%",
    height: "100%",
    top: 4,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  indicatorLeft: {
    left: 4,
  },
  indicatorRight: {
    right: 4,
  },
  toggleText: {
    flex: 1,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "700",
    color: "#94A3B8",
    zIndex: 1,
  },
  activeToggleText: {
    color: "#0F172A",
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
});
