import { appId, db } from "@/configs/firebaseConfig";
import { useAuth } from "@/hooks/useAuth";
import { syncStaffWithDrive } from "@/utils/driveHealthCheck";
import { useFocusEffect, useRouter } from "expo-router";
import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    setDoc,
    updateDoc,
} from "firebase/firestore";
import * as React from "react";
import {
    ActivityIndicator,
    Alert,
    GestureResponderEvent,
    Image,
    Linking,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";

interface Wing {
  id: string;
  name: string;
  wingIndex?: number;
  floorCount: number;
  floors: any[];
  totalFlats?: number;
  driveFolderId?: string;
}

interface Unit {
  id: string;
  unitName: string;
  wingName: string;
  floorNumber: number;
  flatNumber: number;
  residentName: string;
  residentUsername: string;
  residentPassword: string;
  status: string;
  [key: string]: any;
}

export default function AdminDashboard() {
  const router = useRouter();
  const { user, isLoading: authLoading, signOut } = useAuth();
  const [loading, setLoading] = React.useState(true);
  const [societyData, setSocietyData] = React.useState<any>(null);
  const [wings, setWings] = React.useState<Wing[]>([]);
  const [isDriveSyncing, setIsDriveSyncing] = React.useState(false);

  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  React.useEffect(() => {
    if (!user?.uid) return;

    const societyPath = `artifacts/${appId}/public/data/societies`;
    const societyDocRef = doc(db, societyPath, user.uid);
    const wingsRef = collection(db, `${societyPath}/${user.uid}/wings`);

    // 1. Listen to Society Data
    const unsubscribeSociety = onSnapshot(societyDocRef, (societySnap) => {
      if (societySnap.exists()) {
        setSocietyData(societySnap.data());
      } else {
        router.replace("/admin/setup");
      }
    });

    // 2. Listen to Wings Collection
    const unsubscribeWings = onSnapshot(wingsRef, (wingsSnap) => {
      const fetchedWings = wingsSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Wing[];
      setWings(fetchedWings);
      setLoading(false);
    });

    return () => {
      unsubscribeSociety();
      unsubscribeWings();
    };
  }, [user]);

  // Drive sync logic to detect manual deletions
  React.useEffect(() => {
    const performDriveSync = async () => {
      if (!user?.uid || !societyData?.driveAccessToken || isDriveSyncing)
        return;

      setIsDriveSyncing(true);
      try {
        const deletedStaff = await syncStaffWithDrive(
          user.uid,
          societyData.driveAccessToken,
        );
        if (deletedStaff.length > 0) {
          Alert.alert(
            "Drive Sync Update",
            `Detected manual deletion of folders for: ${deletedStaff.join(", ")}. \n\nRelated Firestore data and audit logs have been cleaned up to maintain system integrity.`,
            [{ text: "Understood" }],
          );
        }
      } catch (error) {
        console.warn("[DriveSync] Background check failed:", error);
      } finally {
        setIsDriveSyncing(false);
      }
    };

    if (societyData) {
      performDriveSync();
    }
  }, [societyData?.driveAccessToken]);

  // Handle migrations or initial data fetch if needed
  const fetchData = React.useCallback(async () => {
    if (!user?.uid) return;
    try {
      const societyPath = `artifacts/${appId}/public/data/societies`;
      const societyDoc = await getDoc(doc(db, societyPath, user.uid));

      if (societyDoc.exists()) {
        const data = societyDoc.data();
        const wingsRef = collection(db, `${societyPath}/${user.uid}/wings`);
        const wingsSnapshot = await getDocs(wingsRef);
        let fetchedWings = wingsSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Wing[];

        // Migration: If wingCount > fetchedWings.length, create missing docs
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
          }
        }
      }
    } catch (error) {
      console.error(error);
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

  const handleLinkDrive = async () => {
    try {
      if (!user?.uid) return;
      const isWeb = Platform.OS === "web";
      const backendUrl = isWeb
        ? window.location.origin + "/api"
        : process.env.EXPO_PUBLIC_BACKEND_URL ||
          "https://asia-south1-zonect-8d847.cloudfunctions.net/api";

      const res = await fetch(
        `${backendUrl}/auth/google/url?adminUID=${user?.uid}&appId=${appId}`,
      );
      const data = await res.json();
      if (data.url) {
        Linking.openURL(data.url);
      }
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Could not start Google Drive linking.");
    }
  };

  const deleteDriveFolder = async (folderId: string, token: string) => {
    try {
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${folderId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      if (!response.ok && response.status !== 404) {
        const error = await response.json();
        console.warn("Drive folder deletion failed:", error);
        return false;
      }
      return true;
    } catch (error) {
      console.warn("Error deleting Drive folder:", error);
      return false;
    }
  };

  const refreshAccessToken = async () => {
    if (!user) return null;
    try {
      const isWeb = Platform.OS === "web";
      const backendUrl = isWeb
        ? window.location.origin + "/api"
        : process.env.EXPO_PUBLIC_BACKEND_URL ||
          "https://asia-south1-zonect-8d847.cloudfunctions.net/api";
      const res = await fetch(
        `${backendUrl}/auth/google/refresh?adminUID=${user?.uid}&appId=${appId}`,
      );
      if (!res.ok) throw new Error("Refresh failed");
      const data = await res.json();
      return data.accessToken;
    } catch (error) {
      console.error("DEBUG: Token refresh failed:", error);
      return null;
    }
  };

  const handleAddWing = async () => {
    if (!user?.uid || !societyData) return;
    try {
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
      fetchData();
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Failed to add wing");
    }
  };

  const performDelete = async (wingId: string) => {
    if (!user?.uid || !societyData) return;
    try {
      const societyPath = `artifacts/${appId}/public/data/societies`;

      // 1. Find all residents that belong to this wing and delete them
      const residentsRef = collection(
        db,
        `${societyPath}/${user.uid}/Residents`,
      );
      const residentsSnapshot = await getDocs(residentsRef);

      const deletePromises: Promise<void>[] = [];

      residentsSnapshot.forEach((residentDoc) => {
        const data = residentDoc.data();
        // Check if this resident belongs to the wing being deleted
        if (data.wingId === wingId) {
          deletePromises.push(deleteDoc(residentDoc.ref));
        }
      });

      // 2. Delete all floor/unit documents under this wing
      const wingDocRef = doc(db, `${societyPath}/${user.uid}/wings`, wingId);
      const wingDoc = await getDoc(wingDocRef);

      if (wingDoc.exists()) {
        const wingData = wingDoc.data();
        const floors = wingData.floors || [];

        // Delete all unit documents from each floor
        for (const floor of floors) {
          const floorNumber = floor.floorNumber;
          const floorUnitsRef = collection(
            db,
            `${societyPath}/${user.uid}/wings/${wingId}/${floorNumber}`,
          );
          const unitsSnapshot = await getDocs(floorUnitsRef);

          unitsSnapshot.forEach((unitDoc) => {
            deletePromises.push(deleteDoc(unitDoc.ref));
          });
        }

        // Wait for all resident and unit deletions
        await Promise.all(deletePromises);

        // 3. Delete Wing Folder from Drive if possible
        if (wingData.driveFolderId) {
          let token =
            societyData?.driveAccessToken ||
            (typeof window !== "undefined"
              ? sessionStorage.getItem("driveToken")
              : null);

          if (!token) {
            token = await refreshAccessToken();
          }

          if (token) {
            // Verify token
            try {
              const testRes = await fetch(
                "https://www.googleapis.com/drive/v3/about?fields=user",
                { headers: { Authorization: `Bearer ${token}` } },
              );
              if (testRes.status === 401) {
                token = await refreshAccessToken();
              }
              if (token) {
                await deleteDriveFolder(wingData.driveFolderId, token);
              }
            } catch (err) {
              console.warn("Drive cleanup failed:", err);
            }
          }
        }
      } else {
        // Even if wing doc doesn't exist, we might want to wait for resident deletions if any were queued
        await Promise.all(deletePromises);
      }

      // 4. Delete the wing document itself
      await deleteDoc(wingDocRef);

      // 5. Update wing count
      const newWingCount = Math.max(0, (societyData.wingCount || 0) - 1);
      await updateDoc(doc(db, societyPath, user.uid), {
        wingCount: newWingCount,
      });

      setSocietyData({ ...societyData, wingCount: newWingCount });
      fetchData();
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
    console.log("[Dashboard] Navigating to wing-setup:", wing);
    try {
      router.push({
        pathname: "/admin/wing-setup" as any,
        params: {
          wingIndex: (wing.wingIndex ?? 0).toString(),
          wingId: wing.id,
          wingName: wing.name,
        },
      });
    } catch (error) {
      console.error("[Dashboard] Navigation failed:", error);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#14B8A6" />
      </View>
    );
  }

  const wingCount = societyData?.wingCount || 0;
  const sortedWings = [...wings].sort(
    (a, b) => (a.wingIndex ?? 0) - (b.wingIndex ?? 0),
  );

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
        <View style={[styles.headerCard, isMobile && styles.headerCardMobile]}>
          <View
            style={[styles.headerLeft, isMobile && styles.headerLeftMobile]}
          >
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
              Welcome {user?.displayName || user?.email || "Admin"}
            </Text>
          </View>
          <View
            style={[styles.headerRight, isMobile && styles.headerRightMobile]}
          >
            <TouchableOpacity
              style={[styles.headerBtn, isMobile && styles.headerBtnMobile]}
              onPress={() => {
                console.log("[Dashboard] Navigating to Profile");
                router.push("/admin/setup");
              }}
            >
              <Text
                style={[
                  styles.headerBtnText,
                  isMobile && styles.headerBtnTextMobile,
                ]}
              >
                Profile
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.headerBtn, isMobile && styles.headerBtnMobile]}
              onPress={() => {
                console.log("[Dashboard] Navigating to Committee");
                router.push("/admin/committee-members");
              }}
            >
              <Text
                style={[
                  styles.headerBtnText,
                  isMobile && styles.headerBtnTextMobile,
                ]}
              >
                Committee
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.headerBtn, isMobile && styles.headerBtnMobile]}
              onPress={() => {
                console.log("[Dashboard] Navigating to Staff");
                router.push("/admin/society-staff");
              }}
            >
              <Text
                style={[
                  styles.headerBtnText,
                  isMobile && styles.headerBtnTextMobile,
                ]}
              >
                Staff
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.logoutBtn, isMobile && styles.logoutBtnMobile]}
              onPress={signOut}
            >
              <Text
                style={[styles.logoutText, isMobile && styles.logoutTextMobile]}
              >
                Logout
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{wingCount}</Text>
            <Text style={styles.statLabel}>Wings/Blocks</Text>
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
            const cardWidth = isMobile ? "48%" : "31.3%";
            return (
              <TouchableOpacity
                key={wingInfo.id}
                style={[
                  styles.wingCard,
                  { width: cardWidth },
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
                    {wingInfo.name}
                  </Text>
                  <Text
                    style={[
                      styles.wingName,
                      isConfigured
                        ? styles.wingNameConfigured
                        : styles.wingNamePending,
                    ]}
                  >
                    {wingInfo.totalFlats ||
                      wingInfo.floors?.reduce(
                        (sum: number, f: any) => sum + (f.flatCount || 0),
                        0,
                      ) ||
                      0}{" "}
                    Units
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
    shadowColor: "#14B8A6",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  headerCardMobile: {
    flexDirection: "column",
    alignItems: "flex-start",
    padding: 16,
  },
  headerLeft: {
    flex: 1,
  },
  headerLeftMobile: {
    width: "100%",
    marginBottom: 12,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerRightMobile: {
    width: "100%",
    flexWrap: "wrap",
    gap: 6,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 8,
    width: "100%",
    flexWrap: "wrap",
  },
  societyName: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0F2A3D",
    letterSpacing: -0.5,
    textTransform: "uppercase",
  },
  welcomeText: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  headerBtn: {
    backgroundColor: "#E6FFFA",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#B2DFDB",
  },
  headerBtnText: {
    color: "#14B8A6",
    fontWeight: "700",
    fontSize: 12,
  },
  headerBtnMobile: {
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 8,
  },
  headerBtnTextMobile: {
    fontSize: 10,
  },
  logoutBtn: {
    backgroundColor: "#FEF2F2",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  logoutBtnMobile: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  logoutText: {
    color: "#EF4444",
    fontWeight: "700",
    fontSize: 13,
  },
  logoutTextMobile: {
    fontSize: 10,
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
    shadowColor: "#0F2A3D",
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
    color: "#14B8A6",
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
    color: "#0F2A3D",
    marginBottom: 16,
    marginLeft: 4,
  },
  wingsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    justifyContent: "flex-start",
    marginBottom: 24,
  },
  wingCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    paddingTop: 35,
    borderWidth: 2,
    borderColor: "#E2E8F0",
    minHeight: 200,
    maxWidth: 320,
    minWidth: 260,
    position: "relative",
    overflow: "hidden",
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 4,
  },
  wingCardConfigured: {
    backgroundColor: "#E6FFFA",
    borderColor: "#14B8A6",
    borderStyle: "solid",
    shadowColor: "#14B8A6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 2,
  },
  wingCardPending: {
    backgroundColor: "#E6FFFA",
    borderColor: "#14B8A6",
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
    color: "#0F9B8E",
  },
  wingLetterPending: {
    color: "#14B8A6",
  },
  wingName: {
    fontSize: 14,
    fontWeight: "800",
    marginTop: 4,
    textAlign: "center",
  },
  wingNameConfigured: {
    color: "#0F9B8E",
  },
  wingNamePending: {
    color: "#0F9B8E",
  },
  badge: {
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeSuccess: {
    backgroundColor: "#0F9B8E",
  },
  badgeInfo: {
    backgroundColor: "#14B8A6",
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
    color: "#334155",
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
    backgroundColor: "#0F9B8E",
  },
  towerTopPending: {
    backgroundColor: "#14B8A6",
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
    backgroundColor: "#E6FFFA",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#14B8A6",
  },
  addWingBtnText: {
    color: "#0F9B8E",
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
