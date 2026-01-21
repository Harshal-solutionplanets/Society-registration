import { appId, db } from "@/configs/firebaseConfig";
import { useAuth } from "@/hooks/useAuth";
import { useFocusEffect, useRouter } from "expo-router";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import * as React from "react";
import {
  ActivityIndicator,
  Alert,
  GestureResponderEvent,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface Wing {
  id: string;
  name: string;
  wingIndex?: number;
  floorCount: number;
  floors: any[];
  driveFolderId?: string;
}

export default function AdminDashboard() {
  const router = useRouter();
  const { user, isLoading: authLoading, signOut } = useAuth();
  const [loading, setLoading] = React.useState(true);
  const [societyData, setSocietyData] = React.useState<any>(null);
  const [wings, setWings] = React.useState<Wing[]>([]);

  const fetchData = React.useCallback(async () => {
    if (!user) return;
    try {
      const societyPath = `artifacts/${appId}/public/data/societies`;
      const societyDoc = await getDoc(doc(db, societyPath, user.uid));

      if (societyDoc.exists()) {
        const data = societyDoc.data();
        setSocietyData(data);

        const wingsRef = collection(db, `${societyPath}/${user.uid}/wings`);
        const wingsSnapshot = await getDocs(wingsRef);
        let fetchedWings = wingsSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Wing[];

        // Migration: If wingCount > fetchedWings.length, create missing docs
        // This ensures the "Delete" button works for all slots
        if (data.wingCount > fetchedWings.length) {
          const { writeBatch } = await import("firebase/firestore");
          const batch = writeBatch(db);
          let added = false;

          for (let i = 0; i < data.wingCount; i++) {
            const exists = fetchedWings.some((w) => w.wingIndex === i);
            if (!exists) {
              const wingName = `Wing ${String.fromCharCode(65 + i)}`;
              const wingId = wingName.replace(/\s+/g, "_");
              const wingRef = doc(
                db,
                `${societyPath}/${user.uid}/wings`,
                wingId,
              );
              batch.set(wingRef, {
                id: wingId,
                name: wingName,
                wingIndex: i,
                floorCount: 0,
                floors: [],
                updatedAt: new Date().toISOString(),
              });
              added = true;
            }
          }

          if (added) {
            await batch.commit();
            const updatedSnapshot = await getDocs(wingsRef);
            fetchedWings = updatedSnapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            })) as Wing[];
          }
        }
        setWings(fetchedWings);
      } else {
        router.replace("/admin/setup");
      }
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    React.useCallback(() => {
      if (!authLoading && user) {
        fetchData();
      } else if (!authLoading && !user) {
        router.replace("/admin/auth");
      }
    }, [user, authLoading, fetchData]),
  );

  const handleAddWing = async () => {
    if (!user || !societyData) return;
    try {
      // Find the next available index and letter
      const nextIndex =
        wings.length > 0
          ? Math.max(...wings.map((w) => w.wingIndex || 0)) + 1
          : 0;
      const nextLetter = String.fromCharCode(65 + nextIndex);
      const wingName = `Wing ${nextLetter}`;
      const wingId = wingName.replace(/\s+/g, "_");

      const societyPath = `artifacts/${appId}/public/data/societies`;
      const wingRef = doc(db, `${societyPath}/${user.uid}/wings`, wingId);

      await setDoc(wingRef, {
        id: wingId,
        name: wingName,
        wingIndex: nextIndex,
        floorCount: 0,
        floors: [],
        updatedAt: new Date().toISOString(),
      });

      const newWingCount = (societyData.wingCount || 0) + 1;
      await updateDoc(doc(db, societyPath, user.uid), {
        wingCount: newWingCount,
      });

      setSocietyData({ ...societyData, wingCount: newWingCount });
      fetchData(); // Refresh list
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Failed to add wing");
    }
  };

  const performDelete = async (wingId: string) => {
    if (!user || !societyData) return;
    try {
      const societyPath = `artifacts/${appId}/public/data/societies`;
      const wingDocRef = doc(db, `${societyPath}/${user.uid}/wings`, wingId);
      await deleteDoc(wingDocRef);

      const newWingCount = Math.max(0, (societyData.wingCount || 0) - 1);
      await updateDoc(doc(db, societyPath, user.uid), {
        wingCount: newWingCount,
      });

      setSocietyData({ ...societyData, wingCount: newWingCount });
      fetchData(); // Refresh wings list
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Failed to delete wing");
    }
  };

  const handleDeleteWing = async (wingId: string) => {
    if (Platform.OS === "web") {
      const confirmed = window.confirm(
        "Are you sure you want to delete this wing? All its configuration will be removed.",
      );
      if (confirmed) {
        await performDelete(wingId);
      }
    } else {
      Alert.alert(
        "Delete Wing",
        "Are you sure you want to delete this wing? All its configuration will be removed.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => performDelete(wingId),
          },
        ],
      );
    }
  };

  const handleWingPress = (wing: Wing) => {
    router.push({
      pathname: "/admin/wing-setup",
      params: {
        wingIndex: wing.wingIndex ?? 0,
        wingId: wing.id,
        wingName: wing.name,
      },
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  const wingCount = societyData?.wingCount || 0;
  // Sort wings by index for display
  const sortedWings = [...wings].sort(
    (a, b) => (a.wingIndex ?? 0) - (b.wingIndex ?? 0),
  );

  // Calculate total units from all configured wings
  const totalCalculatedUnits = wings.reduce((total, wing) => {
    const wingFlats =
      wing.floors?.reduce((sum, floor) => sum + (floor.flatCount || 0), 0) || 0;
    return total + wingFlats;
  }, 0);

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerCard}>
          <View style={styles.headerLeft}>
            <Text style={styles.societyName}>
              {societyData?.societyName || "Admin Hub"}
            </Text>
            <Text style={styles.welcomeText}>Welcome Admin</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => router.push("/admin/setup")}
            >
              <Text style={styles.headerBtnText}>Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => router.push("/admin/committee-members")}
            >
              <Text style={styles.headerBtnText}>Committee</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => router.push("/admin/society-staff")}
            >
              <Text style={styles.headerBtnText}>Staff</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.logoutBtn} onPress={signOut}>
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{wingCount}</Text>
            <Text style={styles.statLabel}>Wings</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{totalCalculatedUnits}</Text>
            <Text style={styles.statLabel}>Total Units</Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Configure Wings</Text>
          <TouchableOpacity style={styles.addWingBtn} onPress={handleAddWing}>
            <Text style={styles.addWingBtnText}>+ Add Wing</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.wingsGrid}>
          {sortedWings.map((wingInfo) => {
            const isConfigured = (wingInfo.floorCount || 0) > 0;
            return (
              <TouchableOpacity
                key={wingInfo.id}
                style={[
                  styles.wingCard,
                  isConfigured
                    ? styles.wingCardConfigured
                    : styles.wingCardPending,
                ]}
                onPress={() => handleWingPress(wingInfo)}
              >
                <View
                  style={[
                    styles.towerTop,
                    isConfigured
                      ? styles.towerTopConfigured
                      : styles.towerTopPending,
                  ]}
                />
                <View style={styles.wingCardContent}>
                  <View style={styles.windowGrid}>
                    <View style={styles.windowRow}>
                      <View style={styles.window} />
                      <View style={styles.window} />
                    </View>
                    <View style={styles.windowRow}>
                      <View style={styles.window} />
                      <View style={styles.window} />
                    </View>
                    <View style={styles.windowRow}>
                      <View style={styles.window} />
                      <View style={styles.window} />
                    </View>
                    <View style={styles.windowRow}>
                      <View style={styles.window} />
                      <View style={styles.window} />
                    </View>
                    <View style={styles.windowRow}>
                      <View style={styles.window} />
                      <View style={styles.window} />
                    </View>
                    <View style={styles.windowRow}>
                      <View style={styles.window} />
                      <View style={styles.window} />
                    </View>
                  </View>
                  <Text
                    style={[
                      styles.wingLetter,
                      isConfigured
                        ? styles.wingLetterConfigured
                        : styles.wingLetterPending,
                    ]}
                  >
                    {wingInfo.name.charAt(0).toUpperCase()}
                  </Text>
                  <Text
                    style={[
                      styles.wingName,
                      isConfigured
                        ? styles.wingNameConfigured
                        : styles.wingNamePending,
                    ]}
                  >
                    {wingInfo.name}
                  </Text>
                  <View
                    style={[
                      styles.badge,
                      isConfigured ? styles.badgeSuccess : styles.badgeInfo,
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        isConfigured
                          ? styles.badgeTextSuccess
                          : styles.badgeTextInfo,
                      ]}
                    >
                      {isConfigured ? "Configured" : "Pending"}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.deleteWingIcon}
                  onPress={(e: GestureResponderEvent) => {
                    e.stopPropagation();
                    handleDeleteWing(wingInfo.id);
                  }}
                >
                  <Text style={styles.deleteWingIconText}>×</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Quick Guide</Text>
          <Text style={styles.infoText}>
            • Click on a wing to set up its floors and flats.{"\n"}• Once
            configured, you can manage individual floor details.{"\n"}• Use the
            Committee button to manage society members.
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
    fontSize: 22,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.5,
    textTransform: "uppercase",
  },
  welcomeText: {
    fontSize: 13,
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
    fontSize: 13,
  },
  statsContainer: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 24,
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
  wingsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 24,
  },
  wingCard: {
    width: "31.3%",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 10,
    paddingTop: 30,
    borderWidth: 2,
    borderColor: "#E2E8F0",
    minHeight: 200,
    position: "relative",
    overflow: "hidden",
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 4,
  },
  wingCardConfigured: {
    backgroundColor: "#F0FDF4",
    borderColor: "#22C55E",
    borderStyle: "solid",
    shadowColor: "#22C55E",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 2,
  },
  wingCardPending: {
    backgroundColor: "#EFF6FF",
    borderColor: "#3B82F6",
    borderStyle: "dashed",
  },
  wingCardContent: {
    alignItems: "center",
  },
  wingLetter: {
    fontSize: 28,
    fontWeight: "900",
  },
  wingLetterConfigured: {
    color: "#16A34A",
  },
  wingLetterPending: {
    color: "#3B82F6",
  },
  wingName: {
    fontSize: 14,
    fontWeight: "800",
    marginTop: 4,
    textAlign: "center",
  },
  wingNameConfigured: {
    color: "#166534",
  },
  wingNamePending: {
    color: "#1E40AF",
  },
  badge: {
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeSuccess: {
    backgroundColor: "#10B981",
  },
  badgeInfo: {
    backgroundColor: "#3B82F6",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  badgeTextSuccess: {
    color: "#FFFFFF",
  },
  badgeTextInfo: {
    color: "#FFFFFF",
  },
  infoBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginTop: 8,
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
  towerTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 14,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  towerTopConfigured: {
    backgroundColor: "#22C55E",
  },
  towerTopPending: {
    backgroundColor: "#3B82F6",
  },
  windowGrid: {
    position: "absolute",
    top: 25,
    alignSelf: "center",
    gap: 8,
  },
  windowRow: {
    flexDirection: "row",
    gap: 6,
  },
  window: {
    width: 6,
    height: 6,
    backgroundColor: "#E2E8F0",
    borderRadius: 1,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  addWingBtn: {
    backgroundColor: "#F0FDF4",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#22C55E",
  },
  addWingBtnText: {
    color: "#166534",
    fontSize: 12,
    fontWeight: "700",
  },
  deleteWingIcon: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 20,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
  },
  deleteWingIconText: {
    color: "#EF4444",
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 20,
    textAlign: "center",
  },
});
