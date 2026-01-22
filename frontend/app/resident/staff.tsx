import { db } from "@/configs/firebaseConfig";
import { COLLECTIONS } from "@/constants/Config";
import { useAuth } from "@/hooks/useAuth";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  doc,
  setDoc,
  deleteDoc,
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
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Toast from "react-native-toast-message";

const STAFF_TYPES = ["Maid", "Driver", "Cook", "Nanny", "Tutor", "Cleaner", "Security", "Other"];

export default function ResidentStaff() {
  const { user } = useAuth();
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);
  const [staffList, setStaffList] = useState<any[]>([]);

  // Form states
  const [staffName, setStaffName] = useState("");
  const [staffType, setStaffType] = useState("Maid");
  const [contact, setContact] = useState("");
  const [nativePlace, setNativePlace] = useState("");

  // Guardian Information
  const [guardianName, setGuardianName] = useState("");
  const [guardianContact, setGuardianContact] = useState("");
  const [guardianAddress, setGuardianAddress] = useState("");

  // Documents (Base64)
  const [photo, setPhoto] = useState<string | null>(null);
  const [idCard, setIdCard] = useState<string | null>(null);
  const [addressProof, setAddressProof] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [otherStaffType, setOtherStaffType] = useState("");

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, `users/${user.uid}/${COLLECTIONS.STAFF}`),
      orderBy("uploadedAt", "desc"),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setStaffList(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });

    return unsubscribe;
  }, [user]);

  const pickImage = async (type: 'photo' | 'idCard' | 'addressProof') => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled) {
      const asset = result.assets[0];

      // 500KB size limit check (~682666 characters in base64)
      if (asset.base64 && asset.base64.length > 682666) {
        Alert.alert("Error", "File size too large. Maximum limit is 500KB.");
        return;
      }

      const base64Image = `data:image/jpeg;base64,${asset.base64}`;
      if (type === 'photo') setPhoto(base64Image);
      else if (type === 'idCard') setIdCard(base64Image);
      else if (type === 'addressProof') setAddressProof(base64Image);
    }
  };

  const handleSubmit = async () => {
    if (!staffName || !contact || !photo) {
      Alert.alert("Error", "Please fill Name, Contact and upload a Photo.");
      return;
    }

    if (!user) return;

    setIsUploading(true);
    try {
      const staffId = editingId || `r_staff_${Date.now()}`;
      const finalStaffType = staffType === "Other" ? otherStaffType : staffType;

      if (staffType === "Other" && !otherStaffType) {
        Alert.alert("Error", "Please specify the staff category.");
        return;
      }

      const staffData = {
        id: staffId,
        staffName,
        staffType: finalStaffType,
        contact,
        nativePlace,
        guardianName,
        guardianContact,
        guardianAddress,
        photo,
        idCard: idCard || "",
        addressProof: addressProof || "",
        uploadedBy: user.uid,
        uploadedAt: new Date().toISOString(),
      };

      const staffPath = `users/${user.uid}/${COLLECTIONS.STAFF}/${staffId}`;
      await setDoc(doc(db, staffPath), staffData);

      Toast.show({
        type: "success",
        text1: editingId ? "Staff Updated" : "Staff Registered",
        text2: `${staffName} has been saved.`,
      });

      resetForm();
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const resetForm = () => {
    setStaffName("");
    setContact("");
    setNativePlace("");
    setGuardianName("");
    setGuardianContact("");
    setGuardianAddress("");
    setPhoto(null);
    setIdCard(null);
    setAddressProof(null);
    setEditingId(null);
    setStaffType("Maid");
    setOtherStaffType("");
  };

  const handleEdit = (staff: any) => {
    setEditingId(staff.id);
    setStaffName(staff.staffName);
    const isOther = !STAFF_TYPES.includes(staff.staffType) && staff.staffType !== "Other";
    setStaffType(isOther ? "Other" : staff.staffType);
    setOtherStaffType(isOther ? staff.staffType : "");

    setContact(staff.contact);
    setNativePlace(staff.nativePlace || "");
    setGuardianName(staff.guardianName || "");
    setGuardianContact(staff.guardianContact || "");
    setGuardianAddress(staff.guardianAddress || "");
    setPhoto(staff.photo || null);
    setIdCard(staff.idCard || null);
    setAddressProof(staff.addressProof || null);
  };

  const handleDelete = async (staffId: string) => {
    if (!user) return;
    Alert.alert("Delete Staff", "Are you sure you want to remove this staff member?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          try {
            await deleteDoc(doc(db, `users/${user.uid}/${COLLECTIONS.STAFF}/${staffId}`));
            Toast.show({ type: "info", text1: "Staff Removed" });
          } catch (error: any) {
            Alert.alert("Error", error.message);
          }
        }
      }
    ]);
  };

  return (
    <View style={styles.mainContainer}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#3B82F6" />
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Manage Personal Staff</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.form}>
          <Text style={styles.sectionTitle}>{editingId ? "Edit Staff Details" : "Register New Staff"}</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Staff Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Maya Devi"
              value={staffName}
              onChangeText={setStaffName}
            />
          </View>

          <View style={[styles.inputGroup, { zIndex: 1000 }]}>
            <Text style={styles.label}>Staff Category</Text>
            <TouchableOpacity
              style={styles.dropdownButton}
              onPress={() => setShowTypeDropdown(!showTypeDropdown)}
            >
              <Text style={styles.dropdownText}>{staffType}</Text>
              <Ionicons name={showTypeDropdown ? "chevron-up" : "chevron-down"} size={20} color="#64748B" />
            </TouchableOpacity>

            {showTypeDropdown && (
              <View style={styles.dropdownListContainer}>
                <ScrollView style={styles.dropdownList} nestedScrollEnabled={true}>
                  {STAFF_TYPES.map((item) => (
                    <TouchableOpacity
                      key={item}
                      style={styles.dropdownItem}
                      onPress={() => {
                        setStaffType(item);
                        setShowTypeDropdown(false);
                      }}
                    >
                      <Text style={[styles.dropdownItemText, staffType === item && styles.activeDropdownText]}>
                        {item}
                      </Text>
                      {staffType === item && <Ionicons name="checkmark" size={18} color="#3B82F6" />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {staffType === "Other" && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Specify Category</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Plumber, Carpenter"
                value={otherStaffType}
                onChangeText={setOtherStaffType}
              />
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Native Place</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Gorakhpur, UP"
              value={nativePlace}
              onChangeText={setNativePlace}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Contact Number</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 9876543210"
              value={contact}
              onChangeText={setContact}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.divider} />

          <Text style={styles.subsectionTitle}>Guardian Details</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Guardian Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Husband/Father Name"
              value={guardianName}
              onChangeText={setGuardianName}
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>Guardian Contact</Text>
              <TextInput
                style={styles.input}
                placeholder="98765..."
                value={guardianContact}
                onChangeText={setGuardianContact}
                keyboardType="phone-pad"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Guardian Address</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              placeholder="Complete address of the guardian"
              value={guardianAddress}
              onChangeText={setGuardianAddress}
              multiline
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.uploadSection}>
            <Text style={styles.label}>Required Documents of staff (Max 500KB)</Text>
            <View style={styles.uploadRow}>
              <TouchableOpacity style={styles.uploadBox} onPress={() => pickImage('photo')}>
                {photo ? (
                  <Image source={{ uri: photo }} style={styles.previewImage} />
                ) : (
                  <View style={styles.uploadPlaceholder}>
                    <Text style={styles.uploadIcon}>👤</Text>
                    <Text style={styles.uploadLabel}>Photo</Text>
                  </View>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.uploadBox} onPress={() => pickImage('idCard')}>
                {idCard ? (
                  <Image source={{ uri: idCard }} style={styles.previewImage} />
                ) : (
                  <View style={styles.uploadPlaceholder}>
                    <Text style={styles.uploadIcon}>💳</Text>
                    <Text style={styles.uploadLabel}> Photo ID Card</Text>
                  </View>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.uploadBox} onPress={() => pickImage('addressProof')}>
                {addressProof ? (
                  <Image source={{ uri: addressProof }} style={styles.previewImage} />
                ) : (
                  <View style={styles.uploadPlaceholder}>
                    <Text style={styles.uploadIcon}>🏠</Text>
                    <Text style={styles.uploadLabel}> Address Proof</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.formButtons}>
            <TouchableOpacity
              style={[styles.submitBtn, isUploading && styles.disabledBtn]}
              onPress={handleSubmit}
              disabled={isUploading}
            >
              {isUploading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.submitText}>{editingId ? "Update Staff" : "Register Staff"}</Text>
              )}
            </TouchableOpacity>

            {editingId && (
              <TouchableOpacity style={styles.cancelBtn} onPress={resetForm}>
                <Text style={styles.cancelText}>Cancel Edit</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <Text style={styles.sectionTitle}>Registered Household Staff</Text>
        {staffList.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={48} color="#CBD5E1" />
            <Text style={styles.emptyText}>No staff registered for your home yet.</Text>
          </View>
        ) : (
          staffList.map((staff) => (
            <View key={staff.id} style={styles.card}>
              <View style={styles.cardMain}>
                {staff.photo ? (
                  <Image source={{ uri: staff.photo }} style={styles.listAvatar} />
                ) : (
                  <View style={styles.listAvatarPlaceholder}>
                    <Text style={styles.avatarText}>{staff.staffName.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.staffInfo}>
                  <View style={styles.staffHeader}>
                    <Text style={styles.staffName}>{staff.staffName}</Text>
                    <View style={styles.typeBadge}>
                      <Text style={styles.typeBadgeText}>{staff.staffType}</Text>
                    </View>
                  </View>
                  <Text style={styles.staffContact}>📞 {staff.contact}</Text>
                  <Text style={styles.staffNative}>📍 {staff.nativePlace || "N/A"}</Text>
                  {staff.guardianName && (
                    <Text style={styles.staffGuardian}>G: {staff.guardianName}</Text>
                  )}
                </View>
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity onPress={() => handleEdit(staff)} style={styles.editBtn}>
                  <Ionicons name="create-outline" size={20} color="#3B82F6" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(staff.id)} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={20} color="#EF4444" />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 16,
  },
  backBtnText: {
    color: "#3B82F6",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 16,
    marginTop: 8,
  },
  subsectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#334155",
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  form: {
    backgroundColor: "#FFFFFF",
    padding: 20,
    borderRadius: 24,
    marginBottom: 30,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748B",
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
    color: "#0F172A",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  dropdownButton: {
    backgroundColor: "#F8FAFC",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dropdownText: {
    fontSize: 15,
    color: "#0F172A",
    fontWeight: "600",
  },
  dropdownListContainer: {
    position: "absolute",
    top: 80,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    maxHeight: 250,
    zIndex: 2000,
    elevation: 8,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
  },
  dropdownList: {
    padding: 8,
  },
  dropdownItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    borderRadius: 10,
  },
  dropdownItemText: {
    fontSize: 15,
    color: "#64748B",
    fontWeight: "500",
  },
  activeDropdownText: {
    color: "#3B82F6",
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  divider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginVertical: 20,
  },
  uploadSection: {
    marginBottom: 20,
  },
  uploadRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  uploadBox: {
    flex: 1,
    height: 90,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#CBD5E1',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadPlaceholder: {
    alignItems: 'center',
  },
  uploadIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  uploadLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  formButtons: {
    marginTop: 10,
    gap: 10,
  },
  submitBtn: {
    backgroundColor: "#3B82F6",
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  submitText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 16,
  },
  cancelBtn: {
    alignItems: "center",
    padding: 10,
  },
  cancelText: {
    color: "#64748B",
    fontWeight: "600",
  },
  disabledBtn: {
    opacity: 0.6,
  },
  card: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 20,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  cardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  listAvatar: {
    width: 50,
    height: 50,
    borderRadius: 15,
    backgroundColor: '#F1F5F9',
  },
  listAvatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 15,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#64748B',
  },
  staffInfo: {
    flex: 1,
  },
  staffHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  staffName: {
    fontWeight: "800",
    fontSize: 15,
    color: "#0F172A",
  },
  typeBadge: {
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeBadgeText: {
    color: "#3B82F6",
    fontSize: 10,
    fontWeight: "800",
    textTransform: 'uppercase',
  },
  staffContact: {
    color: "#64748B",
    fontSize: 13,
  },
  staffNative: {
    color: "#3B82F6",
    fontSize: 12,
    marginTop: 2,
    fontWeight: "600",
  },
  staffGuardian: {
    color: "#94A3B8",
    fontSize: 11,
    marginTop: 2,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editBtn: {
    padding: 8,
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
  },
  deleteBtn: {
    padding: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#E2E8F0',
  },
  emptyText: {
    marginTop: 12,
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
  },
});
