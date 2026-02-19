import { appId, db } from "@/configs/firebaseConfig";
import { useAuth } from "@/hooks/useAuth";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
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
    const mimeMatch = base64String.match(/^data:(.*);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const cleanBase64 = base64String.replace(/^data:(.*);base64,/, "");

    const boundary = "foo_bar_baz";
    const metadata = { name: fileName, parents: [parentId] };
    const url =
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";

    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) +
      `\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n` +
      `Content-Transfer-Encoding: base64\r\n\r\n` +
      cleanBase64 +
      `\r\n--${boundary}--`;

    const res = await fetch(url, {
      method: "POST",
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
    const q = `name = '${fileName}' and '${folderId}' in parents and trashed = false`;
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!searchRes.ok) return;
    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
      console.log(
        `DEBUG: Found ${searchData.files.length} duplicate instances of ${fileName}. Cleaning all...`,
      );
      for (const file of searchData.files) {
        console.log(`DEBUG: Deleting instance: ${file.id}`);
        await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
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

    console.log(
      `DEBUG: Moving file ${fileId} from ${previousParents} to ${destinationId}`,
    );

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

  const [formErrors, setFormErrors] = useState({
    phone: "",
    email: "",
  });

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
        `artifacts/${appId}/public/data/societies/${user?.uid}/Staff`,
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

          // Size Check (500KB = 512000 bytes)
          if (asset.size && asset.size > 512000) {
            Alert.alert(
              "Error",
              "File size too large. Maximum limit is 500KB.",
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

    // If we are editing an existing record, sync "turant"
    if (editingId && user) {
      // Determine extension and filename
      const isPdf = newValue?.startsWith("data:application/pdf");
      const ext = isPdf ? ".pdf" : ".jpg";
      const otherExt = isPdf ? ".jpg" : ".pdf";
      const baseName =
        type === "photo"
          ? "Photo"
          : type === "idCard"
            ? "ID_Card"
            : "Address_Proof";
      const fileName = `${baseName}${ext}`;
      const otherFileName = `${baseName}${otherExt}`;

      try {
        // 1. Update Firestore
        const updateObj = {
          [type]: newValue || "",
          updatedAt: new Date().toISOString(),
        };
        const staffPath = `artifacts/${appId}/public/data/societies/${user?.uid}/Staff/${editingId}`;
        await setDoc(doc(db, staffPath), updateObj, { merge: true });

        // 2. Drive Update (if token/folder present)
        const societyDoc = await getDoc(
          doc(db, `artifacts/${appId}/public/data/societies`, user?.uid),
        );
        const societyData = societyDoc.data();
        let token = societyData?.driveAccessToken;

        const existingMember = members.find((m) => m.id === editingId);
        const staffFolderId = existingMember?.driveFolderId;

        if (token && staffFolderId) {
          // Refresh token if needed
          const testRes = await fetch(
            "https://www.googleapis.com/drive/v3/about?fields=user",
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (testRes.status === 401) {
            token = await refreshAccessToken();
          }

          if (token) {
            // Exhaustive Cleanup: Delete ALL potential extensions before upload
            const baseFileName =
              type === "photo"
                ? "Photo"
                : type === "idCard"
                  ? "ID_Card"
                  : "Address_Proof";
            await deleteFileFromDrive(
              `${baseFileName}.jpg`,
              staffFolderId,
              token,
            );
            await deleteFileFromDrive(
              `${baseFileName}.pdf`,
              staffFolderId,
              token,
            );
            await deleteFileFromDrive(
              `${baseFileName}.png`,
              staffFolderId,
              token,
            );
            await deleteFileFromDrive(
              `${baseFileName}.jpeg`,
              staffFolderId,
              token,
            );

            if (newValue) {
              await uploadImageToDrive(
                newValue,
                fileName,
                staffFolderId,
                token,
              );
            }
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

  const handlePhoneChange = (val: string) => {
    const sanitized = val.replace(/[^0-9]/g, "");
    if (sanitized.length > 10) return;
    setPhone(sanitized);
    if (sanitized.length > 0 && sanitized.length < 10) {
      setFormErrors((prev) => ({ ...prev, phone: "Phone must be 10 digits" }));
    } else {
      setFormErrors((prev) => ({ ...prev, phone: "" }));
    }
  };

  const handleEmailChange = (val: string) => {
    setEmail(val);
    if (val.length > 0) {
      if (!val.toLowerCase().endsWith("@gmail.com")) {
        setFormErrors((prev) => ({
          ...prev,
          email: "Only @gmail.com leads are allowed",
        }));
      } else {
        setFormErrors((prev) => ({ ...prev, email: "" }));
      }
    } else {
      setFormErrors((prev) => ({ ...prev, email: "" }));
    }
  };

  const handleAddOrUpdateStaff = async () => {
    if (!user) return;

    // Validation check
    if (!name || !position || !phone) {
      Toast.show({
        type: "error",
        text1: "Required Fields Missing",
        text2: "Please fill Name, Position and Phone Number.",
      });
      return;
    }

    if (phone.length !== 10) {
      setFormErrors((prev) => ({ ...prev, phone: "Phone must be 10 digits" }));
      return;
    }

    if (email && !email.toLowerCase().endsWith("@gmail.com")) {
      setFormErrors((prev) => ({
        ...prev,
        email: "Only @gmail.com leads are allowed",
      }));
      return;
    }

    if (position === "Other" && !otherPosition) {
      Alert.alert("Error", "Please specify the other position.");
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
        doc(db, `artifacts/${appId}/public/data/societies`, user?.uid),
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

        // 3. Document Operations
        const handleDocOp = async (
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

          // Exhaustive Cleanup: Delete ALL potential extensions
          await deleteFileFromDrive(
            `${baseFileName}.jpg`,
            staffFolderId,
            token!,
          ).catch(() => {});
          await deleteFileFromDrive(
            `${baseFileName}.pdf`,
            staffFolderId,
            token!,
          ).catch(() => {});
          await deleteFileFromDrive(
            `${baseFileName}.png`,
            staffFolderId,
            token!,
          ).catch(() => {});
          await deleteFileFromDrive(
            `${baseFileName}.jpeg`,
            staffFolderId,
            token!,
          ).catch(() => {});

          if (
            currentBase64 &&
            (currentBase64.startsWith("data:image") ||
              currentBase64.startsWith("data:application/pdf"))
          ) {
            await uploadImageToDrive(
              currentBase64,
              fileName,
              staffFolderId,
              token!,
            );
          }
        };

        const existingMember = editingId
          ? members.find((m) => m.id === editingId)
          : null;
        await handleDocOp(photo, existingMember?.photo, "photo");
        await handleDocOp(idCard, existingMember?.idCard, "idCard");
        await handleDocOp(
          addressProof,
          existingMember?.addressProof,
          "addressProof",
        );
      } else {
        console.warn("DEBUG: No Drive Token or root folder available.");
        if (photo || idCard || addressProof) {
          Alert.alert(
            "Notice",
            "Google Drive not linked. Documents saved locally only.",
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

      const staffPath = `artifacts/${appId}/public/data/societies/${user?.uid}/Staff/${staffId}`;
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

      // 1. Archive to Firestore "ArchivedStaff" collection
      const archivedStaffPath = `artifacts/${appId}/public/data/societies/${user?.uid}/ArchivedStaff/${member.id}`;
      await setDoc(doc(db, archivedStaffPath), {
        ...member,
        archivedAt: new Date().toISOString(),
        archivedBy: user?.uid,
      });

      // 2. Drive archive folder move
      let driveArchived = false;
      const societyDoc = await getDoc(
        doc(db, `artifacts/${appId}/public/data/societies`, user?.uid),
      );
      const societyData = societyDoc.data();
      let token = societyData?.driveAccessToken;

      if (token && member.driveFolderId && societyData?.driveFolderId) {
        try {
          // Test token
          const testRes = await fetch(
            "https://www.googleapis.com/drive/v3/about?fields=user",
            {
              headers: { Authorization: `Bearer ${token}` },
            },
          );
          if (testRes.status === 401) {
            token = await refreshAccessToken();
          }

          if (token) {
            const archiveFolderId = await findOrCreateFolder(
              "Archived Staff",
              societyData.driveFolderId,
              token,
            );
            await moveFolder(member.driveFolderId, archiveFolderId, token);
            driveArchived = true;
          }
        } catch (driveErr: any) {
          console.warn("Drive archiving failed:", driveErr.message);
        }
      }

      // 3. Delete from active collection
      const staffPath = `artifacts/${appId}/public/data/societies/${user?.uid}/Staff/${member.id}`;
      await deleteDoc(doc(db, staffPath));

      // 4. UI Update
      setMembers((prev) => prev.filter((m) => m.id !== member.id));

      Toast.show({
        type: driveArchived ? "success" : "info",
        text1: driveArchived ? "Staff Archived" : "Staff Removed (Local)",
        text2: driveArchived
          ? "Data and Drive documents moved."
          : "Firestore archived. Drive folder could not be moved.",
      });
    } catch (error: any) {
      console.error("Archive failed:", error);
      Alert.alert("Error", "Failed to archive staff.");
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
                placeholder="e.g. Supervisor"
                value={otherPosition}
                onChangeText={setOtherPosition}
              />
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Phone Number *</Text>
            <TextInput
              style={[
                styles.input,
                formErrors.phone ? styles.inputError : null,
              ]}
              placeholder="10 digit number"
              value={phone}
              onChangeText={handlePhoneChange}
              keyboardType="phone-pad"
              maxLength={10}
            />
            {formErrors.phone ? (
              <Text style={styles.errorText}>{formErrors.phone}</Text>
            ) : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email (Optional, @gmail.com)</Text>
            <TextInput
              style={[
                styles.input,
                formErrors.email ? styles.inputError : null,
              ]}
              placeholder="ramesh@gmail.com"
              value={email}
              onChangeText={handleEmailChange}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            {formErrors.email ? (
              <Text style={styles.errorText}>{formErrors.email}</Text>
            ) : null}
          </View>

          <View style={styles.uploadSection}>
            <Text style={styles.label}>
              Documents (png/jpg/pdf only, Max 500KB)
            </Text>
            <View style={styles.uploadRow}>
              <View style={styles.uploadWrapper}>
                <TouchableOpacity
                  style={styles.uploadBox}
                  onPress={() =>
                    !photo && handleDocumentChange("photo", "pick")
                  }
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
                      <Ionicons name="create" size={14} color="white" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.overlayBtn, styles.deleteOverlay]}
                      onPress={() => handleDocumentChange("photo", "delete")}
                    >
                      <Ionicons name="trash" size={14} color="white" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <View style={styles.uploadWrapper}>
                <TouchableOpacity
                  style={styles.uploadBox}
                  onPress={() =>
                    !idCard && handleDocumentChange("idCard", "pick")
                  }
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
                      />
                    )
                  ) : (
                    <View style={styles.uploadPlaceholder}>
                      <Text style={styles.uploadIcon}>💳</Text>
                      <Text style={styles.uploadLabel}>ID Card</Text>
                    </View>
                  )}
                </TouchableOpacity>
                {idCard && (
                  <View style={styles.overlayControls}>
                    <TouchableOpacity
                      style={[styles.overlayBtn, styles.editOverlay]}
                      onPress={() => handleDocumentChange("idCard", "pick")}
                    >
                      <Ionicons name="create" size={14} color="white" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.overlayBtn, styles.deleteOverlay]}
                      onPress={() => handleDocumentChange("idCard", "delete")}
                    >
                      <Ionicons name="trash" size={14} color="white" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <View style={styles.uploadWrapper}>
                <TouchableOpacity
                  style={styles.uploadBox}
                  onPress={() =>
                    !addressProof &&
                    handleDocumentChange("addressProof", "pick")
                  }
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
                      />
                    )
                  ) : (
                    <View style={styles.uploadPlaceholder}>
                      <Text style={styles.uploadIcon}>🏠</Text>
                      <Text style={styles.uploadLabel}>Address</Text>
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
                      <Ionicons name="create" size={14} color="white" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.overlayBtn, styles.deleteOverlay]}
                      onPress={() =>
                        handleDocumentChange("addressProof", "delete")
                      }
                    >
                      <Ionicons name="trash" size={14} color="white" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.addBtn,
              (saving || !!formErrors.phone || !!formErrors.email) &&
                styles.disabledBtn,
            ]}
            onPress={handleAddOrUpdateStaff}
            disabled={saving || !!formErrors.phone || !!formErrors.email}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.addBtnText}>
                {editingId ? "Update Staff" : "Add Staff Member"}
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
                setPhoto(null);
                setIdCard(null);
                setAddressProof(null);
              }}
            >
              <Text style={styles.cancelBtnText}>Cancel Edit</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.listSection}>
          <Text style={styles.sectionTitle}>
            Active Staff ({members.length})
          </Text>
          {members.map((member) => (
            <View key={member.id} style={styles.memberCard}>
              <View style={styles.memberHeader}>
                {member.photo ? (
                  member.photo.startsWith("data:application/pdf") ? (
                    <View
                      style={[
                        styles.memberAvatar,
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
                      source={{ uri: member.photo }}
                      style={styles.memberAvatar}
                    />
                  )
                ) : (
                  <View style={[styles.memberAvatar, styles.placeholderAvatar]}>
                    <Text style={styles.avatarText}>
                      {member.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{member.name}</Text>
                  <Text style={styles.memberMeta}>
                    {member.position} • {member.shift + " Shift"}
                  </Text>
                  <Text style={styles.memberContact}>📞 {member.phone}</Text>
                </View>
              </View>
              <View style={styles.memberActions}>
                <TouchableOpacity
                  onPress={() => handleEditStaff(member)}
                  style={styles.editBtn}
                >
                  <Text style={styles.editBtnText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDeleteStaff(member)}
                  style={styles.deleteBtn}
                >
                  <Text style={styles.deleteBtnText}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F9" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { padding: 24, paddingTop: 60, backgroundColor: "#fff" },
  backBtn: { marginBottom: 12 },
  backBtnText: { color: "#3B82F6", fontSize: 16, fontWeight: "600" },
  title: { fontSize: 26, fontWeight: "800", color: "#0F172A" },
  formSection: {
    margin: 20,
    padding: 20,
    backgroundColor: "#fff",
    borderRadius: 20,
    elevation: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 16,
  },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: "#475569", marginBottom: 6 },
  input: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
  },
  inputError: { borderColor: "#EF4444", backgroundColor: "#FFF1F2" },
  errorText: {
    color: "#EF4444",
    fontSize: 11,
    marginTop: 4,
    fontWeight: "600",
  },
  row: { flexDirection: "row", gap: 12, marginBottom: 16 },
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
  dropdownText: { fontSize: 15, color: "#1E293B" },
  dropdownListContainer: {
    position: "absolute",
    top: 75,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    elevation: 10,
    zIndex: 2000,
    maxHeight: 180,
  },
  dropdownList: { padding: 4 },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  uploadSection: { marginBottom: 20 },
  uploadRow: { flexDirection: "row", gap: 10 },
  uploadWrapper: { flex: 1, aspectRatio: 1, position: "relative" },
  uploadBox: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#CBD5E1",
    borderRadius: 12,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  uploadPlaceholder: { alignItems: "center" },
  uploadIcon: { fontSize: 22, marginBottom: 2 },
  uploadLabel: { fontSize: 10, color: "#64748B", fontWeight: "600" },
  previewImage: { width: "100%", height: "100%" },
  overlayControls: {
    position: "absolute",
    top: 4,
    right: 4,
    flexDirection: "row",
    gap: 4,
  },
  overlayBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    elevation: 2,
  },
  editOverlay: { backgroundColor: "#3B82F6" },
  deleteOverlay: { backgroundColor: "#EF4444" },
  addBtn: {
    backgroundColor: "#0F172A",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  addBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  disabledBtn: { opacity: 0.5 },
  cancelBtn: { marginTop: 12, padding: 8, alignItems: "center" },
  cancelBtnText: { color: "#64748B", fontWeight: "600" },
  listSection: { paddingHorizontal: 20 },
  memberCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    elevation: 2,
  },
  memberHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  memberAvatar: { width: 50, height: 50, borderRadius: 25 },
  placeholderAvatar: {
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  avatarText: { fontSize: 20, fontWeight: "700" },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 16, fontWeight: "700", color: "#1E293B" },
  memberMeta: {
    fontSize: 13,
    color: "#3B82F6",
    fontWeight: "600",
    marginTop: 2,
  },
  memberContact: { fontSize: 12, color: "#64748B", marginTop: 2 },
  memberActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 16,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  editBtn: { padding: 4 },
  editBtnText: { color: "#3B82F6", fontWeight: "700" },
  deleteBtn: { padding: 4 },
  deleteBtnText: { color: "#EF4444", fontWeight: "700" },
});
