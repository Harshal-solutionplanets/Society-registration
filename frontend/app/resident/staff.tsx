import { appId, db } from "@/configs/firebaseConfig";
import { COLLECTIONS } from "@/constants/Config";
import { useAuth } from "@/hooks/useAuth";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { useRouter } from "expo-router";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
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

const STAFF_TYPES = [
  "Maid",
  "Housekeeper",
  "Driver",
  "Cook",
  "Shop Staff",
  "Nanny",
  "Tutor",
  "Cleaner",
  "Employee",
  "Office Staff",
  "Security",
  "Other",
];

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
  const [sessionData, setSessionData] = useState<any>(null);
  const [formErrors, setFormErrors] = useState({
    contact: "",
    guardianContact: "",
  });

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
    setFormErrors({ contact: "", guardianContact: "" });
  };
  // Drive helpers
  const findOrCreateFolder = async (
    name: string,
    parentId: string,
    token: string,
  ) => {
    try {
      const q = `mimeType='application/vnd.google-apps.folder' and name='${name}' and '${parentId}' in parents and trashed=false`;
      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!searchRes.ok) throw new Error("Drive Search Failed");
      const searchData = await searchRes.json();
      if (searchData.files && searchData.files.length > 0)
        return searchData.files[0].id;

      const createRes = await fetch(
        "https://www.googleapis.com/drive/v3/files",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            mimeType: "application/vnd.google-apps.folder",
            parents: [parentId],
          }),
        },
      );
      if (!createRes.ok) throw new Error("Drive Create Failed");
      const createData = await createRes.json();
      return createData.id;
    } catch (error) {
      console.error("findOrCreateFolder error", error);
      throw error;
    }
  };

  const uploadImageToDrive = async (
    base64String: string,
    fileName: string,
    parentFolderId: string,
  ) => {
    try {
      const { adminUID } = sessionData;
      const backendUrl =
        process.env.EXPO_PUBLIC_BACKEND_URL || "http://localhost:3001";

      const res = await fetch(`${backendUrl}/api/drive/upload-resident-staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminUID,
          parentFolderId,
          staffFolderId: staffList.find((s) => s.id === editingId)
            ?.driveFolderId,
          staffName, // Used by backend for search or rename
          fileName,
          base64Data: base64String,
          appId,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Backend Upload Failed");
      }

      const data = await res.json();
      return data.staffFolderId; // Return the folder ID for metadata storage
    } catch (error) {
      console.error("Backend Drive Upload Error:", error);
      throw error;
    }
  };

  const deleteResFile = async (
    fileName: string,
    flatFolderId: string,
    staffFolderId: string | undefined, // Need specific staff folder if possible
  ) => {
    try {
      if (!staffFolderId) return; // Can't delete without folder ID
      const { adminUID, id: unitId } = sessionData;
      const backendUrl =
        process.env.EXPO_PUBLIC_BACKEND_URL || "http://localhost:3001";

      await fetch(`${backendUrl}/api/drive/delete-resident-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminUID,
          appId,
          staffFolderId,
          fileName,
        }),
      });
    } catch (error) {
      console.warn("Delete file error:", error);
    }
  };

  useEffect(() => {
    const loadSession = async () => {
      try {
        const session = await AsyncStorage.getItem("resident_session");
        if (session) {
          setSessionData(JSON.parse(session));
        }
      } catch (err) {
        console.warn("AsyncStorage load failed:", err);
      }
    };
    loadSession();
  }, []);

  useEffect(() => {
    if (!user || !sessionData) return;

    // Fetch from the society location as requested
    const { adminUID, id: unitId } = sessionData;
    const q = query(
      collection(
        db,
        `artifacts/${appId}/public/data/societies/${adminUID}/Residents/${unitId}/StaffMembers`,
      ),
      orderBy("uploadedAt", "desc"),
    );

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const staff = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setStaffList(staff);

        // SYNC: Update staffMembers count in Unit document & Session
        try {
          const count = staff.length;

          // Only sync if count actually changed to avoid loops/excessive writes
          if (sessionData && sessionData.staffMembers !== count) {
            // 1. Update Unit record in society path
            const societyUnitPath = `artifacts/${appId}/public/data/societies/${adminUID}/Residents/${unitId}`;
            await updateDoc(doc(db, societyUnitPath), { staffMembers: count });

            // 2. Update Wing specific record
            const wingId = sessionData.wingId;
            const floorNumber = sessionData.floorNumber;
            if (wingId && floorNumber !== undefined) {
              const wingUnitPath = `artifacts/${appId}/public/data/societies/${adminUID}/wings/${wingId}/${floorNumber}/${unitId}`;
              await updateDoc(doc(db, wingUnitPath), {
                staffMembers: count,
              });
            }

            // 3. Update Session / AsyncStorage
            const updatedSession = { ...sessionData, staffMembers: count };
            setSessionData(updatedSession);
            await AsyncStorage.setItem(
              "resident_session",
              JSON.stringify(updatedSession),
            );
          }
        } catch (syncErr) {
          console.warn("Sync staff count failed:", syncErr);
        }
      },
      (error) => {
        console.warn(
          "Error fetching society staff records (Check Firestore Rules):",
          error,
        );
      },
    );

    return unsubscribe;
  }, [user, sessionData?.adminUID, sessionData?.id]);

  const handleDocumentChange = async (
    type: "photo" | "idCard" | "addressProof",
    action: "pick" | "delete",
  ) => {
    let newValue = null;

    if (action === "pick") {
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: ["image/*", "application/pdf"],
          copyToCacheDirectory: true,
        });

        if (!result.canceled) {
          const asset = result.assets[0];

          // Size Check (220KB = 225280 bytes)
          if (asset.size && asset.size > 225280) {
            Alert.alert(
              "Error",
              "File size too large. Maximum limit is 220KB.",
            );
            return;
          }

          let base64String = "";
          if (Platform.OS === "web") {
            const response = await fetch(asset.uri);
            const blob = await response.blob();
            base64String = (await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            })) as string;
          } else {
            const base64 = await FileSystem.readAsStringAsync(asset.uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            base64String = `data:${asset.mimeType || "image/jpeg"};base64,${base64}`;
          }
          newValue = base64String;
        } else {
          return;
        }
      } catch (err) {
        console.warn("Picker Error:", err);
        return;
      }
    }

    // Update state immediately
    if (type === "photo") setPhoto(newValue);
    else if (type === "idCard") setIdCard(newValue);
    else if (type === "addressProof") setAddressProof(newValue);

    // If we are editing an existing record, sync "turant" (immediately)
    if (editingId && sessionData && user) {
      const { adminUID, id: unitId, driveFolderId: flatFolderId } = sessionData;
      // Determine file extension based on content type
      const isPdf = newValue?.startsWith("data:application/pdf");
      const ext = isPdf ? ".pdf" : ".jpg";
      const fileName =
        type === "photo"
          ? `Photo${ext}`
          : type === "idCard"
            ? `ID_Card${ext}`
            : `Address_Proof${ext}`;

      try {
        // 1. Update Firestore (Society & Local)
        const updateObj = {
          [type]: newValue || "",
          updatedAt: new Date().toISOString(),
        };

        const societyPath = `artifacts/${appId}/public/data/societies/${adminUID}/Residents/${unitId}/StaffMembers/${editingId}`;
        const localPath = `users/${user.uid}/${COLLECTIONS.STAFF}/${editingId}`;

        await setDoc(doc(db, societyPath), updateObj, { merge: true });
        await setDoc(doc(db, localPath), updateObj, { merge: true });

        // 2. Drive Update (if photo picked or deleted)
        if (flatFolderId) {
          const baseName =
            type === "photo"
              ? "Photo"
              : type === "idCard"
                ? "ID_Card"
                : "Address_Proof";
          const staffFolderId = staffList.find(
            (s) => s.id === editingId,
          )?.driveFolderId;

          // Exhaustive Cleanup: Clear ALL extensions (via backend)
          await deleteResFile(`${baseName}.jpg`, flatFolderId, staffFolderId);
          await deleteResFile(`${baseName}.pdf`, flatFolderId, staffFolderId);
          await deleteResFile(`${baseName}.png`, flatFolderId, staffFolderId);
          await deleteResFile(`${baseName}.jpeg`, flatFolderId, staffFolderId);

          if (newValue) {
            // Upload new file (original form)
            await uploadImageToDrive(newValue, fileName, flatFolderId);
          }
        }

        Toast.show({
          type: "success",
          text1: "Auto-synced",
          text2: `${type} updated in cloud.`,
        });
      } catch (err: any) {
        console.error("Immediate sync failed:", err);
      }
    }
  };

  const handleContactChange = (val: string) => {
    const sanitized = val.replace(/[^0-9]/g, "");
    if (sanitized.length > 10) return;
    setContact(sanitized);
    if (sanitized.length > 0 && sanitized.length < 10) {
      setFormErrors((prev) => ({
        ...prev,
        contact: "Contact must be 10 digits",
      }));
    } else {
      setFormErrors((prev) => ({ ...prev, contact: "" }));
    }
  };

  const handleGuardianContactChange = (val: string) => {
    const sanitized = val.replace(/[^0-9]/g, "");
    if (sanitized.length > 10) return;
    setGuardianContact(sanitized);
    if (sanitized.length > 0 && sanitized.length < 10) {
      setFormErrors((prev) => ({
        ...prev,
        guardianContact: "Contact must be 10 digits",
      }));
    } else {
      setFormErrors((prev) => ({ ...prev, guardianContact: "" }));
    }
  };

  const handleSubmit = async () => {
    if (!staffName || !contact || !staffType) {
      Toast.show({
        type: "error",
        text1: "Required Fields",
        text2: "Staff Name, Type and Contact are mandatory.",
      });
      return;
    }

    // Validation check
    if (contact.length !== 10) {
      setFormErrors((prev) => ({
        ...prev,
        contact: "Contact must be 10 digits",
      }));
      return;
    }
    if (guardianContact && guardianContact.length !== 10) {
      setFormErrors((prev) => ({
        ...prev,
        guardianContact: "Contact must be 10 digits",
      }));
      return;
    }

    if (!user || !sessionData) return;

    setIsUploading(true);
    try {
      const { adminUID, id: unitId, driveFolderId: flatFolderId } = sessionData;
      const staffId = editingId || `r_staff_${Date.now()}`;
      const finalStaffType = staffType === "Other" ? otherStaffType : staffType;

      if (staffType === "Other" && !otherStaffType) {
        Alert.alert("Error", "Please specify the staff category.");
        setIsUploading(false);
        return;
      }

      // DRIVE STORAGE LOGIC (via Backend)
      let staffFolderId = "";

      // If editing, get existing ID
      if (editingId) {
        const existing = staffList.find((s) => s.id === editingId);
        if (existing?.driveFolderId) staffFolderId = existing.driveFolderId;
      }

      if (flatFolderId) {
        try {
          const existingMember = editingId
            ? staffList.find((s) => s.id === editingId)
            : null;

          const handleResDocOp = async (
            currentBase64: string | null,
            originalValue: string | null | undefined,
            docType: "photo" | "idCard" | "addressProof",
          ) => {
            // Determine correct file extension based on content type
            const isPdf = currentBase64?.startsWith("data:application/pdf");
            const ext = isPdf ? ".pdf" : ".jpg";
            const fileName =
              docType === "photo"
                ? `Photo${ext}`
                : docType === "idCard"
                  ? `ID_Card${ext}`
                  : `Address_Proof${ext}`;

            const baseFileName =
              docType === "photo"
                ? "Photo"
                : docType === "idCard"
                  ? "ID_Card"
                  : "Address_Proof";

            // Exhaustive Cleanup: Delete ALL potential extensions before upload/removal
            await deleteResFile(
              `${baseFileName}.jpg`,
              flatFolderId,
              staffFolderId,
            ).catch(() => {});
            await deleteResFile(
              `${baseFileName}.pdf`,
              flatFolderId,
              staffFolderId,
            ).catch(() => {});
            await deleteResFile(
              `${baseFileName}.png`,
              flatFolderId,
              staffFolderId,
            ).catch(() => {});
            await deleteResFile(
              `${baseFileName}.jpeg`,
              flatFolderId,
              staffFolderId,
            ).catch(() => {});

            // 1. If we have a document (original form), upload it
            if (
              currentBase64 &&
              (currentBase64.startsWith("data:image") ||
                currentBase64.startsWith("data:application/pdf"))
            ) {
              const fid = await uploadImageToDrive(
                currentBase64,
                fileName,
                flatFolderId,
              );
              if (!staffFolderId) staffFolderId = fid; // Capture created folder ID
            }
          };

          await handleResDocOp(photo, existingMember?.photo, "photo");
          await handleResDocOp(idCard, existingMember?.idCard, "idCard");
          await handleResDocOp(
            addressProof,
            existingMember?.addressProof,
            "addressProof",
          );

          console.log(
            "DEBUG: Drive sync complete via backend. Folder:",
            staffFolderId,
          );
        } catch (driveErr: any) {
          console.warn("Drive sync failed:", driveErr.message);
          // Don't block Firestore save if Drive fails, but notify user
          Alert.alert(
            "Sync Notice",
            `Documents saved locally. Drive sync failed: ${driveErr.message}`,
          );
        }
      } else {
        console.warn(
          "No Flat Folder ID present in session. Check admin configuration.",
        );
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
        adminUID,
        unitId,
        driveFolderId: staffFolderId,
        uploadedAt: new Date().toISOString(),
      };

      // 1. Store in Society collection (Requested location)
      const societyStaffPath = `artifacts/${appId}/public/data/societies/${adminUID}/Residents/${unitId}/StaffMembers/${staffId}`;
      await setDoc(doc(db, societyStaffPath), staffData, { merge: true });

      // 2. Keep local copy for user (Optional, maintained for redundancy)
      const localStaffPath = `users/${user.uid}/${COLLECTIONS.STAFF}/${staffId}`;
      await setDoc(doc(db, localStaffPath), staffData, { merge: true });

      Toast.show({
        type: "success",
        text1: editingId ? "Staff Updated" : "Staff Registered",
        text2: `${staffName} has been saved to society records.`,
      });
      if (!editingId) resetForm();
    } catch (error: any) {
      console.error("Submit Error:", error);
      Alert.alert("Error", error.message);
    } finally {
      setIsUploading(false);
    }
    resetForm();
  };

  const handleEdit = (staff: any) => {
    setEditingId(staff.id);
    setStaffName(staff.staffName);
    const isOther =
      !STAFF_TYPES.includes(staff.staffType) && staff.staffType !== "Other";
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
    if (!user || !sessionData) return;

    const confirmMessage = "Are you sure you want to remove this staff member?";
    const confirmDelete =
      Platform.OS === "web"
        ? window.confirm(confirmMessage)
        : await new Promise<boolean>((resolve) => {
            Alert.alert("Delete Staff", confirmMessage, [
              {
                text: "Cancel",
                style: "cancel",
                onPress: () => resolve(false),
              },
              {
                text: "Delete",
                style: "destructive",
                onPress: () => resolve(true),
              },
            ]);
          });

    if (!confirmDelete) return;

    setIsUploading(true);
    try {
      const { adminUID, id: unitId, driveFolderId: flatFolderId } = sessionData;
      const member = staffList.find((s) => s.id === staffId);

      if (!member) throw new Error("Staff member not found locally.");

      // If we are deleting the item currently being edited, reset the form
      if (editingId === staffId) {
        resetForm();
      }

      // Archive via Backend (Handles both Drive AND Firestore to bypass local permission rules)
      const backendUrl =
        process.env.EXPO_PUBLIC_BACKEND_URL || "http://localhost:3001";
      const res = await fetch(
        `${backendUrl}/api/drive/archive-resident-staff`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            adminUID,
            parentFolderId: flatFolderId,
            staffFolderId: member.driveFolderId || "", // If empty, drive part will skip in backend
            appId,
            unitId,
            staffId: member.id,
          }),
        },
      );

      if (!res.ok) {
        let errorMsg = "Backend archiving failed";
        try {
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const errorData = await res.json();
            errorMsg = errorData.error || errorMsg;
          } else {
            const text = await res.text();
            console.error("Backend returned non-JSON error:", text);
            errorMsg = `Server error (Status ${res.status}). Please ensure backend is running and updated.`;
          }
        } catch (e) {
          errorMsg = `Request failed with status ${res.status}`;
        }
        throw new Error(errorMsg);
      }

      // Also delete from local personal user records if exists (this might still need permission check)
      try {
        await deleteDoc(
          doc(db, `users/${user.uid}/${COLLECTIONS.STAFF}/${staffId}`),
        );
      } catch (e) {
        console.log("Local record delete failed or not found (non-critical)");
      }

      Toast.show({ type: "info", text1: "Staff Archived Successfully" });
    } catch (error: any) {
      console.error("Delete Error:", error);
      Alert.alert("Deletion Failed", error.message);
    } finally {
      setIsUploading(false);
    }
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
          <Text style={styles.sectionTitle}>
            {editingId ? "Edit Staff Details" : "Register New Staff"}
          </Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Staff Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Maya Devi"
              value={staffName}
              onChangeText={setStaffName}
            />
          </View>

          <View style={[styles.inputGroup, { zIndex: 1000 }]}>
            <Text style={styles.label}>Staff Category *</Text>
            <TouchableOpacity
              style={styles.dropdownButton}
              onPress={() => setShowTypeDropdown(!showTypeDropdown)}
            >
              <Text style={styles.dropdownText}>{staffType}</Text>
              <Ionicons
                name={showTypeDropdown ? "chevron-up" : "chevron-down"}
                size={20}
                color="#64748B"
              />
            </TouchableOpacity>

            {showTypeDropdown && (
              <View style={styles.dropdownListContainer}>
                <ScrollView
                  style={styles.dropdownList}
                  nestedScrollEnabled={true}
                >
                  {STAFF_TYPES.map((item) => (
                    <TouchableOpacity
                      key={item}
                      style={styles.dropdownItem}
                      onPress={() => {
                        setStaffType(item);
                        setShowTypeDropdown(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.dropdownItemText,
                          staffType === item && styles.activeDropdownText,
                        ]}
                      >
                        {item}
                      </Text>
                      {staffType === item && (
                        <Ionicons name="checkmark" size={18} color="#3B82F6" />
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {staffType === "Other" && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Specify Category *</Text>
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
            <Text style={styles.label}>Contact Number *</Text>
            <TextInput
              style={[
                styles.input,
                formErrors.contact ? styles.inputError : null,
              ]}
              placeholder="e.g. 9876543210"
              value={contact}
              onChangeText={handleContactChange}
              keyboardType="phone-pad"
              maxLength={10}
            />
            {formErrors.contact ? (
              <Text style={styles.errorText}>{formErrors.contact}</Text>
            ) : null}
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
                style={[
                  styles.input,
                  formErrors.guardianContact ? styles.inputError : null,
                ]}
                placeholder="98765..."
                value={guardianContact}
                onChangeText={handleGuardianContactChange}
                keyboardType="phone-pad"
                maxLength={10}
              />
              {formErrors.guardianContact ? (
                <Text style={styles.errorText}>
                  {formErrors.guardianContact}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Guardian Address</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: "top" }]}
              placeholder="Complete address of the guardian"
              value={guardianAddress}
              onChangeText={setGuardianAddress}
              multiline
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.uploadSection}>
            <Text style={styles.label}>Staff Documents (Max 220KB)</Text>
            <View style={styles.uploadRow}>
              {/* PHOTO UPLOAD */}
              <View style={styles.uploadWrapper}>
                <TouchableOpacity
                  style={styles.uploadBox}
                  onPress={() =>
                    !photo && handleDocumentChange("photo", "pick")
                  }
                  activeOpacity={photo ? 1 : 0.7}
                >
                  {photo ? (
                    photo.startsWith("data:application/pdf") ? (
                      <View
                        style={[
                          styles.previewImage,
                          {
                            justifyContent: "center",
                            alignItems: "center",
                            backgroundColor: "#F1F5F9",
                          },
                        ]}
                      >
                        <Ionicons
                          name="document-text"
                          size={32}
                          color="#EF4444"
                        />
                        <Text style={{ fontSize: 10, color: "#334155" }}>
                          PDF
                        </Text>
                      </View>
                    ) : (
                      <Image
                        source={{ uri: photo }}
                        style={styles.previewImage}
                        resizeMode="cover"
                      />
                    )
                  ) : (
                    <View style={styles.uploadPlaceholder}>
                      <Text style={styles.uploadIcon}>👤</Text>
                      <Text style={styles.uploadLabel}>Photo</Text>
                    </View>
                  )}
                </TouchableOpacity>
                {photo && (
                  <View style={styles.overlayControls}>
                    <TouchableOpacity
                      style={[styles.overlayBtn, styles.editOverlay]}
                      onPress={() => handleDocumentChange("photo", "pick")}
                    >
                      <Ionicons name="create" size={16} color="white" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.overlayBtn, styles.deleteOverlay]}
                      onPress={() => handleDocumentChange("photo", "delete")}
                    >
                      <Ionicons name="trash" size={16} color="white" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* ID CARD UPLOAD */}
              <View style={styles.uploadWrapper}>
                <TouchableOpacity
                  style={styles.uploadBox}
                  onPress={() =>
                    !idCard && handleDocumentChange("idCard", "pick")
                  }
                  activeOpacity={idCard ? 1 : 0.7}
                >
                  {idCard ? (
                    idCard.startsWith("data:application/pdf") ? (
                      <View
                        style={[
                          styles.previewImage,
                          {
                            justifyContent: "center",
                            alignItems: "center",
                            backgroundColor: "#F1F5F9",
                          },
                        ]}
                      >
                        <Ionicons
                          name="document-text"
                          size={32}
                          color="#EF4444"
                        />
                        <Text style={{ fontSize: 10, color: "#334155" }}>
                          PDF
                        </Text>
                      </View>
                    ) : (
                      <Image
                        source={{ uri: idCard }}
                        style={styles.previewImage}
                        resizeMode="cover"
                      />
                    )
                  ) : (
                    <View style={styles.uploadPlaceholder}>
                      <Text style={styles.uploadIcon}>💳</Text>
                      <Text style={styles.uploadLabel}>Photo ID Proof</Text>
                    </View>
                  )}
                </TouchableOpacity>
                {idCard && (
                  <View style={styles.overlayControls}>
                    <TouchableOpacity
                      style={[styles.overlayBtn, styles.editOverlay]}
                      onPress={() => handleDocumentChange("idCard", "pick")}
                    >
                      <Ionicons name="create" size={16} color="white" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.overlayBtn, styles.deleteOverlay]}
                      onPress={() => handleDocumentChange("idCard", "delete")}
                    >
                      <Ionicons name="trash" size={16} color="white" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* ADDRESS PROOF UPLOAD */}
              <View style={styles.uploadWrapper}>
                <TouchableOpacity
                  style={styles.uploadBox}
                  onPress={() =>
                    !addressProof &&
                    handleDocumentChange("addressProof", "pick")
                  }
                  activeOpacity={addressProof ? 1 : 0.7}
                >
                  {addressProof ? (
                    addressProof.startsWith("data:application/pdf") ? (
                      <View
                        style={[
                          styles.previewImage,
                          {
                            justifyContent: "center",
                            alignItems: "center",
                            backgroundColor: "#F1F5F9",
                          },
                        ]}
                      >
                        <Ionicons
                          name="document-text"
                          size={32}
                          color="#EF4444"
                        />
                        <Text style={{ fontSize: 10, color: "#334155" }}>
                          PDF
                        </Text>
                      </View>
                    ) : (
                      <Image
                        source={{ uri: addressProof }}
                        style={styles.previewImage}
                        resizeMode="cover"
                      />
                    )
                  ) : (
                    <View style={styles.uploadPlaceholder}>
                      <Text style={styles.uploadIcon}>🏠</Text>
                      <Text style={styles.uploadLabel}>Address Proof</Text>
                    </View>
                  )}
                </TouchableOpacity>
                {addressProof && (
                  <View style={styles.overlayControls}>
                    <TouchableOpacity
                      style={[styles.overlayBtn, styles.editOverlay]}
                      onPress={() =>
                        handleDocumentChange("addressProof", "pick")
                      }
                    >
                      <Ionicons name="create" size={16} color="white" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.overlayBtn, styles.deleteOverlay]}
                      onPress={() =>
                        handleDocumentChange("addressProof", "delete")
                      }
                    >
                      <Ionicons name="trash" size={16} color="white" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          </View>

          <View style={styles.formButtons}>
            <TouchableOpacity
              style={[styles.submitBtn, isUploading && styles.disabledBtn]}
              onPress={handleSubmit}
              disabled={isUploading}
            >
              {isUploading ? (
                <View style={styles.loadingWrapper}>
                  <ActivityIndicator color="white" size="small" />
                  <Text style={styles.loadingText}>Loading...</Text>
                </View>
              ) : (
                <Text style={styles.submitText}>
                  {editingId ? "Update Staff" : "Register Staff"}
                </Text>
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
            <Text style={styles.emptyText}>
              No staff registered for your home yet.
            </Text>
          </View>
        ) : (
          staffList.map((staff) => (
            <View key={staff.id} style={styles.card}>
              <View style={styles.cardMain}>
                {staff.photo ? (
                  staff.photo.startsWith("data:application/pdf") ? (
                    <View
                      style={[
                        styles.listAvatar,
                        {
                          justifyContent: "center",
                          alignItems: "center",
                          backgroundColor: "#FEE2E2",
                        },
                      ]}
                    >
                      <Ionicons
                        name="document-text"
                        size={24}
                        color="#EF4444"
                      />
                    </View>
                  ) : (
                    <Image
                      source={{ uri: staff.photo }}
                      style={styles.listAvatar}
                      resizeMode="cover"
                    />
                  )
                ) : (
                  <View style={styles.listAvatarPlaceholder}>
                    <Text style={styles.avatarText}>
                      {staff.staffName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.staffInfo}>
                  <View style={styles.staffHeader}>
                    <Text style={styles.staffName}>{staff.staffName}</Text>
                    <View style={styles.typeBadge}>
                      <Text style={styles.typeBadgeText}>
                        {staff.staffType}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.staffContact}>📞 {staff.contact}</Text>
                  <Text style={styles.staffNative}>
                    📍 {staff.nativePlace || "N/A"}
                  </Text>
                  {staff.guardianName && (
                    <Text style={styles.staffGuardian}>
                      G: {staff.guardianName}
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity
                  onPress={() => handleEdit(staff)}
                  style={styles.editBtn}
                >
                  <Ionicons name="create-outline" size={20} color="#3B82F6" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDelete(staff.id)}
                  style={styles.deleteBtn}
                >
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
    textTransform: "uppercase",
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
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  uploadBox: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#CBD5E1",
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
    minHeight: 100,
  },
  uploadPlaceholder: {
    alignItems: "center",
  },
  uploadIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  uploadLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
  },
  previewImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  cardMain: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
  },
  listAvatar: {
    width: 50,
    height: 50,
    borderRadius: 15,
    backgroundColor: "#F1F5F9",
  },
  listAvatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 15,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  avatarText: {
    fontSize: 20,
    fontWeight: "800",
    color: "#64748B",
  },
  staffInfo: {
    flex: 1,
  },
  staffHeader: {
    flexDirection: "row",
    alignItems: "center",
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
    textTransform: "uppercase",
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
    fontSize: 16,
  },
  cardActions: {
    flexDirection: "row",
    gap: 8,
  },
  editBtn: {
    padding: 8,
    backgroundColor: "#EFF6FF",
    borderRadius: 10,
  },
  deleteBtn: {
    padding: 8,
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
  },
  emptyState: {
    alignItems: "center",
    padding: 40,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#E2E8F0",
  },
  emptyText: {
    marginTop: 12,
    color: "#94A3B8",
    fontSize: 14,
    textAlign: "center",
  },
  uploadWrapper: {
    flex: 1,
    position: "relative",
    aspectRatio: 1,
  },
  overlayControls: {
    position: "absolute",
    top: 5,
    right: 5,
    gap: 8,
    flexDirection: "row",
  },
  overlayBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 5,
  },
  editOverlay: {
    backgroundColor: "#3B82F6",
  },
  deleteOverlay: {
    backgroundColor: "#EF4444",
  },
  errorText: {
    color: "#EF4444",
    fontSize: 11,
    marginTop: 4,
    marginLeft: 4,
    fontWeight: "600",
  },
  inputError: {
    borderColor: "#EF4444",
    backgroundColor: "#FFF1F2",
  },
  loadingWrapper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 16,
  },
});
