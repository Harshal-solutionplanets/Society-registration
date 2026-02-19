import { appId, db } from "@/configs/firebaseConfig";
import { useAuth } from "@/hooks/useAuth";
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
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function ResidentDashboard() {
  const router = useRouter();
  const { signOut } = useAuth();
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
      (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          // If password in DB is different from what we logged in with (resident_session), force logout
          if (data.password && data.password !== residentData.password) {
            console.log("Password changed by admin. Logging out...");
            signOut();
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
        setResidentData(JSON.parse(session));
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
        <ActivityIndicator size="large" color="#3B82F6" />
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
            <Text style={styles.societyName}>
              {residentData?.societyName || "Society Hub"}
            </Text>
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
          <View style={styles.iconContainer}>
            <Ionicons name="home" size={40} color="#3B82F6" />
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
              <Ionicons name="alert-circle" size={24} color="#F59E0B" />
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
            <View style={[styles.actionIcon, { backgroundColor: "#EFF6FF" }]}>
              <Ionicons name="people" size={24} color="#3B82F6" />
            </View>
            <Text style={styles.actionLabel}>Manage Staff</Text>
            <Text style={styles.actionSub}>Help & Helpers</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, { opacity: 0.8 }]}
            disabled={true}
          >
            <View style={[styles.actionIcon, { backgroundColor: "#FDF2F8" }]}>
              <Ionicons name="notifications" size={24} color="#DB2777" />
            </View>
            <Text style={styles.actionLabel}>Notice Board</Text>
            <Text
              style={[
                styles.actionSub,
                { color: "#DB2777", fontWeight: "700" },
              ]}
            >
              Coming Soon
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Resident Portal</Text>
          <Text style={styles.infoText}>
            • Use "Manage Staff" to register your domestic help.{"\n"}• Ensure
            your unit details are up to date.{"\n"}• Contact society admin for
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
    shadowColor: "#6366F1",
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
    color: "#4338CA",
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
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#C7D2FE",
  },
  profileHeaderText: {
    color: "#4338CA",
    fontWeight: "700",
    fontSize: 12,
  },
  logoutBtn: {
    backgroundColor: "#FFF1F2",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FFE4E6",
  },
  logoutText: {
    color: "#E11D48",
    fontWeight: "700",
    fontSize: 12,
  },
  welcomeSection: {
    alignItems: "center",
    marginBottom: 24,
    backgroundColor: "#EEF2FF",
    paddingVertical: 30,
    paddingHorizontal: 20,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: "#C7D2FE",
    shadowColor: "#4F46E5",
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
    borderColor: "#E0E7FF",
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  greeting: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1E293B",
    textAlign: "center",
    lineHeight: 28,
  },
  unitInfo: {
    fontSize: 13,
    color: "#4338CA",
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
    backgroundColor: "#E0F2FE",
    padding: 16,
    borderRadius: 20,
    alignItems: "center",
    shadowColor: "#0EA5E9",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#BAE6FD",
  },
  statValue: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0369A1",
  },
  statLabel: {
    fontSize: 11,
    color: "#075985",
    fontWeight: "800",
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1E293B",
    marginBottom: 16,
    marginLeft: 4,
    borderLeftWidth: 4,
    borderLeftColor: "#6366F1",
    paddingLeft: 10,
  },
  actionsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 24,
  },
  profileBanner: {
    backgroundColor: "#FFFBEB",
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#FCD34D",
    shadowColor: "#F59E0B",
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
    color: "#1E293B",
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
    color: "#475569",
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
    borderColor: "#FECACA",
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
