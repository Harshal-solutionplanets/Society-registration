import { appId, db } from "@/configs/firebaseConfig";
import { useAuth } from "@/hooks/useAuth";
import { useLocalSearchParams, useRouter } from "expo-router";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
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
  status: "VACANT" | "OCCUPIED";
  ownership?: "SELF_OWNED" | "RENTAL";
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
        status: "VACANT",
        ownership: "SELF_OWNED",
        familyMembers: "",
        staffMembers: "",
      });
    }

    return generatedFlats;
  });

  const [selectedFlat, setSelectedFlat] = useState<FlatData | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Edit modal states
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingFlat, setEditingFlat] = useState<FlatData | null>(null);
  const [editUnitName, setEditUnitName] = useState("");
  const [editResidenceType, setEditResidenceType] = useState("");
  const [editResidentName, setEditResidentName] = useState("");
  const [editResidentMobile, setEditResidentMobile] = useState("");
  const [editStatus, setEditStatus] = useState<"VACANT" | "OCCUPIED">("VACANT");
  const [editOwnership, setEditOwnership] = useState<"SELF_OWNED" | "RENTAL">(
    "SELF_OWNED",
  );
  const [editFamilyMembers, setEditFamilyMembers] = useState("");
  const [editStaffMembers, setEditStaffMembers] = useState("");
  const [showResidenceDropdown, setShowResidenceDropdown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [floorFolderId, setFloorFolderId] = useState<string | null>(null);
  const [societyName, setSocietyName] = useState("");
  const [actualFloorName, setActualFloorName] = useState<string | null>(
    (floorName as string) || null,
  );

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchFlats(),
        fetchFloorFolderId(),
        fetchSocietyName(),
      ]);
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
        doc(db, `artifacts/${appId}/public/data/societies`, user.uid),
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
      const wingPath = `artifacts/${appId}/public/data/societies/${user.uid}/wings/${wingId}`;
      const wingDoc = await getDoc(doc(db, wingPath));
      if (wingDoc.exists()) {
        const data = wingDoc.data();
        const floor = data.floors?.find(
          (f: any) => f.floorNumber === parseInt(floorNumber as string),
        );
        if (floor?.driveFolderId) {
          setFloorFolderId(floor.driveFolderId);
        }
        // Set actual floor name from wing data
        if (floor?.floorName) {
          setActualFloorName(floor.floorName);
        }
      }
    } catch (error) {
      console.error("Error fetching floor folder ID:", error);
    }
  };

  const fetchFlats = async () => {
    if (!user) return;
    try {
      const societyPath = `artifacts/${appId}/public/data/societies/${user.uid}/wings/${wingId}/${floorNumber}`;
      const querySnapshot = await getDocs(collection(db, societyPath));

      const dbFlatsMap: Record<number, any> = {};
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // Extract flat number from ID (e.g., WINGA-1-101 -> 101)
        const parts = data.id.split("-");
        const flatNum = parseInt(parts[parts.length - 1]);
        if (!isNaN(flatNum)) {
          dbFlatsMap[flatNum] = data;
        }
      });

      setFlats((prev) =>
        prev.map((flat) => {
          const dbFlat = dbFlatsMap[flat.flatNumber];
          if (dbFlat) {
            return {
              ...flat,
              unitName: dbFlat.unitName || flat.unitName,
              residenceType: dbFlat.residenceType || flat.residenceType,
              residentName: dbFlat.residentName || "",
              residentMobile: dbFlat.residentMobile || "",
              alternateMobile: dbFlat.alternateMobile || "",
              status: dbFlat.residenceStatus || dbFlat.status || "VACANT",
              ownership: dbFlat.ownership || "SELF_OWNED",
              familyMembers: dbFlat.familyMembers?.toString() || "",
              staffMembers: dbFlat.staffMembers?.toString() || "",
              hasCredentials: !!(dbFlat.username || dbFlat.residentUsername),
              username: dbFlat.username || dbFlat.residentUsername,
              password: dbFlat.password || dbFlat.residentPassword,
              driveFolderId: dbFlat.driveFolderId || "",
            };
          }
          return flat;
        }),
      );
    } catch (error) {
      console.error("Error fetching flats:", error);
    } finally {
      setLoading(false);
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

  const handleViewCredentials = (flat: FlatData) => {
    setSelectedFlat(flat);
    setModalVisible(true);
  };

  const handleCopyCredentials = () => {
    if (!selectedFlat) return;

    const credentialsText = `Hello, I am the Admin of ${societyName}. Here are the login credentials for your unit ${selectedFlat.unitName} of floor number ${floorNumber} of ${wingName} :\n\nUsername: ${selectedFlat.username}\nPassword: ${selectedFlat.password}`;

    Clipboard.setString(credentialsText);

    Toast.show({
      type: "success",
      text1: "Copied!",
      text2: "Credentials copied to clipboard",
    });
  };

  const handleEditFlat = (flat: FlatData) => {
    setEditingFlat(flat);
    setEditUnitName(flat.unitName);
    setEditResidenceType(flat.residenceType);
    setEditResidentName(flat.residentName);
    setEditResidentMobile(flat.residentMobile);
    setEditStatus(flat.status);
    setEditOwnership(flat.ownership || "SELF_OWNED");
    setEditFamilyMembers(flat.familyMembers);
    setEditStaffMembers(flat.staffMembers || "");
    setEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!editingFlat || !user) return;

    // Update local state
    setFlats((prev) =>
      prev.map((flat) =>
        flat.flatNumber === editingFlat.flatNumber
          ? {
              ...flat,
              unitName: editUnitName,
              residenceType: editResidenceType,
              residentName: editResidentName,
              residentMobile: editResidentMobile,
              status: editStatus,
              ownership: editOwnership,
              familyMembers: editFamilyMembers,
              staffMembers: editStaffMembers,
            }
          : flat,
      ),
    );

    // Update Firestore
    try {
      // Use wingId directly to ensure consistency with the preferred format (e.g. WING_A)
      const wingPrefix = (wingId as string).replace(/\s+/g, "_").toUpperCase();
      const floor = parseInt(floorNumber as string);
      const unitId = `${wingPrefix}-${floor}-${editingFlat.flatNumber}`;

      const updatePayload = {
        unitName: editUnitName,
        displayName: `${wingName} - ${editUnitName}`,
        residenceType: editResidenceType,
        residentName: editResidentName,
        residentMobile: editResidentMobile,
        residenceStatus: editStatus,
        status: editStatus, // Sync both status fields
        ownership: editOwnership,
        familyMembers: parseInt(editFamilyMembers || "0"),
        staffMembers: parseInt(editStaffMembers || "0"),
        societyName: societyName,
        wingName: wingName,
        username: editingFlat.username, // Preserve credentials
        password: editingFlat.password,
        driveFolderId: editingFlat.driveFolderId || "",
        updatedAt: new Date().toISOString(),
      };

      // Update both locations (using unitId as stable doc ID)
      const societyPath = `artifacts/${appId}/public/data/societies/${user.uid}/wings/${wingId}/${floorNumber}/${unitId}`;
      const residentPath = `artifacts/${appId}/public/data/societies/${user.uid}/Residents/${unitId}`;

      await setDoc(doc(db, societyPath), updatePayload, { merge: true });
      await setDoc(doc(db, residentPath), updatePayload, { merge: true });

      Toast.show({
        type: "success",
        text1: "Updated",
        text2: "Unit details updated successfully",
      });
    } catch (error) {
      console.error("Error updating unit:", error);
      Alert.alert("Error", "Failed to update unit details");
    }

    setEditModalVisible(false);
    setEditingFlat(null);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>
          {wingName} - {actualFloorName || `Floor ${floorNumber}`}
        </Text>
        <Text style={styles.subtitle}>{flatCount} Flats</Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading flats...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          <View style={styles.flatsGrid}>
            {flats.map((flat) => (
              <View key={flat.flatNumber} style={styles.flatPanel}>
                <View style={styles.flatHeader}>
                  <Text style={styles.flatNumber}>{flat.unitName}</Text>
                  <View style={styles.headerRight}>
                    <TouchableOpacity
                      style={styles.editIconBtn}
                      onPress={() => handleEditFlat(flat)}
                    >
                      <Text style={styles.editIcon}>✏️</Text>
                    </TouchableOpacity>
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
                      flat.status === "OCCUPIED"
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
                  {flat.familyMembers ? (
                    <Text style={styles.familyMini}>
                      👨‍👩‍👧‍👦 {flat.familyMembers} members
                    </Text>
                  ) : null}
                  {flat.staffMembers ? (
                    <Text style={styles.familyMini}>
                      👮 {flat.staffMembers} staff
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
                    <TouchableOpacity
                      style={styles.viewBtn}
                      onPress={() => handleViewCredentials(flat)}
                    >
                      <Text style={styles.viewBtnText}>View Details</Text>
                    </TouchableOpacity>
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
            ))}
          </View>
        </ScrollView>
      )}

      {/* Credentials Modal */}
      <Modal
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
                        color:
                          selectedFlat.status === "OCCUPIED"
                            ? "#34C759"
                            : "#FF9500",
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
      </Modal>

      {/* Edit Flat Modal */}
      <Modal
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
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Residence Status</Text>
                <View style={styles.statusToggleRow}>
                  <TouchableOpacity
                    style={[
                      styles.statusToggleBtn,
                      editStatus === "VACANT" && styles.statusToggleBtnActive,
                    ]}
                    onPress={() => setEditStatus("VACANT")}
                  >
                    <Text
                      style={[
                        styles.statusToggleText,
                        editStatus === "VACANT" &&
                          styles.statusToggleTextActive,
                      ]}
                    >
                      Vacant
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.statusToggleBtn,
                      editStatus === "OCCUPIED" && styles.statusToggleBtnActive,
                    ]}
                    onPress={() => setEditStatus("OCCUPIED")}
                  >
                    <Text
                      style={[
                        styles.statusToggleText,
                        editStatus === "OCCUPIED" &&
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
                    onPress={() => setEditOwnership("SELF_OWNED")}
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

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Number of Family Members</Text>
                <View
                  style={[styles.formInput, { backgroundColor: "#E9ECEF" }]}
                >
                  <Text style={{ color: "#6C757D", fontSize: 16 }}>
                    {editFamilyMembers || "Not set by resident"}
                  </Text>
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Number of Staff Members</Text>
                <View
                  style={[styles.formInput, { backgroundColor: "#E9ECEF" }]}
                >
                  <Text style={{ color: "#6C757D", fontSize: 16 }}>
                    {editStaffMembers || "Not set by resident"}
                  </Text>
                </View>
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
      </Modal>
    </View>
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
    backgroundColor: "#F0F2F5",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: "#666",
    fontWeight: "500",
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
  subtitle: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  flatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 10,
  },
  flatPanel: {
    width: "47%",
    backgroundColor: "#fff",
    margin: "1.5%",
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
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
    backgroundColor: "#F8F9FA",
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
    color: "#007AFF",
    fontWeight: "600",
  },
  residentInfoMini: {
    marginBottom: 10,
    padding: 8,
    backgroundColor: "#F0F7FF",
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#007AFF",
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
    backgroundColor: "#FFE5B4",
  },
  statusGenerated: {
    backgroundColor: "#D1F2EB",
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
    backgroundColor: "#007AFF",
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
    backgroundColor: "#34C759",
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  viewBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  disabledBtn: {
    opacity: 0.6,
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
    backgroundColor: "#F8F9FA",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DEE2E6",
  },
  modalButtons: {
    gap: 12,
  },
  copyBtn: {
    backgroundColor: "#34C759",
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
    backgroundColor: "#F1F3F5",
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  closeBtnText: {
    color: "#495057",
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
    backgroundColor: "#F8F9FA",
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#DEE2E6",
  },
  dropdownButton: {
    backgroundColor: "#F8F9FA",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DEE2E6",
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
    borderColor: "#DEE2E6",
    marginTop: 5,
    maxHeight: 200,
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F3F5",
  },
  dropdownItemSelected: {
    backgroundColor: "#E7F3FF",
  },
  dropdownItemText: {
    fontSize: 14,
    color: "#333",
  },
  dropdownItemTextSelected: {
    color: "#007AFF",
    fontWeight: "600",
  },
  statusIndicator: {
    marginLeft: "auto",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusOccupied: {
    backgroundColor: "#34C75920",
    borderWidth: 1,
    borderColor: "#34C759",
  },
  statusVacant: {
    backgroundColor: "#FF950020",
    borderWidth: 1,
    borderColor: "#FF9500",
  },
  statusIndicatorText: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#333",
  },
  familyMini: {
    fontSize: 11,
    color: "#007AFF",
    marginTop: 4,
    fontWeight: "500",
  },
  statusToggleRow: {
    flexDirection: "row",
    gap: 10,
  },
  statusToggleBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DEE2E6",
    alignItems: "center",
    backgroundColor: "#F8F9FA",
  },
  statusToggleBtnActive: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
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
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  selfOwnedBadge: {
    backgroundColor: "#DBEAFE",
    borderWidth: 1,
    borderColor: "#3B82F6",
  },
  ownershipText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#374151",
  },
  noCredsContainer: {
    padding: 12,
    backgroundColor: "#F8F9FA",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E9ECEF",
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
});
