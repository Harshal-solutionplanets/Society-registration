import { appId, db } from "@/configs/firebaseConfig";
import { useAuth } from "@/hooks/useAuth";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import Toast from "react-native-toast-message";

interface FlatData {
  flatNumber: number;
  unitName: string;
  hasCredentials: boolean;
  residenceType: string;
  residentName: string;
  residentMobile: string;
  alternateMobile?: string;
  residentUID?: string | null;
  status?: "Occupied" | "Vacant" | "OCCUPIED" | "VACANT"; // Keeping legacy ones for type safety
  ownership?: "SELF_OWNED" | "RENTAL";
  ownerName?: string;
  ownerContact?: string;
  familyMembers: string;
  staffMembers: string;
  username?: string;
  password?: string;
  driveFolderId?: string;
}

const RESIDENCE_TYPES = [
  "Residence",
  "Shop",
  "Godown",
  "Office",
  "Warehouse",
  "Studio",
  "Penthouse",
];

export default function FloorDetail() {
  const { wingId, wingName, floorNumber, flatCount, floorName } =
    useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [flats, setFlats] = useState<FlatData[]>(() => {
    // Generate flat numbers based on flatCount
    const numFlats = parseInt(flatCount as string) || 0;
    const floor = parseInt(floorNumber as string);
    const generatedFlats: FlatData[] = [];

    for (let i = 1; i <= numFlats; i++) {
      const flatNum = floor * 100 + i;
      generatedFlats.push({
        flatNumber: flatNum,
        unitName: flatNum.toString(),
        hasCredentials: false,
        residenceType: "Residence",
        residentName: "",
        residentMobile: "",
        alternateMobile: "",
        status: "Occupied", // Default to "Occupied"
        ownership: "SELF_OWNED",
        familyMembers: "",
        staffMembers: "",
      });
    }

    return generatedFlats;
  });

  const [loading, setLoading] = useState(true);
  const [floorFolderId, setFloorFolderId] = useState<string | null>(null);
  const [societyName, setSocietyName] = useState("");
  const [actualFloorName, setActualFloorName] = useState<string | null>(
    (floorName as string) || null,
  );
  const [currentFlatCount, setCurrentFlatCount] = useState<number>(
    parseInt(flatCount as string) || 0,
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [existingWingData, setExistingWingData] = useState<any>(null);

  const handleBack = () => {
    if (!user) {
      router.replace("/admin/auth");
    } else {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/admin/dashboard");
      }
    }
  };

  useEffect(() => {
    if (!user) return;

    fetchFloorFolderId();
    fetchSocietyName();

    const unitsPath = `artifacts/${appId}/public/data/societies/${user?.uid}/wings/${wingId}/${floorNumber}`;
    const q = query(collection(db, unitsPath));

    // 1. Listen to Units Collection
    const unsubscribeUnits = onSnapshot(q, (querySnapshot) => {
      const fetchedFlats: FlatData[] = querySnapshot.docs.map((doc) => {
        const data = doc.data();
        const parts = data.id.split("-");
        const flatNum = parseInt(parts[parts.length - 1]);

        const statusFromDB = data.residenceStatus || data.status;
        const normalizedStatus =
          statusFromDB === "Vacant" || statusFromDB === "VACANT"
            ? "Vacant"
            : "Occupied";

        return {
          flatNumber: flatNum,
          unitName: data.unitName || flatNum.toString(),
          residenceType: data.residenceType || "Residence",
          residentName: data.residentName || "",
          residentMobile: data.residentMobile || "",
          alternateMobile: data.alternateMobile || "",
          status: normalizedStatus as any,
          ownership: data.ownership || "SELF_OWNED",
          ownerName: data.ownerName || "",
          ownerContact: data.ownerContact || "",
          familyMembers: (
            data.familyMembers ||
            data.familyMemberCount ||
            0
          ).toString(),
          staffMembers: (data.staffMembers || 0).toString(),
          hasCredentials: !!(data.username || data.residentUsername),
          username: data.username || data.residentUsername,
          password: data.password || data.residentPassword,
          driveFolderId: data.driveFolderId || "",
        };
      });

      setFlats((prev) => {
        // Map of DB units for easy lookup
        const dbMap = new Map(fetchedFlats.map((f) => [f.flatNumber, f]));

        // We must preserve the structural count from the wing data if it's already loaded
        // If not, we just use fetchedFlats
        if (fetchedFlats.length === 0 && prev.length === 0) return prev;

        return prev.map((f) => {
          if (dbMap.has(f.flatNumber)) {
            return dbMap.get(f.flatNumber)!;
          }
          // If it's not in DB, reset to clean placeholder (Pending initialization)
          return {
            flatNumber: f.flatNumber,
            unitName: f.flatNumber.toString(),
            hasCredentials: false,
            residenceType: "Residence",
            residentName: "",
            residentMobile: "",
            alternateMobile: "",
            status: "Occupied",
            ownership: "SELF_OWNED",
            familyMembers: "",
            staffMembers: "",
          };
        });
      });
      setLoading(false);
    });

    // 2. Listen to Wing Document for structural changes (Live flatCount)
    const wingPath = `artifacts/${appId}/public/data/societies/${user?.uid}/wings/${wingId}`;
    const unsubscribeWing = onSnapshot(doc(db, wingPath), (wingDoc) => {
      if (wingDoc.exists()) {
        const data = wingDoc.data();
        setExistingWingData(data);
        const floor = data.floors?.find(
          (f: any) => f.floorNumber === parseInt(floorNumber as string),
        );
        if (floor) {
          if (floor.floorName) setActualFloorName(floor.floorName);
          if (floor.driveFolderId) setFloorFolderId(floor.driveFolderId);

          const liveFlatCount = parseInt(floor.flatCount) || 0;
          setCurrentFlatCount(liveFlatCount);

          setFlats((prev) => {
            const floorNum = parseInt(floorNumber as string);
            const combined: FlatData[] = [];

            // Always generate exactly liveFlatCount items
            for (let i = 1; i <= liveFlatCount; i++) {
              const flatNum = floorNum * 100 + i;
              const existing = prev.find((f) => f.flatNumber === flatNum);

              if (existing) {
                combined.push(existing);
              } else {
                combined.push({
                  flatNumber: flatNum,
                  unitName: flatNum.toString(),
                  hasCredentials: false,
                  residenceType: "Residence",
                  residentName: "",
                  residentMobile: "",
                  alternateMobile: "",
                  status: "Occupied",
                  ownership: "SELF_OWNED",
                  familyMembers: "",
                  staffMembers: "",
                });
              }
            }
            return combined.sort((a, b) => a.flatNumber - b.flatNumber);
          });
        }
      }
    });

    return () => {
      unsubscribeUnits();
      unsubscribeWing();
    };
  }, [user, wingId, floorNumber]);

  // Sync currentFlatCount when flatCount changes (first load)
  useEffect(() => {
    if (flatCount) setCurrentFlatCount(parseInt(flatCount as string) || 0);
  }, [flatCount]);

  const fetchData = async () => {
    // Other simple fetches can stay here or be moved
    setLoading(true);
    try {
      await Promise.all([fetchFloorFolderId(), fetchSocietyName()]);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSocietyName = async () => {
    if (!user) return;
    try {
      const societyDoc = await getDoc(
        doc(db, `artifacts/${appId}/public/data/societies`, user?.uid),
      );
      if (societyDoc.exists()) {
        setSocietyName(societyDoc.data().societyName || "");
      }
    } catch (error) {
      console.error("Error fetching society name:", error);
    }
  };

  const fetchFloorFolderId = async () => {
    if (!user) return;
    try {
      const wingPath = `artifacts/${appId}/public/data/societies/${user?.uid}/wings/${wingId}`;
      const wingDoc = await getDoc(doc(db, wingPath));
      if (wingDoc.exists()) {
        const data = wingDoc.data();
        const floor = data.floors?.find(
          (f: any) => f.floorNumber === parseInt(floorNumber as string),
        );
        // Set actual floor name and recover flatCount if missing
        if (floor) {
          if (floor.floorName) setActualFloorName(floor.floorName);
          if (floor.driveFolderId) setFloorFolderId(floor.driveFolderId);

          // CRITICAL: If flats state is empty, trigger a re-generation using recovered count
          if (flats.length === 0 && floor.flatCount) {
            const numFlats = parseInt(floor.flatCount);
            const floorNum = parseInt(floorNumber as string);
            if (!isNaN(numFlats) && !isNaN(floorNum)) {
              const generated: FlatData[] = [];
              for (let i = 1; i <= numFlats; i++) {
                const flatNum = floorNum * 100 + i;
                generated.push({
                  flatNumber: flatNum,
                  unitName: flatNum.toString(),
                  hasCredentials: false,
                  residenceType: "Residence",
                  residentName: "",
                  residentMobile: "",
                  alternateMobile: "",
                  status: "Occupied",
                  ownership: "SELF_OWNED",
                  familyMembers: "",
                  staffMembers: "",
                });
              }
              setFlats(generated);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error fetching floor folder ID:", error);
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

  const setFolderPublic = async (folderId: string, token: string) => {
    try {
      await fetch(
        `https://www.googleapis.com/drive/v3/files/${folderId}/permissions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            role: "reader",
            type: "anyone",
          }),
        },
      );
    } catch (e) {
      console.warn("Could not set folder permissions:", e);
    }
  };

  const createDriveFolder = async (
    name: string,
    parentId: string,
    token: string,
  ) => {
    try {
      const response = await fetch(
        "https://www.googleapis.com/drive/v3/files",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: name,
            mimeType: "application/vnd.google-apps.folder",
            parents: [parentId],
          }),
        },
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error?.message || `Failed to create folder ${name}`,
        );
      }
      const data = await response.json();
      const folderId = data.id;

      // Set permission to "Anyone with the link"
      await setFolderPublic(folderId, token);

      return folderId;
    } catch (error) {
      console.error(`Error creating folder ${name}:`, error);
      throw error;
    }
  };

  const deleteDriveFolder = async (folderId: string, token: string) => {
    try {
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${folderId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!response.ok && response.status !== 404) {
        console.warn("Drive folder deletion failed");
        return false;
      }
      return true;
    } catch (error) {
      console.warn("Error deleting Drive folder:", error);
      return false;
    }
  };

  const handleSaveStructure = async () => {
    if (!user || !wingId || !existingWingData) return;
    setIsSaving(true);
    try {
      const wingPath = `artifacts/${appId}/public/data/societies/${user?.uid}/wings/${wingId}`;
      const updatedFloors = (existingWingData.floors || []).map((f: any) =>
        f.floorNumber === parseInt(floorNumber as string)
          ? { ...f, flatCount: currentFlatCount }
          : f,
      );

      const totalFlats = updatedFloors.reduce(
        (sum: number, f: any) => sum + (f.flatCount || 0),
        0,
      );

      await updateDoc(doc(db, wingPath), {
        floors: updatedFloors,
        totalFlats: totalFlats,
        updatedAt: new Date().toISOString(),
      });

      setHasUnsavedChanges(false);
      Toast.show({
        type: "success",
        text1: "Structure Saved",
        text2: `Floor unit count (${currentFlatCount}) synced with Wing dashboard.`,
      });
    } catch (error: any) {
      console.error("Error saving structure:", error);
      Alert.alert("Error", "Failed to save wing structure changes.");
    } finally {
      setIsSaving(false);
    }
  };

  const updateWingFlatCount = (newCount: number) => {
    setCurrentFlatCount(newCount);
    setHasUnsavedChanges(true);
  };

  const handleAddFlat = async () => {
    if (!user || isProcessing) return;
    setIsProcessing(true);
    try {
      // 1. Calculate next flat number
      const floorNum = parseInt(floorNumber as string);
      let nextNumber = floorNum * 100 + 1;
      if (flats.length > 0) {
        const maxNum = Math.max(...flats.map((f) => f.flatNumber));
        nextNumber = maxNum + 1;
      }
      const unitName = nextNumber.toString();
      const wingPrefixForId = (wingId as string)
        .replace(/\s+/g, "_")
        .toUpperCase();
      const unitId = `${wingPrefixForId}-${floorNumber}-${nextNumber}`;

      // 2. Refresh Drive Token
      const societyDoc = await getDoc(
        doc(db, `artifacts/${appId}/public/data/societies`, user?.uid),
      );
      let token = societyDoc.data()?.driveAccessToken;
      if (!token) token = await refreshAccessToken();

      // 3. Create Drive Folder
      let flatFolderId = "";
      if (token && floorFolderId) {
        try {
          flatFolderId = await createDriveFolder(
            unitName,
            floorFolderId,
            token,
          );
        } catch (e) {
          console.warn("Drive folder creation failed for new flat");
        }
      }

      // 4. Generate Credentials (same logic as wing-setup)
      const societyData = societyDoc.data();
      const societyPrefix = (societyData?.societyName || "SOC")
        .substring(0, 3)
        .toUpperCase();
      const wingPrefixForUsername = (wingId as string)
        .replace(/\s+/g, "")
        .toUpperCase();
      const residentUsername =
        `${societyPrefix}-${wingPrefixForUsername}-${nextNumber}`.toUpperCase();
      const residentPassword = generatePassword(6);

      // 5. Save to Firestore
      const unitPayload = {
        id: unitId,
        unitName: unitName,
        flatNumber: nextNumber,
        residenceType: "Residence",
        residenceStatus: "Occupied",
        residentName: "",
        residentMobile: "",
        username: residentUsername,
        residentUsername,
        password: residentPassword,
        residentPassword,
        driveFolderId: flatFolderId,
        societyId: appId,
        adminUID: user.uid,
        wingId: wingId as string,
        wingName: wingName as string,
        floorNumber: parseInt(floorNumber as string),
        floorName: actualFloorName || `Floor ${floorNumber}`,
        updatedAt: new Date().toISOString(),
      };

      const wingUnitPath = `artifacts/${appId}/public/data/societies/${user?.uid}/wings/${wingId}/${floorNumber}/${unitId}`;
      const residentPath = `artifacts/${appId}/public/data/societies/${user?.uid}/Residents/${unitId}`;

      const batch = writeBatch(db);
      batch.set(doc(db, wingUnitPath), unitPayload);
      batch.set(doc(db, residentPath), unitPayload);
      await batch.commit();

      // 6. Mark as unsaved
      updateWingFlatCount(currentFlatCount + 1);

      Toast.show({
        type: "success",
        text1: "Flat Added",
        text2: `Flat ${unitName} created successfully.`,
      });
    } catch (error: any) {
      console.error("Add Flat Error:", error);
      Alert.alert("Error", error.message || "Failed to add flat");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteFlat = async (flatNum: number) => {
    if (!user || isProcessing) return;

    const performDelete = async () => {
      setIsProcessing(true);
      try {
        const wingPrefixForId = (wingId as string)
          .replace(/\s+/g, "_")
          .toUpperCase();
        const unitId = `${wingPrefixForId}-${floorNumber}-${flatNum}`;
        const flat = flats.find((f) => f.flatNumber === flatNum);

        // 1. Refresh Drive Token
        const societyDoc = await getDoc(
          doc(db, `artifacts/${appId}/public/data/societies`, user?.uid),
        );
        let token = societyDoc.data()?.driveAccessToken;
        if (!token) token = await refreshAccessToken();

        // 2. Delete Drive Folder
        if (token && flat?.driveFolderId) {
          await deleteDriveFolder(flat.driveFolderId, token);
        }

        // 3. Delete from Firestore
        const wingUnitPath = `artifacts/${appId}/public/data/societies/${user?.uid}/wings/${wingId}/${floorNumber}/${unitId}`;
        const residentPath = `artifacts/${appId}/public/data/societies/${user?.uid}/Residents/${unitId}`;

        const batch = writeBatch(db);
        batch.delete(doc(db, wingUnitPath));
        batch.delete(doc(db, residentPath));
        await batch.commit();

        // 4. Mark as unsaved
        updateWingFlatCount(Math.max(0, currentFlatCount - 1));

        Toast.show({
          type: "info",
          text1: "Flat Deleted",
          text2: `Flat ${flat?.unitName} removed successfully.`,
        });
      } catch (error: any) {
        console.error("Delete Flat Error:", error);
        Alert.alert("Error", error.message || "Failed to delete flat");
      } finally {
        setIsProcessing(false);
      }
    };

    if (Platform.OS === "web") {
      if (
        window.confirm(
          `Are you sure you want to delete flat ${flatNum}? This cannot be undone.`,
        )
      ) {
        performDelete();
      }
    } else {
      Alert.alert(
        "Delete Flat",
        `Are you sure you want to delete flat ${flatNum}? This will permanently remove all its data.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: performDelete },
        ],
      );
    }
  };

  const generatePassword = (length: number): string => {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let password = "";
    for (let i = 0; i < length; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };

  const handleViewCredentials = (flat: any) => {
    // Generate unitId consistently with wing-setup.tsx
    const wingPrefixForId = (wingId as string)
      .replace(/\s+/g, "_")
      .toUpperCase();
    const unitId = `${wingPrefixForId}-${floorNumber}-${flat.flatNumber}`;

    router.push({
      pathname: "/admin/unit" as any,
      params: {
        unitId,
        wingId: wingId as string,
        floorNumber: floorNumber as string,
        wingName: wingName as string,
        societyName: societyName as string,
        flatCount: currentFlatCount.toString(),
        floorName: (actualFloorName || floorName) as string,
      },
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#14B8A6" />
          </TouchableOpacity>
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
              marginLeft: -4,
              letterSpacing: -0.5,
            }}
          >
            Zonect
          </Text>
        </View>

        <View style={styles.headerActions}>
          {hasUnsavedChanges && (
            <TouchableOpacity
              style={[styles.saveBtn, isSaving && styles.disabledBtn]}
              onPress={handleSaveStructure}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="cloud-upload" size={18} color="#fff" />
                  <Text style={styles.saveBtnText}>Save Changes</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.addFlatBtn, isProcessing && styles.disabledBtn]}
            onPress={handleAddFlat}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="add-circle" size={20} color="#fff" />
                <Text style={styles.addFlatBtnText}>Add Flat</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#14B8A6" />
          <Text style={styles.loadingText}>Loading flats...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          <View style={styles.flatsGrid}>
            {flats.map((flat) => {
              const cardWidth =
                width < 480 ? "100%" : width < 768 ? "48%" : "31.3%";
              return (
                <View
                  key={flat.flatNumber}
                  style={[styles.flatPanel, { width: cardWidth }]}
                >
                  <View style={styles.flatHeader}>
                    <Text style={styles.flatNumber}>{flat.unitName}</Text>
                    <View style={styles.headerRight}>
                      <View
                        style={[
                          styles.statusBadge,
                          flat.hasCredentials
                            ? styles.statusGenerated
                            : styles.statusPending,
                        ]}
                      >
                        <Text style={styles.statusText}>
                          {flat.hasCredentials ? "READY" : "PENDING"}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.deleteFlatBtn}
                        onPress={() => handleDeleteFlat(flat.flatNumber)}
                        disabled={isProcessing}
                      >
                        <Ionicons
                          name="trash"
                          size={18}
                          color={isProcessing ? "#CCC" : "#EF4444"}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.residenceTypeContainer}>
                    <Text style={styles.residenceTypeLabel}>Type:</Text>
                    <Text style={styles.residenceTypeValue}>
                      {flat.residenceType}
                    </Text>
                    <View
                      style={[
                        styles.statusIndicator,
                        flat.status === "Occupied"
                          ? styles.statusOccupied
                          : styles.statusVacant,
                      ]}
                    >
                      <Text style={styles.statusIndicatorText}>
                        {flat.status}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.residentInfoMini}>
                    <Text style={styles.residentNameMini}>
                      {flat.residentName || "No Name Set"}
                    </Text>
                    <Text style={styles.residentMobileMini}>
                      {flat.residentMobile || "No Mobile Set"}
                    </Text>
                    {parseInt(flat.familyMembers?.toString() || "0") > 0 ? (
                      <Text style={styles.familyMini}>
                        👨‍👩‍👧‍👦 {flat.familyMembers} Family Members
                      </Text>
                    ) : null}
                    {parseInt(flat.staffMembers?.toString() || "0") > 0 ? (
                      <Text style={styles.familyMini}>
                        👮 {flat.staffMembers} Staff Members
                      </Text>
                    ) : null}
                    {flat.ownership && (
                      <View
                        style={[
                          styles.ownershipBadge,
                          flat.ownership === "RENTAL"
                            ? styles.rentalBadge
                            : styles.selfOwnedBadge,
                        ]}
                      >
                        <Text style={styles.ownershipText}>
                          {flat.ownership === "RENTAL"
                            ? "🏠 Rental"
                            : "🔑 Self Owned"}
                        </Text>
                      </View>
                    )}
                  </View>

                  {flat.hasCredentials ? (
                    <>
                      <View style={styles.credInfo}>
                        <Text style={styles.credLabel}>Username:</Text>
                        <Text style={styles.credValue}>{flat.username}</Text>
                      </View>
                      <View style={styles.cardActions}>
                        <TouchableOpacity
                          style={styles.viewBtn} // Keep green color as it was for View Details
                          onPress={() => handleViewCredentials(flat)}
                        >
                          <Text style={styles.viewBtnText}>
                            View Credentials
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : !flat.residentName && !flat.residentMobile ? (
                    <View style={styles.noCredsContainer}>
                      <Text style={styles.noCredsText}>
                        Pending Initialization
                      </Text>
                      <Text style={styles.noCredsSubtext}>
                        Credentials will appear once wing structure is saved.
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* Credentials Modal */}
      {/* This modal is no longer used as we navigate to /admin/unit */}
      {/* <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Unit Credentials</Text>

            {selectedFlat && (
              <View style={styles.credentialsContainer}>
                <View style={styles.credentialRow}>
                  <Text style={styles.credentialLabel}>Unit Number</Text>
                  <Text style={styles.credentialValue}>
                    {selectedFlat.unitName}
                  </Text>
                </View>

                <View style={styles.credentialRow}>
                  <Text style={styles.credentialLabel}>Residence Type</Text>
                  <Text style={styles.credentialValue}>
                    {selectedFlat.residenceType}
                  </Text>
                </View>

                <View style={styles.credentialRow}>
                  <Text style={styles.credentialLabel}>Resident Name</Text>
                  <Text style={styles.credentialValue}>
                    {selectedFlat.residentName || "Not Set"}
                  </Text>
                </View>

                <View style={styles.credentialRow}>
                  <Text style={styles.credentialLabel}>Resident Mobile</Text>
                  <Text style={styles.credentialValue}>
                    {selectedFlat.residentMobile || "Not Set"}
                  </Text>
                </View>

                <View style={styles.credentialRow}>
                  <Text style={styles.credentialLabel}>Residence Status</Text>
                  <Text
                    style={[
                      styles.credentialValue,
                      {
                        fontSize: 12,
                        fontWeight: "600",
                        color:
                          selectedFlat.status === "Occupied"
                            ? "#0F9B8E"
                            : "#B8892D",
                      },
                    ]}
                  >
                    {selectedFlat.status}
                  </Text>
                </View>

                <View style={styles.credentialRow}>
                  <Text style={styles.credentialLabel}>Family Members</Text>
                  <Text style={styles.credentialValue}>
                    {selectedFlat.familyMembers || "0"}
                  </Text>
                </View>

                <View style={styles.credentialRow}>
                  <Text style={styles.credentialLabel}>Staff Members</Text>
                  <Text style={styles.credentialValue}>
                    {selectedFlat.staffMembers || "0"}
                  </Text>
                </View>

                <View style={styles.credentialRow}>
                  <Text style={styles.credentialLabel}>Username</Text>
                  <View style={styles.credentialValueBox}>
                    <Text style={styles.credentialValue}>
                      {selectedFlat.username}
                    </Text>
                  </View>
                </View>

                <View style={styles.credentialRow}>
                  <Text style={styles.credentialLabel}>Password</Text>
                  <View style={styles.credentialValueBox}>
                    <Text style={styles.credentialValue}>
                      {selectedFlat.password}
                    </Text>
                  </View>
                </View>

                <View style={styles.credentialRow}>
                  <Text style={styles.credentialLabel}>Ownership</Text>
                  <Text style={styles.credentialValue}>
                    {selectedFlat.ownership === "RENTAL"
                      ? "Rental"
                      : "Self Owned"}
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.copyBtn}
                onPress={handleCopyCredentials}
              >
                <Text style={styles.copyBtnText}>📋 Copy Credentials</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.closeBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal> */}

      {/* Edit Flat Modal */}
      {/* This modal is no longer used as editing is handled on the /admin/unit page */}
      {/* <Modal
        animationType="slide"
        transparent={true}
        visible={editModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Unit Details</Text>

            <View style={styles.editForm}>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Unit Number / Name</Text>
                <TextInput
                  style={styles.formInput}
                  value={editUnitName}
                  onChangeText={setEditUnitName}
                  placeholder="e.g. 101, A1, Shop-1"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Residence Type</Text>
                <TouchableOpacity
                  style={styles.dropdownButton}
                  onPress={() =>
                    setShowResidenceDropdown(!showResidenceDropdown)
                  }
                >
                  <Text style={styles.dropdownButtonText}>
                    {editResidenceType}
                  </Text>
                  <Text style={styles.dropdownArrow}>
                    {showResidenceDropdown ? "▲" : "▼"}
                  </Text>
                </TouchableOpacity>

                {showResidenceDropdown && (
                  <ScrollView
                    style={styles.dropdownList}
                    nestedScrollEnabled={true}
                  >
                    {RESIDENCE_TYPES.map((type) => (
                      <TouchableOpacity
                        key={type}
                        style={[
                          styles.dropdownItem,
                          editResidenceType === type &&
                            styles.dropdownItemSelected,
                        ]}
                        onPress={() => {
                          setEditResidenceType(type);
                          setShowResidenceDropdown(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.dropdownItemText,
                            editResidenceType === type &&
                              styles.dropdownItemTextSelected,
                          ]}
                        >
                          {type}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Resident Name</Text>
                <TextInput
                  style={styles.formInput}
                  value={editResidentName}
                  onChangeText={setEditResidentName}
                  placeholder="Enter Name of Flat owner"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Resident Mobile No.</Text>
                <TextInput
                  style={styles.formInput}
                  value={editResidentMobile}
                  onChangeText={setEditResidentMobile}
                  placeholder="Enter Mobile Number"
                  keyboardType="phone-pad"
                  maxLength={10}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Residence Status</Text>
                <View style={styles.statusToggleRow}>
                  <TouchableOpacity
                    style={[
                      styles.statusToggleBtn,
                      editStatus === "Vacant" && styles.statusToggleBtnActive,
                    ]}
                    onPress={() => setEditStatus("Vacant")}
                  >
                    <Text
                      style={[
                        styles.statusToggleText,
                        editStatus === "Vacant" &&
                          styles.statusToggleTextActive,
                      ]}
                    >
                      Vacant
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.statusToggleBtn,
                      editStatus === "Occupied" && styles.statusToggleBtnActive,
                    ]}
                    onPress={() => setEditStatus("Occupied")}
                  >
                    <Text
                      style={[
                        styles.statusToggleText,
                        editStatus === "Occupied" &&
                          styles.statusToggleTextActive,
                      ]}
                    >
                      Occupied
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Ownership Status</Text>
                <View style={styles.statusToggleRow}>
                  <TouchableOpacity
                    style={[
                      styles.statusToggleBtn,
                      editOwnership === "SELF_OWNED" &&
                        styles.statusToggleBtnActive,
                    ]}
                    onPress={() => {
                      setEditOwnership("SELF_OWNED");
                      setEditOwnerName("");
                      setEditOwnerContact("");
                    }}
                  >
                    <Text
                      style={[
                        styles.statusToggleText,
                        editOwnership === "SELF_OWNED" &&
                          styles.statusToggleTextActive,
                      ]}
                    >
                      Self Owned
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.statusToggleBtn,
                      editOwnership === "RENTAL" &&
                        styles.statusToggleBtnActive,
                    ]}
                    onPress={() => setEditOwnership("RENTAL")}
                  >
                    <Text
                      style={[
                        styles.statusToggleText,
                        editOwnership === "RENTAL" &&
                          styles.statusToggleTextActive,
                      ]}
                    >
                      Rental
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {editOwnership === "RENTAL" && (
                <>
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Flat owner name</Text>
                    <TextInput
                      style={styles.formInput}
                      value={editOwnerName}
                      onChangeText={setEditOwnerName}
                      placeholder="Enter Owner Name"
                    />
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Flat owner contact</Text>
                    <TextInput
                      style={styles.formInput}
                      value={editOwnerContact}
                      onChangeText={setEditOwnerContact}
                      placeholder="Enter Owner Contact"
                      keyboardType="phone-pad"
                      maxLength={10}
                    />
                  </View>
                </>
              )}

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>
                  Login Password (Admin/User Copy)
                </Text>
                <TextInput
                  style={styles.formInput}
                  value={editPassword}
                  onChangeText={(val) =>
                    setEditPassword(val.replace(/\s/g, ""))
                  }
                  placeholder="Enter Password"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={styles.helpText}>
                  6-14 chars, no spaces. Updates for both resident and admin.
                </Text>
              </View>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => {
                  setEditModalVisible(false);
                  setShowResidenceDropdown(false);
                }}
              >
                <Text style={styles.closeBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.copyBtn} onPress={handleSaveEdit}>
                <Text style={styles.copyBtnText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal> */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: "#666",
    fontWeight: "500",
  },
  content: {
    flex: 1,
  },
  header: {
    padding: 20,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backBtn: {
    padding: 4,
  },
  backBtnText: {
    fontSize: 16,
    color: "#14B8A6",
    fontWeight: "600",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#14B8A6",
  },
  subtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  addFlatBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#14B8A6",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  addFlatBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#0F9B8E",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  saveBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  deleteFlatBtn: {
    padding: 6,
    backgroundColor: "#FEF2F2",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FEE2E2",
  },
  flatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 10,
    justifyContent: "flex-start",
    gap: 12,
  },
  flatPanel: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  flatHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  editIconBtn: {
    padding: 4,
  },
  editIcon: {
    fontSize: 16,
  },
  flatNumber: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#333",
  },
  residenceTypeContainer: {
    backgroundColor: "#F8FAFC",
    padding: 8,
    borderRadius: 6,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  residenceTypeLabel: {
    fontSize: 11,
    color: "#666",
    fontWeight: "600",
    marginRight: 6,
  },
  residenceTypeValue: {
    fontSize: 12,
    color: "#14B8A6",
    fontWeight: "600",
  },
  residentInfoMini: {
    marginBottom: 10,
    padding: 8,
    backgroundColor: "#E6FFFA",
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#14B8A6",
  },
  residentNameMini: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#333",
  },
  residentMobileMini: {
    fontSize: 11,
    color: "#666",
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusPending: {
    backgroundColor: "#F2E2C1",
  },
  statusGenerated: {
    backgroundColor: "#B2DFDB",
  },
  statusText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#333",
  },
  credInfo: {
    marginBottom: 10,
  },
  credLabel: {
    fontSize: 11,
    color: "#666",
    marginBottom: 2,
  },
  credValue: {
    fontSize: 13,
    color: "#333",
    fontWeight: "600",
    fontFamily: "monospace",
  },
  generateBtn: {
    backgroundColor: "#14B8A6",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 5,
  },
  generateBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  viewBtn: {
    backgroundColor: "#0F9B8E",
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
    flex: 1,
  },
  viewBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  editBtn: {
    backgroundColor: "#14B8A6",
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
    flex: 1,
  },
  editBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  cardActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#fff",
    width: "100%",
    maxWidth: 400,
    padding: 25,
    borderRadius: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 20,
    textAlign: "center",
  },
  credentialsContainer: {
    marginBottom: 25,
  },
  credentialRow: {
    marginBottom: 15,
  },
  credentialLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 5,
    fontWeight: "600",
  },
  credentialValue: {
    fontSize: 16,
    color: "#333",
    fontWeight: "500",
  },
  credentialValueBox: {
    backgroundColor: "#F8FAFC",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  modalButtons: {
    gap: 12,
  },
  copyBtn: {
    backgroundColor: "#0F9B8E",
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  copyBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  closeBtn: {
    backgroundColor: "#F1F5F9",
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  closeBtnText: {
    color: "#334155",
    fontSize: 16,
    fontWeight: "bold",
  },
  editForm: {
    marginBottom: 20,
  },
  formGroup: {
    marginBottom: 15,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  formInput: {
    backgroundColor: "#F8FAFC",
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  dropdownButton: {
    backgroundColor: "#F8FAFC",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dropdownButtonText: {
    fontSize: 16,
    color: "#333",
  },
  dropdownArrow: {
    fontSize: 12,
    color: "#666",
  },
  dropdownList: {
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginTop: 5,
    maxHeight: 200,
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  dropdownItemSelected: {
    backgroundColor: "#E6FFFA",
  },
  dropdownItemText: {
    fontSize: 14,
    color: "#333",
  },
  dropdownItemTextSelected: {
    color: "#14B8A6",
    fontWeight: "600",
  },
  statusIndicator: {
    marginLeft: "auto",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusOccupied: {
    backgroundColor: "#0F9B8E20",
    borderWidth: 1,
    borderColor: "#0F9B8E",
  },
  statusVacant: {
    backgroundColor: "#B8892D20",
    borderWidth: 1,
    borderColor: "#B8892D",
  },
  statusIndicatorText: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#333",
  },
  familyMini: {
    fontSize: 11,
    color: "#14B8A6",
    marginTop: 4,
    fontWeight: "500",
  },
  statusToggleRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  statusToggleBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
  statusToggleBtnActive: {
    backgroundColor: "#14B8A6",
    borderColor: "#14B8A6",
  },
  statusToggleText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  statusToggleTextActive: {
    color: "#fff",
  },
  ownershipBadge: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  rentalBadge: {
    backgroundColor: "#F2E2C1",
    borderWidth: 1,
    borderColor: "#B8892D",
  },
  selfOwnedBadge: {
    backgroundColor: "#E6F3F0",
    borderWidth: 1,
    borderColor: "#14B8A6",
  },
  ownershipText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#374151",
  },
  noCredsContainer: {
    padding: 12,
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
  },
  noCredsText: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#666",
    marginBottom: 4,
  },
  noCredsSubtext: {
    fontSize: 11,
    color: "#999",
    textAlign: "center",
  },
  helpText: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 4,
    fontStyle: "italic",
  },
});
