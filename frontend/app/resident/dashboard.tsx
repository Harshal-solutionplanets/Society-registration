import { appId, db } from "@/configs/firebaseConfig";
import { useAuth } from "@/hooks/useAuth";
import { ensureUnitDriveStructure } from "@/utils/driveHealthCheck";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function ResidentDashboard() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const [residentData, setResidentData] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);

  useFocusEffect(
    useCallback(() => {
      fetchResidentData();
    }, []),
  );

  // Auto-logout listener if password changes
  useEffect(() => {
    if (!residentData?.adminUID || !residentData?.id) return;

    const unitDocRef = doc(
      db,
      `artifacts/${appId}/public/data/societies/${residentData.adminUID}/Residents`,
      residentData.id,
    );

    const unsubscribe = onSnapshot(
      unitDocRef,
      async (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          // If password in DB is different from what we logged in with (resident_session), force logout
          if (data.password && data.password !== residentData.password) {
            console.log("Password changed by admin. Logging out...");
            signOut();
            return;
          }
          // Sync key fields (unitName, wingName, residentName, societyName) from DB
          const fieldsToSync = [
            "unitName",
            "wingName",
            "residentName",
            "societyName",
            "displayName",
            "staffMembers",
          ];
          let hasChanges = false;
          const updatedData = { ...residentData };
          for (const field of fieldsToSync) {
            if (data[field] && data[field] !== residentData[field]) {
              updatedData[field] = data[field];
              hasChanges = true;
            }
          }
          if (hasChanges) {
            setResidentData(updatedData);
            // Also update AsyncStorage so other pages get fresh data
            try {
              await AsyncStorage.setItem(
                "resident_session",
                JSON.stringify(updatedData),
              );
            } catch (e) {
              console.warn("Failed to update resident session in storage:", e);
            }
          }
        } else {
          // If document deleted
          signOut();
        }
      },
      (error) => {
        console.warn("Resident Dashboard: Unit data listener failed:", error);
      },
    );

    return () => unsubscribe();
  }, [residentData?.adminUID, residentData?.id, residentData?.password]);

  // Notifications listener
  useEffect(() => {
    if (!residentData?.adminUID || !residentData?.id) return;

    const notifRef = collection(
      db,
      `artifacts/${appId}/public/data/societies/${residentData.adminUID}/Residents/${residentData.id}/notifications`,
    );
    const q = query(notifRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const msgs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setNotifications(msgs);
      },
      (error) => {
        console.warn(
          "Resident Dashboard: Notification listener failed:",
          error,
        );
      },
    );

    return () => unsubscribe();
  }, [residentData?.adminUID, residentData?.id]);

  const fetchResidentData = async () => {
    try {
      const session = await AsyncStorage.getItem("resident_session");
      if (session) {
        const data = JSON.parse(session);
        setResidentData(data);

        // Drive Health Check: Ensure folder structure exists
        const restoredId = await ensureUnitDriveStructure(data);
        if (restoredId && restoredId !== data.driveFolderId) {
          const updated = { ...data, driveFolderId: restoredId };
          setResidentData(updated);
          await AsyncStorage.setItem(
            "resident_session",
            JSON.stringify(updated),
          );
        }
      }
    } catch (error) {
      console.error("Error fetching resident data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#14B8A6" />
      </View>
    );
  }

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Card */}
        <View style={styles.headerCard}>
          <View style={styles.headerLeft}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 4,
              }}
            >
              <Image
                source={require("../../assets/images/logo.png")}
                style={{ width: 32, height: 32 }}
                resizeMode="contain"
              />
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "900",
                  color: "#14B8A6",
                  marginLeft: 8,
                  letterSpacing: -0.5,
                }}
              >
                Zonect
              </Text>
            </View>
            <Text style={styles.welcomeText}>
              Welcome, {residentData?.residentName || "Resident"}
            </Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.profileHeaderBtn}
              onPress={() => router.push("/resident/residentform")}
            >
              <Text style={styles.profileHeaderText}>My Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.logoutBtn} onPress={signOut}>
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Notifications Section */}
        {notifications.length > 0 && (
          <View style={styles.notificationsContainer}>
            <Text style={styles.sectionTitle}>Notifications</Text>
            {notifications.map((notif) => (
              <View key={notif.id} style={styles.notificationCard}>
                <Ionicons name="notifications" size={20} color="#EF4444" />
                <Text style={styles.notificationText}>{notif.message}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 16,
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
          <Text style={styles.greeting}>
            Welcome to {residentData?.societyName || "your society"}
          </Text>
          <Text style={styles.unitInfo}>
            Unit {residentData?.wingName} | {residentData?.unitName}
          </Text>
        </View>

        {/* Profile Completion Banner */}
        {(!residentData?.residentMobile ||
          residentData?.residentName === "Resident") && (
          <TouchableOpacity
            style={styles.profileBanner}
            onPress={() => router.push("/resident/residentform")}
          >
            <View style={styles.bannerContent}>
              <Ionicons name="alert-circle" size={24} color="#B8892D" />
              <View style={styles.bannerTextContainer}>
                <Text style={styles.bannerTitle}>Complete Your Profile</Text>
                <Text style={styles.bannerSub}>
                  Add your contact details and family info
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
            </View>
          </TouchableOpacity>
        )}

        {/* Stats Section */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {residentData?.staffMembers || "0"}
            </Text>
            <Text style={styles.statLabel}>Unit Staff</Text>
          </View>
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push("/resident/staff")}
          >
            <View style={[styles.actionIcon, { backgroundColor: "#E6FFFA" }]}>
              <Ionicons name="people" size={24} color="#14B8A6" />
            </View>
            <Text style={styles.actionLabel}>Manage Staff</Text>
            <Text style={styles.actionSub}>Help & Helpers</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, { opacity: 0.8 }]}
            disabled={true}
          >
            <View style={[styles.actionIcon, { backgroundColor: "#F9F0E5" }]}>
              <Ionicons name="notifications" size={24} color="#A35A2A" />
            </View>
            <Text style={styles.actionLabel}>Notice Board</Text>
            <Text
              style={[
                styles.actionSub,
                { color: "#A35A2A", fontWeight: "700" },
              ]}
            >
              Coming Soon
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Resident Portal</Text>
          <Text style={styles.infoText}>
            - Use Manage Staff to register your domestic help.{"\n"}- Ensure
            your unit details are up to date.{"\n"}- Contact society admin for
            any grievances.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 50,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
  headerCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#0D4F49",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 15,
    elevation: 4,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.1)",
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  societyName: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0D4F49",
    letterSpacing: -0.3,
    textTransform: "uppercase",
  },
  welcomeText: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
    fontWeight: "600",
  },
  profileHeaderBtn: {
    backgroundColor: "#E6F3F0",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#C7D2FE",
  },
  profileHeaderText: {
    color: "#0D4F49",
    fontWeight: "700",
    fontSize: 12,
  },
  logoutBtn: {
    backgroundColor: "#FEF2F2",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F7D8D6",
  },
  logoutText: {
    color: "#EF4444",
    fontWeight: "700",
    fontSize: 12,
  },
  welcomeSection: {
    alignItems: "center",
    marginBottom: 24,
    backgroundColor: "#E6F3F0",
    paddingVertical: 30,
    paddingHorizontal: 20,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: "#C7D2FE",
    shadowColor: "#0D4F49",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 3,
  },
  iconContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#B2DFDB",
    shadowColor: "#0D4F49",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  greeting: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F2A3D",
    textAlign: "center",
    lineHeight: 28,
  },
  unitInfo: {
    fontSize: 13,
    color: "#0D4F49",
    marginTop: 8,
    fontWeight: "800",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#C7D2FE",
  },
  statsContainer: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#EAF5EF",
    padding: 16,
    borderRadius: 20,
    alignItems: "center",
    shadowColor: "#0F766E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#CFE8DE",
  },
  statValue: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0F5F58",
  },
  statLabel: {
    fontSize: 11,
    color: "#0F5F58",
    fontWeight: "800",
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F2A3D",
    marginBottom: 16,
    marginLeft: 4,
    borderLeftWidth: 4,
    borderLeftColor: "#0D4F49",
    paddingLeft: 10,
  },
  actionsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 24,
  },
  profileBanner: {
    backgroundColor: "#FAF1DE",
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#D0A74F",
    shadowColor: "#B8892D",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  bannerContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  bannerTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#92400E",
  },
  bannerSub: {
    fontSize: 12,
    color: "#B45309",
    marginTop: 2,
    fontWeight: "600",
  },
  actionCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F2A3D",
    marginBottom: 2,
  },
  actionSub: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
  },
  infoBox: {
    backgroundColor: "#F1F5F9",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginTop: 8,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#334155",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  infoText: {
    fontSize: 12,
    color: "#64748B",
    lineHeight: 18,
    fontWeight: "600",
  },
  notificationsContainer: {
    marginBottom: 24,
  },
  notificationCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EDB7B3",
    marginBottom: 8,
  },
  notificationText: {
    color: "#991B1B",
    fontSize: 13,
    fontWeight: "600",
    marginLeft: 10,
    flex: 1,
  },
});
