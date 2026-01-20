import { appId, db } from "@/configs/firebaseConfig";
import { useAuth } from "@/hooks/useAuth";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Toast from "react-native-toast-message";

interface FloorData {
  floorNumber: number;
  flatCount: number;
  driveFolderId?: string;
}

export default function WingSetup() {
  const params = useLocalSearchParams();
  const wingIndex = params.wingIndex as string;
  const wingId = params.wingId as string;
  const initialWingName = params.wingName as string;
  const router = useRouter();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [wingName, setWingName] = useState(initialWingName);
  const [floorCount, setFloorCount] = useState("");
  const [floors, setFloors] = useState<FloorData[]>([]);
  const [deletedFloors, setDeletedFloors] = useState<number[]>([]);
  const [isInitialFlatSetup, setIsInitialFlatSetup] = useState(true);
  const [existingWingData, setExistingWingData] = useState<any>(null);

  const [selectedFloor, setSelectedFloor] = useState<number | null>(null);
  const [flatInput, setFlatInput] = useState("");
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    if (user) {
      fetchWingData();
    }
  }, [user]);

  const fetchWingData = async () => {
    if (!user) return;
    try {
      const wingPath = `artifacts/${appId}/public/data/societies/${user.uid}/wings/${wingId}`;
      const wingDoc = await getDoc(doc(db, wingPath));

      if (wingDoc.exists()) {
        const data = wingDoc.data();
        setExistingWingData(data);
        setWingName(data.name);
        setFloorCount(data.floorCount.toString());
        setFloors(data.floors || []);
        if (
          data.floors &&
          data.floors.length > 0 &&
          data.floors.some((f: FloorData) => f.flatCount > 0)
        ) {
          setIsInitialFlatSetup(false);
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateStructure = () => {
    if (floors.length > 0) {
      Alert.alert(
        "Structure Exists",
        'A structure already exists. Use "Add Floor" to expand or delete individual floors to modify.',
        [{ text: "OK" }],
      );
      return;
    }

    const numFloors = parseInt(floorCount) || 0;

    if (numFloors <= 0) {
      Alert.alert("Error", "Please enter a valid number of floors");
      return;
    }

    const newFloors: FloorData[] = [];
    for (let i = numFloors; i >= 0; i--) {
      newFloors.push({
        floorNumber: i,
        flatCount: 0,
      });
    }
    setFloors(newFloors);
    setIsInitialFlatSetup(true);

    Toast.show({
      type: "success",
      text1: "Structure Generated",
      text2: `${numFloors} floors + Ground floor created. Click any floor to set flats.`,
    });
  };

  const handleAddFloor = () => {
    const maxFloor =
      floors.length > 0 ? Math.max(...floors.map((f) => f.floorNumber)) : -1;
    const newFloorNumber = maxFloor + 1;

    setFloors((prev) => [
      { floorNumber: newFloorNumber, flatCount: 0 },
      ...prev,
    ]);
    setFloorCount((floors.length + 1).toString());

    Toast.show({
      type: "success",
      text1: "Floor Added",
      text2: `Floor ${newFloorNumber} added to the structure.`,
    });
  };

  const handleDeleteFloor = (floorNumber: number) => {
    console.log("Attempting to delete floor:", floorNumber);

    const performDelete = () => {
      setFloors((prev) => {
        const updated = prev.filter((f) => f.floorNumber !== floorNumber);
        // Update floor count based on the actual remaining floors
        setFloorCount(updated.length.toString());
        return updated;
      });
      setDeletedFloors((prev) => [...prev, floorNumber]);

      Toast.show({
        type: "info",
        text1: "Floor Removed",
        text2: `Floor ${floorNumber} removed from local structure. Save to apply changes.`,
      });
    };

    if (Platform.OS === "web") {
      if (
        window.confirm(
          `Are you sure you want to delete Floor ${floorNumber}? This will remove all units on this floor from the structure.`,
        )
      ) {
        performDelete();
      }
    } else {
      Alert.alert(
        "Delete Floor",
        `Are you sure you want to delete Floor ${floorNumber}? This will remove all units on this floor from the structure.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: performDelete,
          },
        ],
      );
    }
  };

  const openFloorModal = (floorNumber: number) => {
    const floor = floors.find((f) => f.floorNumber === floorNumber);
    setSelectedFloor(floorNumber);
    setFlatInput(floor?.flatCount.toString() || "0");
    setModalVisible(true);
  };

  const handleSaveFlats = () => {
    if (selectedFloor === null) return;
    const numFlats = parseInt(flatInput) || 0;
    const allFloorsEmpty = floors.every((f) => f.flatCount === 0);

    if (isInitialFlatSetup && allFloorsEmpty) {
      setFloors((prev) => prev.map((f) => ({ ...f, flatCount: numFlats })));
      setIsInitialFlatSetup(false);
      Toast.show({
        type: "success",
        text1: "Flats Set",
        text2: `All floors set to ${numFlats} flats (symmetrical structure)`,
      });
    } else {
      setFloors((prev) =>
        prev.map((f) =>
          f.floorNumber === selectedFloor ? { ...f, flatCount: numFlats } : f,
        ),
      );
      Toast.show({
        type: "success",
        text1: "Floor Updated",
        text2: `Floor ${selectedFloor} set to ${numFlats} flats`,
      });
    }
    setModalVisible(false);
    setSelectedFloor(null);
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
      return data.id;
    } catch (error) {
      console.error(`Error creating folder ${name}:`, error);
      throw error;
    }
  };

  const handleSaveWing = async () => {
    if (!user) return;
    if (!wingName) {
      Alert.alert("Error", "Please enter a wing name");
      return;
    }
    if (floors.length === 0) {
      Alert.alert("Error", "Please generate the building structure first");
      return;
    }

    setSaving(true);
    try {
      const societyDoc = await getDoc(
        doc(db, `artifacts/${appId}/public/data/societies`, user.uid),
      );
      const societyData = societyDoc.data();
      const rootFolderId = societyData?.driveFolderId;
      const token =
        typeof window !== "undefined"
          ? sessionStorage.getItem("driveToken")
          : null;

      if (!rootFolderId || !token) {
        throw new Error(
          "Google Drive not linked or session expired. Please log in again.",
        );
      }

      let wingFolderId = existingWingData?.driveFolderId;
      if (!wingFolderId) {
        wingFolderId = await createDriveFolder(
          wingName,
          rootFolderId as string,
          token,
        );
      }

      const batch = writeBatch(db);
      const updatedFloors = [...floors];
      const sanitizedWingId = wingName.replace(/\s+/g, "");
      const wingPrefix = sanitizedWingId.toUpperCase();
      let unitsGenerated = 0;

      for (const floorNum of deletedFloors) {
        const floorPath = `artifacts/${appId}/public/data/societies/${user.uid}/wings/${sanitizedWingId}/${floorNum}`;
        const unitsRef = collection(db, floorPath);
        const unitsSnap = await getDocs(unitsRef);
        unitsSnap.forEach((unitDoc) => {
          batch.delete(unitDoc.ref);
          batch.delete(
            doc(
              db,
              `artifacts/${appId}/public/data/societies/${user.uid}/Residents/${unitDoc.id}`,
            ),
          );
        });
      }

      for (let i = 0; i < updatedFloors.length; i++) {
        const floor = updatedFloors[i];
        const floorName =
          floor.floorNumber === 0
            ? "Ground Floor"
            : `Floor ${floor.floorNumber}`;

        let floorFolderId = floor.driveFolderId;
        if (!floorFolderId) {
          floorFolderId = await createDriveFolder(
            floorName,
            wingFolderId as string,
            token as string,
          );
          updatedFloors[i] = { ...floor, driveFolderId: floorFolderId };
        }

        for (let unitIndex = 1; unitIndex <= floor.flatCount; unitIndex++) {
          const unitNumber = floor.floorNumber * 100 + unitIndex;
          const unitName = `${unitNumber}`;
          const unitId = `${wingPrefix}-${floor.floorNumber}-${unitNumber}`;

          const societyUnitPath = `artifacts/${appId}/public/data/societies/${user.uid}/wings/${sanitizedWingId}/${floor.floorNumber}/${unitId}`;
          const existingUnitDoc = await getDoc(doc(db, societyUnitPath));

          if (!existingUnitDoc.exists()) {
            const flatFolderId = await createDriveFolder(
              unitName,
              floorFolderId as string,
              token as string,
            );
            const societyPrefix = (societyData?.societyName || "SOC")
              .substring(0, 3)
              .toUpperCase();
            const residentUsername =
              `${societyPrefix}-${wingPrefix}-${unitNumber}`.toUpperCase();
            const residentPassword = generatePassword(6);
            const residentPath = `artifacts/${appId}/public/data/societies/${user.uid}/Residents/${unitId}`;

            const unitPayload = {
              id: unitId,
              societyName: societyData?.societyName || "",
              wingName: wingName,
              unitName: unitName,
              residenceType: "Residence",
              residentName: "",
              residentMobile: "",
              residenceStatus: "VACANT",
              familyMembers: 0,
              staffMembers: 0,
              username: residentUsername,
              password: residentPassword,
              displayName: `${wingName} - ${unitName}`,
              wingId: sanitizedWingId,
              floorNumber: floor.floorNumber,
              unitNumber: unitNumber,
              residentUsername: residentUsername,
              residentPassword: residentPassword,
              residentUID: null,
              status: "VACANT",
              driveFolderId: flatFolderId,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };

            batch.set(doc(db, societyUnitPath), unitPayload);
            batch.set(doc(db, residentPath), unitPayload);
            unitsGenerated++;
          }
        }
      }

      const wingPath = `artifacts/${appId}/public/data/societies/${user.uid}/wings/${sanitizedWingId}`;
      const totalFlatsInWing = updatedFloors.reduce(
        (sum, f) => sum + f.flatCount,
        0,
      );
      const wingRef = doc(db, wingPath);
      batch.set(
        wingRef,
        {
          name: wingName,
          wingId: sanitizedWingId,
          wingIndex: parseInt(wingIndex as string),
          driveFolderId: wingFolderId,
          floorCount: updatedFloors.length,
          totalFlats: totalFlatsInWing,
          floors: updatedFloors,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );

      if (wingId && wingId !== sanitizedWingId) {
        const oldWingPath = `artifacts/${appId}/public/data/societies/${user.uid}/wings/${wingId}`;
        batch.delete(doc(db, oldWingPath));
      }

      await batch.commit();
      Toast.show({
        type: "success",
        text1: "Wing Saved Successfully",
        text2: `${wingName}: ${unitsGenerated} new units created.`,
      });
      router.back();
    } catch (error: any) {
      console.error("Error saving wing:", error);
      Alert.alert(
        "Save Failed",
        error.message || "Could not save wing structure.",
      );
    } finally {
      setSaving(false);
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

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  const sanitizedWingId = wingName.replace(/\s+/g, "");

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
          >
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Wing Structure</Text>
        </View>

        <View style={styles.setupSection}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Wing Name</Text>
            <TextInput
              style={styles.input}
              value={wingName}
              onChangeText={setWingName}
              placeholder="e.g. Wing A"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Total Floors</Text>
            <View style={styles.row}>
              <TextInput
                style={[
                  styles.input,
                  { flex: 1, marginBottom: 0 },
                  floors.length > 0 && styles.disabledInput,
                ]}
                value={floorCount}
                onChangeText={setFloorCount}
                placeholder="e.g. 12"
                keyboardType="numeric"
                editable={floors.length === 0}
              />
              {floors.length === 0 ? (
                <TouchableOpacity
                  style={styles.generateBtn}
                  onPress={handleGenerateStructure}
                >
                  <Text style={styles.generateBtnText}>Generate</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.generateBtn, { backgroundColor: "#007AFF" }]}
                  onPress={handleAddFloor}
                >
                  <Text style={styles.generateBtnText}>Add Floor</Text>
                </TouchableOpacity>
              )}
            </View>
            {floors.length > 0 && (
              <Text style={styles.helpText}>
                Floor count is locked. Use "Add Floor" or delete buttons below.
              </Text>
            )}
          </View>
        </View>

        {floors.length > 0 && (
          <View style={styles.buildingSection}>
            <Text style={styles.sectionTitle}>Building Structure</Text>
            <Text style={styles.sectionSubtitle}>
              Click a floor to set number of flats
            </Text>

            <View style={styles.buildingContainer}>
              <View style={styles.roof} />
              {floors.map((floor) => (
                <View
                  key={floor.floorNumber}
                  style={[
                    styles.floorBlock,
                    floor.flatCount > 0 && styles.floorBlockConfigured,
                  ]}
                >
                  <TouchableOpacity
                    style={styles.floorMainArea}
                    onPress={() => openFloorModal(floor.floorNumber)}
                  >
                    <Text style={styles.floorNumberText}>
                      {floor.floorNumber === 0
                        ? "Ground Floor"
                        : `Floor ${floor.floorNumber}`}
                    </Text>
                    <View style={styles.flatTag}>
                      <Text style={styles.flatTagText}>
                        {floor.flatCount} Flats
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <View style={styles.floorActions}>
                    {floor.flatCount > 0 && (
                      <TouchableOpacity
                        style={styles.viewDetailsBtn}
                        onPress={() =>
                          router.push({
                            pathname: "/admin/floor",
                            params: {
                              wingId: sanitizedWingId,
                              wingName: wingName,
                              floorNumber: floor.floorNumber,
                              flatCount: floor.flatCount,
                            },
                          })
                        }
                      >
                        <Text style={styles.viewDetailsBtnText}>→</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.deleteFloorBtn}
                      onPress={() => handleDeleteFloor(floor.floorNumber)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={20}
                        color="#EF4444"
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              <View style={styles.ground} />
            </View>
          </View>
        )}

        {floors.length > 0 && (
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.disabledBtn]}
            onPress={handleSaveWing}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Save Wing Structure</Text>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>

      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {selectedFloor === 0 ? "Ground Floor" : `Floor ${selectedFloor}`}
            </Text>
            <Text style={styles.modalSubtitle}>
              How many flats on this floor?
            </Text>
            <TextInput
              style={styles.modalInput}
              value={flatInput}
              onChangeText={setFlatInput}
              keyboardType="numeric"
              autoFocus
              selectTextOnFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.confirmBtn]}
                onPress={handleSaveFlats}
              >
                <Text style={styles.confirmBtnText}>Set Flats</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F0F2F5",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  backBtn: {
    marginBottom: 10,
  },
  backBtnText: {
    color: "#007AFF",
    fontSize: 16,
    fontWeight: "600",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1A1A1A",
  },
  setupSection: {
    padding: 20,
    backgroundColor: "#fff",
    marginBottom: 10,
  },
  inputGroup: {
    marginBottom: 15,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#F8F9FA",
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#DEE2E6",
  },
  disabledInput: {
    backgroundColor: "#E9ECEF",
    color: "#6C757D",
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  generateBtn: {
    backgroundColor: "#34C759",
    paddingHorizontal: 20,
    justifyContent: "center",
    borderRadius: 8,
  },
  generateBtnText: {
    color: "#fff",
    fontWeight: "bold",
  },
  helpText: {
    fontSize: 12,
    color: "#666",
    marginTop: 6,
    fontStyle: "italic",
  },
  buildingSection: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    textAlign: "center",
  },
  sectionSubtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 20,
  },
  buildingContainer: {
    alignItems: "center",
    paddingVertical: 10,
  },
  roof: {
    width: "60%",
    height: 0,
    borderLeftWidth: 40,
    borderLeftColor: "transparent",
    borderRightWidth: 40,
    borderRightColor: "transparent",
    borderBottomWidth: 30,
    borderBottomColor: "#495057",
    marginBottom: -2,
  },
  floorBlock: {
    width: "80%",
    backgroundColor: "#fff",
    padding: 15,
    borderWidth: 2,
    borderColor: "#DEE2E6",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: -2,
  },
  floorBlockConfigured: {
    borderColor: "#007AFF",
    backgroundColor: "#F0F7FF",
    zIndex: 1,
  },
  floorMainArea: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  floorNumberText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#495057",
  },
  flatTag: {
    backgroundColor: "#E9ECEF",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  flatTagText: {
    fontSize: 12,
    color: "#666",
    fontWeight: "600",
  },
  viewDetailsBtn: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 10,
  },
  viewDetailsBtnText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  floorActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  deleteFloorBtn: {
    padding: 8,
    backgroundColor: "#FEF2F2",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FEE2E2",
  },
  ground: {
    width: "90%",
    height: 10,
    backgroundColor: "#343A40",
    borderRadius: 5,
    marginTop: 5,
  },
  saveBtn: {
    backgroundColor: "#007AFF",
    margin: 20,
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#007AFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  disabledBtn: {
    opacity: 0.7,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
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
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 5,
  },
  modalSubtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 20,
  },
  modalInput: {
    width: "100%",
    backgroundColor: "#F1F3F5",
    padding: 15,
    borderRadius: 12,
    fontSize: 24,
    textAlign: "center",
    fontWeight: "bold",
    marginBottom: 25,
    borderWidth: 1,
    borderColor: "#DEE2E6",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 15,
  },
  modalBtn: {
    flex: 1,
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelBtn: {
    backgroundColor: "#F1F3F5",
  },
  confirmBtn: {
    backgroundColor: "#007AFF",
  },
  cancelBtnText: {
    color: "#495057",
    fontWeight: "bold",
  },
  confirmBtnText: {
    color: "#fff",
    fontWeight: "bold",
  },
});
