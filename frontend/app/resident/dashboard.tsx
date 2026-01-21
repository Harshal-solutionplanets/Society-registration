import { useAuth } from "@/hooks/useAuth";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
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
  const { user, signOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const [residentData, setResidentData] = useState<any>(null);

  useFocusEffect(
    useCallback(() => {
      fetchResidentData();
    }, []),
  );

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
        {/* Header Card - Same style as Admin Dashboard */}
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
              style={styles.headerBtn}
              onPress={() => router.push("/resident/staff")}
            >
              <Text style={styles.headerBtnText}>Manage Staff</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.logoutBtn} onPress={signOut}>
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <View style={styles.iconContainer}>
            <Ionicons name="home" size={40} color="#3B82F6" />
          </View>
          <Text style={styles.greeting}>
            Welcome to {residentData?.societyName || "your society"}
          </Text>
          <Text style={styles.unitInfo}>
            Unit {residentData?.unitName} | {residentData?.wingName}
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

        {/* Stats/Quick Info */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {residentData?.familyMembers || "0"}
            </Text>
            <Text style={styles.statLabel}>Family Members</Text>
          </View>
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
            <Text style={styles.actionSub}>Register & track staff</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push("/resident/residentform")}
          >
            <View style={[styles.actionIcon, { backgroundColor: "#F0FDF4" }]}>
              <Ionicons name="person" size={24} color="#22C55E" />
            </View>
            <Text style={styles.actionLabel}>My Profile</Text>
            <Text style={styles.actionSub}>Update your details</Text>
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
    paddingTop: 60,
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
    padding: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  societyName: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.5,
    textTransform: "uppercase",
  },
  welcomeText: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  headerBtn: {
    backgroundColor: "#F0F7FF",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E0E7FF",
  },
  headerBtnText: {
    color: "#3B82F6",
    fontWeight: "700",
    fontSize: 12,
  },
  logoutBtn: {
    backgroundColor: "#FEF2F2",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  logoutText: {
    color: "#EF4444",
    fontWeight: "700",
    fontSize: 12,
  },
  welcomeSection: {
    alignItems: "center",
    marginBottom: 32,
    backgroundColor: "#FFFFFF",
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  greeting: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
  },
  unitInfo: {
    fontSize: 14,
    color: "#64748B",
    marginTop: 4,
    fontWeight: "600",
  },
  statsContainer: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 32,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    padding: 20,
    borderRadius: 20,
    alignItems: "center",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  statValue: {
    fontSize: 24,
    fontWeight: "800",
    color: "#3B82F6",
  },
  statLabel: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "600",
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 16,
    marginLeft: 4,
  },
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 32,
  },
  profileBanner: {
    backgroundColor: "#FFFBEB",
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#FEF3C7",
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
    fontSize: 15,
    fontWeight: "700",
    color: "#92400E",
  },
  bannerSub: {
    fontSize: 12,
    color: "#B45309",
    marginTop: 2,
  },
  actionCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 4,
  },
  actionSub: {
    fontSize: 12,
    color: "#94A3B8",
  },
  infoBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#475569",
    marginBottom: 10,
  },
  infoText: {
    fontSize: 13,
    color: "#64748B",
    lineHeight: 20,
  },
});
