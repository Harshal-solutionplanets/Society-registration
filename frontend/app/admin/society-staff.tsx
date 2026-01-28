import { appId, db } from "@/configs/firebaseConfig";
import { useAuth } from "@/hooks/useAuth";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Toast from "react-native-toast-message";

interface StaffMember {
  id: string;
  name: string;
  position: string;
  phone: string;
  email: string;
  shift: string; // Day/Night
  joinedDate: string;
  photo?: string;
  idCard?: string;
  addressProof?: string;
  driveFolderId?: string;
}

const STAFF_POSITIONS = [
  "Watchman",
  "Security Guard",
  "Security Supervisor",
  "Cleaner",
  "Gardener",
  "Electrician",
  "Plumber",
  "Manager",
  "Lift Operator",
  "Sweeper",
  "Other",
];

const SHIFTS = ["Day", "Night", "General"];

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

    if (!searchRes.ok) {
      const err = await searchRes.json();
      console.error("DEBUG: findOrCreateFolder search failed", err);
      throw new Error(
        "Drive Search Failed: " + (err.error?.message || "Unknown"),
      );
    }

    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0)
      return searchData.files[0].id;

    console.log(`DEBUG: Folder '${name}' not found, creating...`);

    const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
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
    });

    if (!createRes.ok) {
      const err = await createRes.json();
      console.error("DEBUG: findOrCreateFolder create failed", err);
      throw new Error(
        "Drive Create Failed: " + (err.error?.message || "Unknown"),
      );
    }

    const createData = await createRes.json();
    return createData.id;
  } catch (error) {
    console.error("DEBUG: findOrCreateFolder error", error);
    throw error;
  }
};

const uploadImageToDrive = async (
  base64String: string,
  fileName: string,
  parentId: string,
  token: string,
) => {
  try {
    const cleanBase64 = base64String.replace(/^data:image\/\w+;base64,/, "");

    // 1. Search if file already exists
    const q = `name='${fileName}' and '${parentId}' in parents and trashed=false`;
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const searchData = await searchRes.json();
    const existingFile =
      searchData.files && searchData.files.length > 0
        ? searchData.files[0]
        : null;

    const boundary = "foo_bar_baz";
    const metadata = existingFile
      ? {}
      : { name: fileName, parents: [parentId] };
    const method = existingFile ? "PATCH" : "POST";
    const url = existingFile
      ? `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=multipart`
      : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";

    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) +
      `\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: image/jpeg\r\n` +
      `Content-Transfer-Encoding: base64\r\n\r\n` +
      cleanBase64 +
      `\r\n--${boundary}--`;

    const res = await fetch(url, {
      method: method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: body,
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error("Upload Failed: " + (err.error?.message || "Unknown"));
    }

    const data = await res.json();
    return data.id;
  } catch (error) {
    console.error("DEBUG: uploadImageToDrive error", error);
    throw error;
  }
};

const deleteFileFromDrive = async (
  fileName: string,
  folderId: string,
  token: string,
) => {
  try {
    const q = `name='${fileName}' and '${folderId}' in parents and trashed=false`;
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!searchRes.ok) return;
    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
      const fileId = searchData.files[0].id;
      await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  } catch (error) {
    console.warn("DEBUG: deleteFileFromDrive error (non-critical):", error);
  }
};

const moveFolder = async (
  fileId: string,
  destinationId: string,
  token: string,
) => {
  try {
    const fileRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const fileData = await fileRes.json();
    const previousParents = fileData.parents ? fileData.parents.join(",") : "";
    const moveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${destinationId}&removeParents=${previousParents}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!moveRes.ok) {
      const err = await moveRes.json();
      throw new Error("Move Failed: " + (err.error?.message || "Unknown"));
    }
  } catch (error) {
    console.error("DEBUG: moveFolder error", error);
    throw error;
  }
};

export default function SocietyStaff() {
  const router = useRouter();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<StaffMember[]>([]);

  // Form state
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [shift, setShift] = useState("Day");
  const [showPositionDropdown, setShowPositionDropdown] = useState(false);
  const [showShiftDropdown, setShowShiftDropdown] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [otherPosition, setOtherPosition] = useState("");

  // Document states (base64)
  const [photo, setPhoto] = useState<string | null>(null);
  const [idCard, setIdCard] = useState<string | null>(null);
  const [addressProof, setAddressProof] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchStaff();
    }
  }, [user]);

  const fetchStaff = async () => {
    if (!user) return;
    try {
      const staffRef = collection(
        db,
        `artifacts/${appId}/public/data/societies/${user.uid}/Staff`,
      );
      const snapshot = await getDocs(staffRef);
      const fetchedStaff = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as StaffMember[];
      setMembers(fetchedStaff);
    } catch (error) {
      console.error("Error fetching staff:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePickImage = async (type: "photo" | "idCard" | "addressProof") => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled) {
      const asset = result.assets[0];

      if (asset.base64 && asset.base64.length > 682666) {
        Alert.alert("Error", "File size too large. Maximum limit is 500KB.");
        return;
      }

      const base64Image = `data:image/jpeg;base64,${asset.base64}`;
      if (type === "photo") setPhoto(base64Image);
      else if (type === "idCard") setIdCard(base64Image);
      else if (type === "addressProof") setAddressProof(base64Image);
    }
  };

  const refreshAccessToken = async () => {
    if (!user) return null;
    try {
      const backendUrl =
        process.env.EXPO_PUBLIC_BACKEND_URL || "http://localhost:3001";
      const res = await fetch(
        `${backendUrl}/api/auth/google/refresh?adminUID=${user.uid}&appId=${appId}`,
      );
      if (!res.ok) throw new Error("Refresh failed");
      const data = await res.json();
      return data.accessToken;
    } catch (error) {
      console.error("DEBUG: Token refresh failed:", error);
      return null;
    }
  };

  const handleAddOrUpdateStaff = async () => {
    if (!user) return;

    if (!name || !position || !shift || !phone) {
      Toast.show({
        type: "error",
        text1: "Required Fields Missing",
        text2: "Please fill Name, Position, Shift and Phone Number.",
      });
      return;
    }

    if (position === "Other" && !otherPosition) {
      Toast.show({
        type: "error",
        text1: "Position Missing",
        text2: "Please specify the other position.",
      });
      return;
    }

    setSaving(true);
    try {
      const staffId = editingId || `staff_${Date.now()}`;
      const finalPosition = position === "Other" ? otherPosition : position;

      // Start Drive Logic
      let staffFolderId = "";
      if (editingId) {
        const existingMember = members.find((m) => m.id === editingId);
        if (existingMember?.driveFolderId) {
          staffFolderId = existingMember.driveFolderId;
        }
      }

      const societyDoc = await getDoc(
        doc(db, `artifacts/${appId}/public/data/societies`, user.uid),
      );
      const societyData = societyDoc.data();
      let token = societyData?.driveAccessToken;

      if (token) {
        const testRes = await fetch(
          "https://www.googleapis.com/drive/v3/about?fields=user",
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (testRes.status === 401) {
          token = await refreshAccessToken();
        }
      }

      if (token && societyData?.driveFolderId) {
        const mainStaffFolderId = await findOrCreateFolder(
          "Society_Staff",
          societyData.driveFolderId,
          token,
        );

        if (!staffFolderId) {
          staffFolderId = await findOrCreateFolder(
            name,
            mainStaffFolderId,
            token,
          );
        } else if (editingId) {
          // Rename folder if name changed
          const existingMember = members.find((m) => m.id === editingId);
          if (existingMember && existingMember.name !== name) {
            await fetch(
              `https://www.googleapis.com/drive/v3/files/${staffFolderId}`,
              {
                method: "PATCH",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ name }),
              },
            );
          }
        }

        // 3. Document Operations (Upload/Overwrite/Delete)
        const handleDocOp = async (
          currentBase64: string | null,
          originalValue: string | null | undefined,
          fileName: string,
        ) => {
          if (!currentBase64 && originalValue && editingId) {
            // User deleted existing doc
            await deleteFileFromDrive(fileName, staffFolderId, token);
          } else if (currentBase64 && currentBase64.startsWith("data:image")) {
            // User uploaded NEW or UPDATED doc
            await uploadImageToDrive(
              currentBase64,
              fileName,
              staffFolderId,
              token,
            );
          }
        };

        const existingMember = editingId
          ? members.find((m) => m.id === editingId)
          : null;
        await handleDocOp(photo, existingMember?.photo, "Photo.jpg");
        await handleDocOp(idCard, existingMember?.idCard, "ID_Card.jpg");
        await handleDocOp(
          addressProof,
          existingMember?.addressProof,
          "Address_Proof.jpg",
        );
      } else {
        console.warn("DEBUG: No Drive Token or root folder available.");
        if (photo || idCard || addressProof) {
          Alert.alert(
            "Notice",
            "Google Drive not linked or folder missing. Documents saved locally only.",
          );
        }
      }
      // End Drive Logic

      const staffData: StaffMember = {
        id: staffId,
        name,
        position: finalPosition,
        phone,
        email,
        shift,
        joinedDate: new Date().toISOString().split("T")[0],
        photo: photo || "",
        idCard: idCard || "",
        addressProof: addressProof || "",
        driveFolderId: staffFolderId,
      };

      const staffPath = `artifacts/${appId}/public/data/societies/${user.uid}/Staff/${staffId}`;
      await setDoc(doc(db, staffPath), staffData, { merge: true });

      if (editingId) {
        setMembers((prev: StaffMember[]) =>
          prev.map((m: StaffMember) => (m.id === editingId ? staffData : m)),
        );
        setEditingId(null);
      } else {
        setMembers((prev: StaffMember[]) => [...prev, staffData]);
      }

      // Reset form
      setName("");
      setPosition("");
      setPhone("");
      setEmail("");
      setShift("Day");
      setOtherPosition("");
      setPhoto(null);
      setIdCard(null);
      setAddressProof(null);

      Toast.show({
        type: "success",
        text1: editingId ? "Staff Updated" : "Staff Added",
        text2: `${name} has been processed.`,
      });
    } catch (error: any) {
      console.error(error);
      Alert.alert("Error", error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStaff = async (member: StaffMember) => {
    if (!user) return;

    // Use window.confirm for web compatibility
    const confirmMessage = `Are you sure you want to remove ${member.name}? This will archive their documents and data.`;

    const confirmDelete =
      Platform.OS === "web"
        ? window.confirm(confirmMessage)
        : await new Promise<boolean>((resolve) => {
            Alert.alert("Remove Staff", confirmMessage, [
              {
                text: "Cancel",
                style: "cancel",
                onPress: () => resolve(false),
              },
              {
                text: "Remove & Archive",
                style: "destructive",
                onPress: () => resolve(true),
              },
            ]);
          });

    if (!confirmDelete) return;

    try {
      setSaving(true);
      console.log("DEBUG: Starting archive process for", member.name);
      let driveArchived = false;

      // 2. Try to move Drive folder to "Archived Staff" folder (NON-CRITICAL)
      const societyDoc = await getDoc(
        doc(db, `artifacts/${appId}/public/data/societies`, user.uid),
      );
      const societyData = societyDoc.data();
      let token = societyData?.driveAccessToken;

      if (token) {
        const testRes = await fetch(
          "https://www.googleapis.com/drive/v3/about?fields=user",
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (testRes.status === 401) {
          token = await refreshAccessToken();
        }
      }

      console.log("DEBUG: Archive Token present?", !!token);
      console.log("DEBUG: Member Folder ID:", member.driveFolderId);

      if (token && member.driveFolderId && societyData?.driveFolderId) {
        try {
          const archiveFolderId = await findOrCreateFolder(
            "Archived Staff",
            societyData.driveFolderId,
            token,
          );
          console.log("DEBUG: Archive Drive Folder ID:", archiveFolderId);
          await moveFolder(member.driveFolderId, archiveFolderId, token);
          console.log("DEBUG: Documents moved to Archived Staff in Drive");
          driveArchived = true;
        } catch (driveError: any) {
          console.warn(
            "DEBUG: Drive archiving failed (token may be expired):",
            driveError.message,
          );
          // Don't throw - continue with Firestore operations
        }
      }

      // 3. Metadata Archiving in Firestore
      const archivedPath = `artifacts/${appId}/public/data/societies/${user.uid}/Archived Staff/${member.id}`;
      await setDoc(doc(db, archivedPath), {
        ...member,
        archivedAt: new Date().toISOString(),
        driveArchived,
      });

      // 4. Delete from active "Staff" collection
      const staffPath = `artifacts/${appId}/public/data/societies/${user.uid}/Staff/${member.id}`;
      await deleteDoc(doc(db, staffPath));

      // 5. Update UI
      setMembers((prev: StaffMember[]) =>
        prev.filter((m: StaffMember) => m.id !== member.id),
      );

      // 5. Show appropriate success message
      if (driveArchived) {
        Toast.show({
          type: "success",
          text1: "Staff Archived Successfully",
          text2: "Data moved to ArchivedStaff collection and Drive folder",
        });
      } else {
        Toast.show({
          type: "info",
          text1: "Staff Removed (Partial Archive)",
          text2:
            "Firestore archived. Drive failed - re-login with Google to fix.",
        });
      }
    } catch (error: any) {
      console.error("DEBUG: Archive/Delete failed:", error);
      Alert.alert("Error", error.message || "Failed to archive staff member");
    } finally {
      setSaving(false);
    }
  };

  const handleEditStaff = (member: StaffMember) => {
    setEditingId(member.id);
    setName(member.name);

    const isOther =
      !STAFF_POSITIONS.includes(member.position) && member.position !== "Other";
    setPosition(isOther ? "Other" : member.position);
    setOtherPosition(isOther ? member.position : "");

    setPhone(member.phone);
    setEmail(member.email);
    setShift(member.shift);
    setPhoto(member.photo || null);
    setIdCard(member.idCard || null);
    setAddressProof(member.addressProof || null);
    // Scroll to top or just focus? For mobile, users will see the form.
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

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
          <Text style={styles.title}>Society Staff</Text>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>
            {editingId ? "Edit Staff Member" : "Add New Staff"}
          </Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Full Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Ramesh"
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={[styles.row, { zIndex: 1000 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Position *</Text>
              <TouchableOpacity
                style={styles.dropdownButton}
                onPress={() => setShowPositionDropdown(!showPositionDropdown)}
              >
                <Text
                  style={[
                    styles.dropdownText,
                    !position && { color: "#94A3B8" },
                  ]}
                >
                  {position || "Select Position"}
                </Text>
                <Text>▼</Text>
              </TouchableOpacity>
              {showPositionDropdown && (
                <View style={styles.dropdownListContainer}>
                  <ScrollView
                    style={styles.dropdownList}
                    nestedScrollEnabled={true}
                  >
                    {STAFF_POSITIONS.map((item) => (
                      <TouchableOpacity
                        key={item}
                        style={styles.dropdownItem}
                        onPress={() => {
                          setPosition(item);
                          setShowPositionDropdown(false);
                        }}
                      >
                        <Text>{item}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Shift *</Text>
              <TouchableOpacity
                style={styles.dropdownButton}
                onPress={() => setShowShiftDropdown(!showShiftDropdown)}
              >
                <Text style={styles.dropdownText}>{shift}</Text>
                <Text>▼</Text>
              </TouchableOpacity>
              {showShiftDropdown && (
                <View style={styles.dropdownListContainer}>
                  {SHIFTS.map((item) => (
                    <TouchableOpacity
                      key={item}
                      style={styles.dropdownItem}
                      onPress={() => {
                        setShift(item);
                        setShowShiftDropdown(false);
                      }}
                    >
                      <Text>{item}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </View>

          {position === "Other" && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Specify Position</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Supervisor, CCTV Expert"
                value={otherPosition}
                onChangeText={setOtherPosition}
              />
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Phone Number *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 9876543210"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. ramesh@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.uploadSection}>
            <Text style={styles.label}>Required Documents (Max 500KB)</Text>
            <View style={styles.uploadRow}>
              {/* Photo */}
              <View style={styles.uploadContainer}>
                <TouchableOpacity
                  style={styles.uploadBox}
                  onPress={() => !photo && handlePickImage("photo")}
                  activeOpacity={photo ? 1 : 0.7}
                >
                  {photo ? (
                    <>
                      <Image
                        source={{ uri: photo }}
                        style={styles.previewImage}
                        resizeMode="cover"
                      />
                      <View style={styles.uploadActionButtons}>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.editActionBtn]}
                          onPress={() => handlePickImage("photo")}
                        >
                          <Ionicons name="pencil" size={14} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.deleteActionBtn]}
                          onPress={() => setPhoto(null)}
                        >
                          <Ionicons name="trash" size={14} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <View style={styles.uploadPlaceholder}>
                      <Text style={styles.uploadIcon}>👤</Text>
                      <Text style={styles.uploadLabel}>Photo</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* ID Card */}
              <View style={styles.uploadContainer}>
                <TouchableOpacity
                  style={styles.uploadBox}
                  onPress={() => !idCard && handlePickImage("idCard")}
                  activeOpacity={idCard ? 1 : 0.7}
                >
                  {idCard ? (
                    <>
                      <Image
                        source={{ uri: idCard }}
                        style={styles.previewImage}
                        resizeMode="cover"
                      />
                      <View style={styles.uploadActionButtons}>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.editActionBtn]}
                          onPress={() => handlePickImage("idCard")}
                        >
                          <Ionicons name="pencil" size={14} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.deleteActionBtn]}
                          onPress={() => setIdCard(null)}
                        >
                          <Ionicons name="trash" size={14} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <View style={styles.uploadPlaceholder}>
                      <Text style={styles.uploadIcon}>💳</Text>
                      <Text style={styles.uploadLabel}>Photo ID card</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* Address Proof */}
              <View style={styles.uploadContainer}>
                <TouchableOpacity
                  style={styles.uploadBox}
                  onPress={() =>
                    !addressProof && handlePickImage("addressProof")
                  }
                  activeOpacity={addressProof ? 1 : 0.7}
                >
                  {addressProof ? (
                    <>
                      <Image
                        source={{ uri: addressProof }}
                        style={styles.previewImage}
                        resizeMode="cover"
                      />
                      <View style={styles.uploadActionButtons}>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.editActionBtn]}
                          onPress={() => handlePickImage("addressProof")}
                        >
                          <Ionicons name="pencil" size={14} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.deleteActionBtn]}
                          onPress={() => setAddressProof(null)}
                        >
                          <Ionicons name="trash" size={14} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <View style={styles.uploadPlaceholder}>
                      <Text style={styles.uploadIcon}>🏠</Text>
                      <Text style={styles.uploadLabel}>Address Proof</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.addBtn, saving && styles.disabledBtn]}
            onPress={handleAddOrUpdateStaff}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.addBtnText}>
                {editingId ? "Update Member" : "Add Member"}
              </Text>
            )}
          </TouchableOpacity>
          {editingId && (
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => {
                setEditingId(null);
                setName("");
                setPosition("");
                setPhone("");
                setEmail("");
                setShift("Day");
                setOtherPosition("");
                setPhoto(null);
                setIdCard(null);
                setAddressProof(null);
              }}
              disabled={saving}
            >
              <Text style={styles.cancelBtnText}>Cancel Edit</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.listSection}>
          <Text style={styles.sectionTitle}>Active Staff Members</Text>
          {members.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No staff members added yet.</Text>
            </View>
          ) : (
            members.map((member: StaffMember) => (
              <View key={member.id} style={styles.memberCard}>
                <View style={styles.memberRow}>
                  {member.photo ? (
                    <Image
                      source={{ uri: member.photo }}
                      style={styles.memberAvatar}
                    />
                  ) : (
                    <View style={styles.memberAvatarPlaceholder}>
                      <Text style={styles.avatarInitial}>
                        {member.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>{member.name}</Text>
                    <Text style={styles.memberSubText}>
                      {member.position} • {member.shift} Shift
                    </Text>
                    <Text style={styles.memberSubText}>📞 {member.phone}</Text>
                  </View>
                </View>
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={styles.editBtn}
                    onPress={() => handleEditStaff(member)}
                  >
                    <Text style={styles.editBtnText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDeleteStaff(member)}
                  >
                    <Text style={styles.deleteBtnText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F1F5F9",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    padding: 24,
    paddingTop: 64,
    backgroundColor: "#FFFFFF",
  },
  backBtn: {
    marginBottom: 12,
  },
  backBtnText: {
    fontSize: 16,
    color: "#3B82F6",
    fontWeight: "600",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0F172A",
  },
  formSection: {
    margin: 20,
    padding: 24,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: "#1E293B",
  },
  row: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  dropdownButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 12,
  },
  dropdownText: {
    fontSize: 15,
    color: "#1E293B",
  },
  dropdownListContainer: {
    position: "absolute",
    top: 75,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 2000,
    maxHeight: 200,
  },
  dropdownList: {
    padding: 4,
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  uploadSection: {
    marginBottom: 24,
  },
  uploadRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  uploadContainer: {
    flex: 1,
    aspectRatio: 1,
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
  },
  uploadPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 8,
  },
  uploadIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  uploadLabel: {
    fontSize: 10,
    color: "#64748B",
    textAlign: "center",
    fontWeight: "600",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  addBtn: {
    backgroundColor: "#3B82F6",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  addBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  cancelBtn: {
    marginTop: 12,
    padding: 12,
    alignItems: "center",
  },
  cancelBtnText: {
    color: "#64748B",
    fontWeight: "600",
  },
  disabledBtn: {
    opacity: 0.6,
  },
  listSection: {
    paddingHorizontal: 20,
  },
  memberCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  memberAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 16,
  },
  memberAvatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#E2E8F0",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  avatarInitial: {
    fontSize: 24,
    fontWeight: "700",
    color: "#64748B",
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1E293B",
  },
  memberSubText: {
    fontSize: 14,
    color: "#64748B",
    marginTop: 2,
  },
  cardActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 16,
  },
  editBtn: {
    flex: 1,
    backgroundColor: "#F1F5F9",
    padding: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  editBtnText: {
    color: "#1E293B",
    fontWeight: "600",
  },
  deleteBtn: {
    flex: 1,
    backgroundColor: "#FEF2F2",
    padding: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  deleteBtnText: {
    color: "#EF4444",
    fontWeight: "600",
  },
  emptyState: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    color: "#94A3B8",
    fontSize: 16,
  },
  uploadActionButtons: {
    position: "absolute",
    top: 6,
    right: 6,
    flexDirection: "row",
    gap: 6,
    zIndex: 20,
  },
  actionBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  editActionBtn: {
    backgroundColor: "#3B82F6",
  },
  deleteActionBtn: {
    backgroundColor: "#EF4444",
  },
});
