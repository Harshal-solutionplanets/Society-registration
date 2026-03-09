import { appId, db } from "@/configs/firebaseConfig";
import { useAuth } from "@/hooks/useAuth";
import {
  refreshDriveToken,
  syncResidentStaffWithDrive,
  syncStaffDocsWithDrive,
} from "@/utils/driveHealthCheck";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { useRouter } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
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

const ResidentStaffLoader = () => {
  const [msgIndex, setMsgIndex] = useState(0);
  const messages = [
    "Syncing with society...",
    "Uploading to cloud...",
    "Finalizing profile...",
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % messages.length);
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <ActivityIndicator color="#fff" size="small" />
      <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>
        {messages[msgIndex]}
      </Text>
    </View>
  );
};

export default function ResidentStaff() {
  const { user } = useAuth();
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);

  const handleBack = () => {
    if (!user) {
      router.replace("/");
    } else {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/resident/dashboard");
      }
    }
  };
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

  // ── Mode 2: Select Existing Staff ──
  const [addMode, setAddMode] = useState<"new" | "existing">("new");
  const [registryStaff, setRegistryStaff] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<any>(null);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);

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
    setSelectedProfile(null);
    setSelectedCategory("");
    setShowCategoryDropdown(false);
    setShowProfileDropdown(false);
  };

  const closeAllDropdowns = () => {
    setShowCategoryDropdown(false);
    setShowProfileDropdown(false);
    setShowTypeDropdown(false);
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
      const folderId = createData.id;

      // Set permission to "Anyone with the link"
      await setFolderPublic(folderId, token);

      return folderId;
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

        // Drive Health Check: Triggered by data change
        if (staff.length > 0 && !isCheckingHealth) {
          const performHealthCheck = async () => {
            const adminUID = sessionData?.adminUID;
            const unitId = sessionData?.id;
            if (!adminUID || !unitId) return;

            setIsCheckingHealth(true);
            try {
              let token = sessionData.driveAccessToken;
              if (!token) {
                token = await refreshDriveToken(adminUID);
                if (token) {
                  const updated = { ...sessionData, driveAccessToken: token };
                  setSessionData(updated);
                  await AsyncStorage.setItem(
                    "resident_session",
                    JSON.stringify(updated),
                  );
                }
              }
              if (!token) return;

              // 1. Check for profile deletions
              const staffNotifs = await syncResidentStaffWithDrive(
                adminUID,
                unitId,
                staff,
                token,
              );

              // 2. Check for individual document deletions
              const docNotifs = await syncStaffDocsWithDrive(
                adminUID,
                unitId,
                staff,
                token,
              );

              // Combined notifications
              const allNotifs = [...staffNotifs, ...docNotifs];
              allNotifs.forEach((n) => {
                Toast.show({
                  type: n.type === "DOC_DELETED" ? "info" : "error",
                  text1: n.title,
                  text2: n.message,
                  visibilityTime: 5000,
                });
              });
            } finally {
              setIsCheckingHealth(false);
            }
          };
          performHealthCheck();
        }

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
            Toast.show({
              type: "error",
              text1: "File Too Large",
              text2: "Maximum file size is 220KB.",
            });
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
        const societyPath = `artifacts/${appId}/public/data/societies/${adminUID}/Residents/${unitId}/StaffMembers/${editingId}`;

        const existingMember = staffList.find((s) => s.id === editingId);
        const auditObj = {
          lastEditedBy: user.uid,
          lastEditedUnit: unitId,
          lastEditedAt: new Date().toISOString(),
          lastEditField: type,
        };

        const updateObj = {
          [type]: newValue || "",
          updatedAt: new Date().toISOString(),
          ...auditObj,
        };

        await setDoc(doc(db, societyPath), updateObj, { merge: true });

        // 1.5 Update Registry if linked
        if (existingMember?.sourceRegistryId) {
          const registryId = existingMember.sourceRegistryId;
          const registryPath = `artifacts/${appId}/public/data/societies/${adminUID}/Resident_Staff/${registryId}`;

          // Fetch existing registry data for audit BEFORE updating
          const prevRegSnap = await getDoc(doc(db, registryPath));
          const prevRegData = prevRegSnap.exists() ? prevRegSnap.data() : {};

          await setDoc(doc(db, registryPath), updateObj, { merge: true });

          // CREATE AUDIT LOG for immediate document change
          try {
            const previousValue = prevRegData[type] || "";
            if (previousValue || newValue) {
              const auditLogRef = collection(
                db,
                `artifacts/${appId}/public/data/societies/${adminUID}/Resident_Staff_Audit/${registryId}/Logs`,
              );
              await addDoc(auditLogRef, {
                editedBy: user.uid,
                editedUnit: unitId,
                editedAt: auditObj.lastEditedAt,
                changedFields: type,
                previousData: { [type]: previousValue },
                timestamp: serverTimestamp(),
              });
            }
          } catch (auditErr) {
            console.warn("Immediate doc audit log failed:", auditErr);
          }

          // CRITICAL SYNC: Propagate immediate file update to other linked units
          try {
            const registrySnap = await getDoc(doc(db, registryPath));
            if (registrySnap.exists()) {
              const linkedUnits = registrySnap.data().linkedUnits || [];
              for (const lUnitId of linkedUnits) {
                if (lUnitId === unitId) continue;
                const otherUnitStaffRef = collection(
                  db,
                  `artifacts/${appId}/public/data/societies/${adminUID}/Residents/${lUnitId}/StaffMembers`,
                );
                const q = query(
                  otherUnitStaffRef,
                  where("sourceRegistryId", "==", registryId),
                );
                const otherStaffSnap = await getDocs(q);
                for (const otherDoc of otherStaffSnap.docs) {
                  await updateDoc(otherDoc.ref, updateObj);
                }
              }
            }
          } catch (syncErr) {
            console.warn("Immediate file sync to other units failed:", syncErr);
          }
        }

        // 2. Drive Update (if photo picked or deleted)
        if (flatFolderId) {
          const baseName =
            type === "photo"
              ? "Photo"
              : type === "idCard"
                ? "ID_Card"
                : "Address_Proof";
          const currentStaffFolderId = existingMember?.driveFolderId;

          if (newValue) {
            // Upload new file (original form)
            const newFolderId = await uploadImageToDrive(
              newValue,
              fileName,
              flatFolderId,
            );

            // If we just got a folder ID for the first time, persist it
            if (newFolderId && !currentStaffFolderId) {
              const driveUpdate = { driveFolderId: newFolderId };
              await setDoc(doc(db, societyPath), driveUpdate, { merge: true });
              if (existingMember?.sourceRegistryId) {
                const registryId = existingMember.sourceRegistryId;
                const regRef = doc(
                  db,
                  `artifacts/${appId}/public/data/societies/${adminUID}/Resident_Staff/${registryId}`,
                );
                await setDoc(regRef, driveUpdate, { merge: true });
              }
            }
          } else {
            // Delete mode
            await deleteResFile(
              `${baseName}.jpg`,
              flatFolderId,
              currentStaffFolderId,
            ).catch(() => {});
            await deleteResFile(
              `${baseName}.pdf`,
              flatFolderId,
              currentStaffFolderId,
            ).catch(() => {});
            await deleteResFile(
              `${baseName}.png`,
              flatFolderId,
              currentStaffFolderId,
            ).catch(() => {});
            await deleteResFile(
              `${baseName}.jpeg`,
              flatFolderId,
              currentStaffFolderId,
            ).catch(() => {});
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

  // Drag and Drop handler for web
  const handleFileDrop = async (
    file: File,
    type: "photo" | "idCard" | "addressProof",
  ) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/jpg",
      "application/pdf",
    ];
    if (!allowedTypes.includes(file.type)) {
      Toast.show({
        type: "error",
        text1: "Invalid File",
        text2: "Only jpg, png, jpeg, or pdf files allowed.",
      });
      return;
    }
    // Size check: 220KB = 225280 bytes
    if (file.size > 225280) {
      Toast.show({
        type: "error",
        text1: "File Too Large",
        text2: "Maximum file size is 220KB.",
      });
      return;
    }
    const base64String = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });

    // Update state
    if (type === "photo") setPhoto(base64String);
    else if (type === "idCard") setIdCard(base64String);
    else if (type === "addressProof") setAddressProof(base64String);

    // If editing existing record, sync immediately (same logic as handleDocumentChange)
    if (editingId && sessionData && user) {
      const { adminUID, id: unitId, driveFolderId: flatFolderId } = sessionData;
      const isPdf = base64String.startsWith("data:application/pdf");
      const ext = isPdf ? ".pdf" : ".jpg";
      const fileName =
        type === "photo"
          ? `Photo${ext}`
          : type === "idCard"
            ? `ID_Card${ext}`
            : `Address_Proof${ext}`;
      try {
        const existingMember = staffList.find((s) => s.id === editingId);
        const auditObj = {
          lastEditedBy: user.uid,
          lastEditedUnit: unitId,
          lastEditedAt: new Date().toISOString(),
          lastEditField: type,
        };

        const updateObj = {
          [type]: base64String,
          updatedAt: new Date().toISOString(),
          ...auditObj,
        };
        const societyPath = `artifacts/${appId}/public/data/societies/${adminUID}/Residents/${unitId}/StaffMembers/${editingId}`;
        await setDoc(doc(db, societyPath), updateObj, { merge: true });

        // Sync to registry
        if (existingMember?.sourceRegistryId) {
          const registryId = existingMember.sourceRegistryId;
          const registryPath = `artifacts/${appId}/public/data/societies/${adminUID}/Resident_Staff/${registryId}`;

          // Fetch existing registry data for audit BEFORE updating
          const prevRegSnap = await getDoc(doc(db, registryPath));
          const prevRegData = prevRegSnap.exists() ? prevRegSnap.data() : {};

          await setDoc(doc(db, registryPath), updateObj, { merge: true });

          // CREATE AUDIT LOG for drag-drop document change
          try {
            const previousValue = prevRegData[type] || "";
            if (previousValue || base64String) {
              const auditLogRef = collection(
                db,
                `artifacts/${appId}/public/data/societies/${adminUID}/Resident_Staff_Audit/${registryId}/Logs`,
              );
              await addDoc(auditLogRef, {
                editedBy: user.uid,
                editedUnit: unitId,
                editedAt: auditObj.lastEditedAt,
                changedFields: type,
                previousData: { [type]: previousValue },
                timestamp: serverTimestamp(),
              });
            }
          } catch (auditErr) {
            console.warn("DropZone audit log failed:", auditErr);
          }

          // SYNC BACK: Update all other units linked to this registry profile
          try {
            const registrySnap = await getDoc(doc(db, registryPath));
            if (registrySnap.exists()) {
              const linkedUnits = registrySnap.data().linkedUnits || [];
              for (const lUnitId of linkedUnits) {
                if (lUnitId === unitId) continue;
                const otherUnitRef = collection(
                  db,
                  `artifacts/${appId}/public/data/societies/${adminUID}/Residents/${lUnitId}/StaffMembers`,
                );
                const q = query(
                  otherUnitRef,
                  where("sourceRegistryId", "==", registryId),
                );
                const otherSnap = await getDocs(q);
                for (const oDoc of otherSnap.docs) {
                  await updateDoc(oDoc.ref, updateObj);
                }
              }
            }
          } catch (syncErr) {
            console.warn("DropZone sync to other units failed:", syncErr);
          }
        }

        if (flatFolderId) {
          const baseName =
            type === "photo"
              ? "Photo"
              : type === "idCard"
                ? "ID_Card"
                : "Address_Proof";
          const currentStaffFolderId = existingMember?.driveFolderId;

          const newFolderId = await uploadImageToDrive(
            base64String,
            fileName,
            flatFolderId,
          );

          // If we just got a folder ID for the first time, persist it
          if (newFolderId && !currentStaffFolderId) {
            const driveUpdate = { driveFolderId: newFolderId };
            await setDoc(doc(db, societyPath), driveUpdate, { merge: true });
            if (existingMember?.sourceRegistryId) {
              const registryId = existingMember.sourceRegistryId;
              const regRef = doc(
                db,
                `artifacts/${appId}/public/data/societies/${adminUID}/Resident_Staff/${registryId}`,
              );
              await setDoc(regRef, driveUpdate, { merge: true });
            }
          }
        }
        Toast.show({
          type: "success",
          text1: "Auto-synced",
          text2: `${type} updated via drag & drop.`,
        });
      } catch (err: any) {
        console.error("Drag-drop sync failed:", err);
      }
    }
  };

  // Web-only: Wrapper for upload boxes (Drag & drop removed as requested)
  const DropZoneWrapper = ({
    type,
    children,
  }: {
    type: "photo" | "idCard" | "addressProof";
    children: React.ReactNode;
  }) => {
    return <View style={styles.uploadWrapper}>{children}</View>;
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

  // ── Mode 2: Fetch registry staff by category ──
  const fetchRegistryByCategory = async (category: string) => {
    if (!sessionData) return;
    setIsLoadingProfiles(true);
    try {
      const { adminUID } = sessionData;
      const registryRef = collection(
        db,
        `artifacts/${appId}/public/data/societies/${adminUID}/Resident_Staff`,
      );
      const q = query(registryRef, where("staffType", "==", category));
      const snapshot = await getDocs(q);
      const profiles = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setRegistryStaff(profiles);
    } catch (err) {
      console.error("Fetch registry error:", err);
      setRegistryStaff([]);
    } finally {
      setIsLoadingProfiles(false);
    }
  };

  // ── Mode 2: Link existing profile to this resident ──
  const handleLinkExisting = async () => {
    if (!selectedProfile || !user || !sessionData) return;

    // Check 12 staff limit
    if (staffList.length >= 12) {
      Toast.show({
        type: "error",
        text1: "12 staff limit",
        text2: "You cannot add more than 12 staff profiles.",
      });
      return;
    }

    // Check if already linked
    const alreadyLinked = staffList.some(
      (s) => s.sourceRegistryId === selectedProfile.id,
    );
    if (alreadyLinked) {
      Toast.show({
        type: "info",
        text1: "Already Added",
        text2: `${selectedProfile.staffName} is already in your household staff.`,
      });
      return;
    }

    setIsUploading(true);
    try {
      const { adminUID, id: unitId } = sessionData;
      const linkId = `link_${selectedProfile.id}_${Date.now()}`;

      const linkedData = {
        id: linkId,
        staffName: selectedProfile.staffName,
        staffType: selectedProfile.staffType,
        contact: selectedProfile.contact,
        nativePlace: selectedProfile.nativePlace || "",
        guardianName: selectedProfile.guardianName || "",
        guardianContact: selectedProfile.guardianContact || "",
        guardianAddress: selectedProfile.guardianAddress || "",
        photo: selectedProfile.photo || "",
        idCard: selectedProfile.idCard || "",
        addressProof: selectedProfile.addressProof || "",
        sourceRegistryId: selectedProfile.id,
        linkedBy: user.uid,
        adminUID,
        unitId,
        driveFolderId: selectedProfile.driveFolderId || "",
        uploadedAt: new Date().toISOString(),
        // Migration/Consistency: Carry forward original creation info
        createdAt: selectedProfile.createdAt || new Date().toISOString(),
        createdUnitName: selectedProfile.createdUnitName || "N/A",
        createdWingName: selectedProfile.createdWingName || "N/A",
        createdFloorName: selectedProfile.createdFloorName || "N/A",
        createdInUnit:
          selectedProfile.createdInUnit || selectedProfile.unitId || "N/A",
      };

      // Write to resident's StaffMembers
      const societyStaffPath = `artifacts/${appId}/public/data/societies/${adminUID}/Residents/${unitId}/StaffMembers/${linkId}`;
      await setDoc(doc(db, societyStaffPath), linkedData);

      // Update linked count on the registry profile
      const registryDocRef = doc(
        db,
        `artifacts/${appId}/public/data/societies/${adminUID}/Resident_Staff/${selectedProfile.id}`,
      );
      const registrySnap = await getDoc(registryDocRef);
      if (registrySnap.exists()) {
        const currentLinked = registrySnap.data().linkedUnits || [];
        if (!currentLinked.includes(unitId)) {
          await updateDoc(registryDocRef, {
            linkedUnits: [...currentLinked, unitId],
          });
        }
      }

      // Increment staff count on Resident doc and Wing doc
      const residentRef = doc(
        db,
        `artifacts/${appId}/public/data/societies/${adminUID}/Residents/${unitId}`,
      );
      const wingDocPath = `artifacts/${appId}/public/data/societies/${adminUID}/wings/${sessionData.wingId}/${sessionData.floorNumber}/${unitId}`;
      const wingRef = doc(db, wingDocPath);

      const countUpdate = { staffMembers: increment(1) };
      await updateDoc(residentRef, countUpdate).catch((e) =>
        console.warn("Failed to update resident count:", e),
      );
      await updateDoc(wingRef, countUpdate).catch((e) =>
        console.warn("Failed to update wing count:", e),
      );

      Toast.show({
        type: "success",
        text1: "Staff Linked",
        text2: `${selectedProfile.staffName} added to your household.`,
      });
      resetForm();
    } catch (error: any) {
      console.error("Link Error:", error);
      Alert.alert("Error", error.message);
    } finally {
      setIsUploading(false);
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

    if (!editingId && staffList.length >= 12) {
      Toast.show({
        type: "error",
        text1: "12 staff limit",
        text2: "You have reached the maximum allowed staff profiles.",
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
            // SKIP if document has NOT changed from existing version
            if (currentBase64 === originalValue) return;
            if (!currentBase64 && !originalValue) return;

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

            // Cleanup old versions from Drive only if document actually changed
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

            // Upload new document only if we have one
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
              if (!staffFolderId) staffFolderId = fid;
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

      // If staff name changed, rename the Drive folder to match
      if (editingId && staffFolderId) {
        const existingStaff = staffList.find((s) => s.id === editingId);
        if (existingStaff && existingStaff.staffName !== staffName) {
          try {
            const backendUrl =
              process.env.EXPO_PUBLIC_BACKEND_URL || "http://localhost:3001";
            await fetch(`${backendUrl}/api/drive/rename-staff-folder`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                adminUID,
                appId,
                staffFolderId,
                newName: staffName,
              }),
            });
          } catch (renameErr) {
            console.warn("Drive folder rename failed:", renameErr);
          }
        }
      }

      // Compute audit trail for edits
      let auditFields: Record<string, any> = {};
      if (editingId) {
        const existingMember = staffList.find((s) => s.id === editingId);
        if (existingMember) {
          const changedFields: string[] = [];
          if (existingMember.staffName !== staffName)
            changedFields.push("staffName");
          if (existingMember.staffType !== finalStaffType)
            changedFields.push("staffType");
          if (existingMember.contact !== contact) changedFields.push("contact");
          if (existingMember.nativePlace !== nativePlace)
            changedFields.push("nativePlace");
          if (existingMember.guardianName !== guardianName)
            changedFields.push("guardianName");
          if (existingMember.guardianContact !== guardianContact)
            changedFields.push("guardianContact");
          if (existingMember.guardianAddress !== guardianAddress)
            changedFields.push("guardianAddress");
          if (existingMember.photo !== photo) changedFields.push("photo");
          if (existingMember.idCard !== (idCard || ""))
            changedFields.push("idCard");
          if (existingMember.addressProof !== (addressProof || ""))
            changedFields.push("addressProof");

          if (changedFields.length > 0) {
            auditFields = {
              lastEditedBy: user.uid,
              lastEditedUnit: unitId,
              lastEditedAt: new Date().toISOString(),
              lastEditField: changedFields.join(", "),
            };
          }
        }
      }

      // IDENTITY PERSISTENCE:
      // Check if a profile with this contact already exists in the registry to preserve creation info
      let registryIdToSync = editingId
        ? staffList.find((s) => s.id === editingId)?.sourceRegistryId
        : null;
      let registryExistingData: any = {};

      if (!registryIdToSync) {
        const globalRegistryRef = collection(
          db,
          `artifacts/${appId}/public/data/societies/${adminUID}/Resident_Staff`,
        );
        const contactQuery = query(
          globalRegistryRef,
          where("contact", "==", contact),
        );
        const contactSnap = await getDocs(contactQuery);
        if (!contactSnap.empty) {
          const matchedDoc = contactSnap.docs[0];
          registryIdToSync = matchedDoc.id;
          registryExistingData = matchedDoc.data();
        }
      } else {
        const regDoc = await getDoc(
          doc(
            db,
            `artifacts/${appId}/public/data/societies/${adminUID}/Resident_Staff/${registryIdToSync}`,
          ),
        );
        if (regDoc.exists()) registryExistingData = regDoc.data();
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
        uploadedAt: editingId
          ? staffList.find((s) => s.id === editingId)?.uploadedAt ||
            new Date().toISOString()
          : new Date().toISOString(),
        // Capture original creation metadata - Prefer existing registry data
        createdAt:
          registryExistingData?.createdAt ||
          (editingId
            ? staffList.find((s) => s.id === editingId)?.createdAt ||
              new Date().toISOString()
            : new Date().toISOString()),
        createdUnitName:
          registryExistingData?.createdUnitName ||
          (editingId
            ? staffList.find((s) => s.id === editingId)?.createdUnitName ||
              sessionData.unitName ||
              "N/A"
            : sessionData.unitName || "N/A"),
        createdWingName:
          registryExistingData?.createdWingName ||
          (editingId
            ? staffList.find((s) => s.id === editingId)?.createdWingName ||
              sessionData.wingName ||
              "N/A"
            : sessionData.wingName || "N/A"),
        createdFloorName:
          registryExistingData?.createdFloorName ||
          (editingId
            ? staffList.find((s) => s.id === editingId)?.createdFloorName ||
              sessionData.floorName ||
              "N/A"
            : sessionData.floorName || "N/A"),
        createdInUnit:
          registryExistingData?.createdInUnit ||
          (editingId
            ? staffList.find((s) => s.id === editingId)?.createdInUnit || unitId
            : unitId),
        sourceRegistryId: registryIdToSync || "",
        ...auditFields,
      };

      // 1. Store in Society collection (Requested location)
      const societyStaffPath = `artifacts/${appId}/public/data/societies/${adminUID}/Residents/${unitId}/StaffMembers/${staffId}`;
      await setDoc(doc(db, societyStaffPath), staffData, { merge: true });

      // 3. Upsert into Resident_Staff registry (source of truth for cross-resident reuse)
      try {
        const societyAdminUID = adminUID || sessionData.adminUID;
        let registryId = staffData.sourceRegistryId;
        const registryRef = collection(
          db,
          `artifacts/${appId}/public/data/societies/${societyAdminUID}/Resident_Staff`,
        );

        if (!registryId) {
          registryId = `reg_${contact}_${societyAdminUID}`;
        }

        // Fetch existing data again to ensure updated linkedUnits
        const regDocRef = doc(
          db,
          `artifacts/${appId}/public/data/societies/${societyAdminUID}/Resident_Staff/${registryId}`,
        );
        const regDocSnap = await getDoc(regDocRef);
        const existingData = regDocSnap.exists() ? regDocSnap.data() : {};

        const currentLinked = existingData.linkedUnits || [];
        const updatedLinked = currentLinked.includes(unitId)
          ? currentLinked
          : [...currentLinked, unitId];

        const registryData = {
          id: registryId,
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
          driveFolderId: staffFolderId,
          linkedUnits: updatedLinked,
          // Sync creation info to registry for all to see
          createdAt: staffData.createdAt,
          createdInUnit: staffData.createdInUnit,
          createdUnitName: staffData.createdUnitName,
          createdWingName: staffData.createdWingName,
          createdFloorName: staffData.createdFloorName,
          ...auditFields,
        };

        // CREATE AUDIT LOG ENTRY (History)  Only store CHANGED values
        if (auditFields.lastEditedAt) {
          const changedFieldList = (auditFields.lastEditField || "").split(
            ", ",
          );
          const previousData: Record<string, any> = {};
          for (const field of changedFieldList) {
            if (field && existingData[field] !== undefined) {
              previousData[field] = existingData[field] || "";
            }
          }

          const auditLogRef = collection(
            db,
            `artifacts/${appId}/public/data/societies/${societyAdminUID}/Resident_Staff_Audit/${registryId}/Logs`,
          );
          await addDoc(auditLogRef, {
            editedBy: user.uid,
            editedUnit: unitId,
            editedAt: auditFields.lastEditedAt,
            changedFields: auditFields.lastEditField,
            previousData,
            timestamp: serverTimestamp(),
          });
        }

        await setDoc(regDocRef, registryData, { merge: true });

        // Store the sourceRegistryId back on the resident's copy if it was freshly generated
        if (!staffData.sourceRegistryId) {
          await updateDoc(doc(db, societyStaffPath), {
            sourceRegistryId: registryId,
          });
        }

        // CRITICAL SYNC: Propagate shared profile data to ALL linked units
        // IMPORTANT: Only sync shared fields, never overwrite unit-specific fields (id, unitId, linkedBy, uploadedBy)
        try {
          const linkedUnits = updatedLinked;
          const sharedUpdate = {
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
            driveFolderId: staffFolderId,
            // Propagate creation info to all linked units
            createdAt: staffData.createdAt,
            createdInUnit: staffData.createdInUnit,
            createdUnitName: staffData.createdUnitName,
            createdWingName: staffData.createdWingName,
            createdFloorName: staffData.createdFloorName,
            ...auditFields,
            updatedAt: new Date().toISOString(),
          };

          for (const lUnitId of linkedUnits) {
            if (lUnitId === unitId) continue;

            const otherUnitStaffPath = collection(
              db,
              `artifacts/${appId}/public/data/societies/${societyAdminUID}/Residents/${lUnitId}/StaffMembers`,
            );
            const q = query(
              otherUnitStaffPath,
              where("sourceRegistryId", "==", registryId),
            );
            const otherStaffSnap = await getDocs(q);

            for (const otherDoc of otherStaffSnap.docs) {
              await updateDoc(otherDoc.ref, sharedUpdate);
            }
          }
        } catch (syncErr) {
          console.error("Propagation sync failed:", syncErr);
        }

        console.log(
          "DEBUG: Resident_Staff registry updated successfully at:",
          registryId,
        );
      } catch (regErr) {
        console.error("CRITICAL: Registry upsert failed:", regErr);
      }

      if (!editingId) {
        // Increment staff count in both Resident and Wing documents
        const residentRef = doc(
          db,
          `artifacts/${appId}/public/data/societies/${adminUID}/Residents/${unitId}`,
        );
        const wingDocPath = `artifacts/${appId}/public/data/societies/${adminUID}/wings/${sessionData.wingId}/${sessionData.floorNumber}/${unitId}`;
        const wingRef = doc(db, wingDocPath);

        const countUpdate = { staffMembers: increment(1) };
        await updateDoc(residentRef, countUpdate).catch((e) =>
          console.warn("Failed to update resident count:", e),
        );
        await updateDoc(wingRef, countUpdate).catch((e) =>
          console.warn("Failed to update wing count:", e),
        );
      }

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
            Alert.alert("Remove Staff", confirmMessage, [
              {
                text: "Cancel",
                style: "cancel",
                onPress: () => resolve(false),
              },
              {
                text: "Remove",
                style: "destructive",
                onPress: () => resolve(true),
              },
            ]);
          });

    if (!confirmDelete) return;

    setIsUploading(true);
    try {
      const { adminUID, id: unitId } = sessionData;
      const member = staffList.find((s) => s.id === staffId);

      if (!member) throw new Error("Staff member not found locally.");

      // If we are deleting the item currently being edited, reset the form
      if (editingId === staffId) {
        resetForm();
      }

      // Delink via Backend (Only removes Firestore link, no Drive moves)
      const backendUrl =
        process.env.EXPO_PUBLIC_BACKEND_URL || "http://localhost:3001";
      const res = await fetch(`${backendUrl}/api/drive/delink-resident-staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminUID,
          appId,
          unitId,
          staffId: member.id,
          sourceRegistryId: member.sourceRegistryId || "",
        }),
      });

      if (!res.ok) {
        let errorMsg = "Backend delink failed";
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

      // Decrement staff count on Resident doc and Wing doc
      const residentRef = doc(
        db,
        `artifacts/${appId}/public/data/societies/${adminUID}/Residents/${unitId}`,
      );
      const wingDocPath = `artifacts/${appId}/public/data/societies/${adminUID}/wings/${sessionData.wingId}/${sessionData.floorNumber}/${unitId}`;
      const wingRef = doc(db, wingDocPath);

      const countUpdate = { staffMembers: increment(-1) };
      await updateDoc(residentRef, countUpdate).catch((e) =>
        console.warn("Failed to update resident count:", e),
      );
      await updateDoc(wingRef, countUpdate).catch((e) =>
        console.warn("Failed to update wing count:", e),
      );

      Toast.show({ type: "info", text1: "Staff Removed Successfully" });
    } catch (error: any) {
      console.error("Delete Error:", error);
      Alert.alert("Removal Failed", error.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <View style={styles.mainContainer}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#14B8A6" />
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
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
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        nestedScrollEnabled={true}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={closeAllDropdowns}
          style={{ flex: 1, zIndex: 5000 }}
        >
          <View style={[styles.form, { zIndex: 5000, elevation: 5 }]}>
            {/* Mode Toggle Tabs (hidden when editing) */}
            {!editingId && (
              <View style={styles.modeTabs}>
                <TouchableOpacity
                  style={[
                    styles.modeTab,
                    addMode === "new" && styles.modeTabActive,
                  ]}
                  onPress={() => {
                    setAddMode("new");
                    resetForm();
                  }}
                >
                  <Ionicons
                    name="person-add-outline"
                    size={16}
                    color={addMode === "new" ? "#FFFFFF" : "#64748B"}
                  />
                  <Text
                    style={[
                      styles.modeTabText,
                      addMode === "new" && styles.modeTabTextActive,
                    ]}
                  >
                    Add New Staff
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modeTab,
                    addMode === "existing" && styles.modeTabActive,
                  ]}
                  onPress={() => {
                    setAddMode("existing");
                    resetForm();
                  }}
                >
                  <Ionicons
                    name="people-outline"
                    size={16}
                    color={addMode === "existing" ? "#FFFFFF" : "#64748B"}
                  />
                  <Text
                    style={[
                      styles.modeTabText,
                      addMode === "existing" && styles.modeTabTextActive,
                    ]}
                  >
                    Select Existing
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.sectionTitle}>
              {editingId
                ? "Edit Staff Details"
                : addMode === "new"
                  ? "Register New Staff"
                  : "Select from Registered Staff"}
            </Text>

            {/* ══════ MODE 2: Select Existing Staff ══════ */}
            {addMode === "existing" && !editingId && (
              <View>
                {/* Dropdown 1: Staff Category */}
                <View
                  style={[
                    styles.inputGroup,
                    { zIndex: showCategoryDropdown ? 3000 : 2000 },
                  ]}
                >
                  <Text style={styles.label}>Staff Category *</Text>
                  <TouchableOpacity
                    style={styles.dropdownButton}
                    onPress={() => {
                      setShowCategoryDropdown(!showCategoryDropdown);
                      setShowProfileDropdown(false);
                    }}
                  >
                    <Text style={styles.dropdownText}>
                      {selectedCategory || "Select Category"}
                    </Text>
                    <Ionicons
                      name={
                        showCategoryDropdown ? "chevron-up" : "chevron-down"
                      }
                      size={20}
                      color="#64748B"
                    />
                  </TouchableOpacity>
                  {showCategoryDropdown && (
                    <View style={styles.dropdownListContainer}>
                      <ScrollView
                        style={styles.dropdownList}
                        nestedScrollEnabled={true}
                      >
                        {STAFF_TYPES.filter((t) => t !== "Other").map(
                          (item) => (
                            <TouchableOpacity
                              key={item}
                              style={styles.dropdownItem}
                              onPress={() => {
                                setSelectedCategory(item);
                                setShowCategoryDropdown(false);
                                setSelectedProfile(null);
                                setRegistryStaff([]);
                                fetchRegistryByCategory(item);
                              }}
                            >
                              <Text
                                style={[
                                  styles.dropdownItemText,
                                  selectedCategory === item &&
                                    styles.activeDropdownText,
                                ]}
                              >
                                {item}
                              </Text>
                              {selectedCategory === item && (
                                <Ionicons
                                  name="checkmark"
                                  size={18}
                                  color="#14B8A6"
                                />
                              )}
                            </TouchableOpacity>
                          ),
                        )}
                      </ScrollView>
                    </View>
                  )}
                </View>

                {/* Dropdown 2: Staff Profiles */}
                {selectedCategory !== "" && (
                  <View
                    style={[
                      styles.inputGroup,
                      { zIndex: showProfileDropdown ? 2500 : 1500 },
                    ]}
                  >
                    <Text style={styles.label}>Select Staff Profile *</Text>
                    {isLoadingProfiles ? (
                      <ActivityIndicator
                        color="#14B8A6"
                        style={{ marginVertical: 12 }}
                      />
                    ) : registryStaff.length === 0 ? (
                      <View style={styles.emptyRegistry}>
                        <Ionicons
                          name="search-outline"
                          size={24}
                          color="#94A3B8"
                        />
                        <Text style={styles.emptyRegistryText}>
                          No registered {selectedCategory} staff found.
                        </Text>
                        <Text style={styles.emptyRegistryHint}>
                          Switch to Add New Staff to create one.
                        </Text>
                      </View>
                    ) : (
                      <>
                        <TouchableOpacity
                          style={styles.dropdownButton}
                          onPress={() => {
                            setShowProfileDropdown(!showProfileDropdown);
                            setShowCategoryDropdown(false);
                          }}
                        >
                          <Text style={styles.dropdownText}>
                            {selectedProfile
                              ? `${selectedProfile.staffName} (${selectedProfile.contact})`
                              : "Select Staff Profile"}
                          </Text>
                          <Ionicons
                            name={
                              showProfileDropdown
                                ? "chevron-up"
                                : "chevron-down"
                            }
                            size={20}
                            color="#64748B"
                          />
                        </TouchableOpacity>
                        {showProfileDropdown && (
                          <View style={styles.dropdownListContainer}>
                            <ScrollView
                              style={styles.dropdownList}
                              nestedScrollEnabled={true}
                            >
                              {registryStaff.map((profile) => (
                                <TouchableOpacity
                                  key={profile.id}
                                  style={styles.dropdownItem}
                                  onPress={() => {
                                    setSelectedProfile(profile);
                                    setShowProfileDropdown(false);
                                  }}
                                >
                                  <View>
                                    <Text
                                      style={[
                                        styles.dropdownItemText,
                                        { fontWeight: "700" },
                                      ]}
                                    >
                                      {profile.staffName}
                                    </Text>
                                    <Text
                                      style={{
                                        fontSize: 12,
                                        color: "#94A3B8",
                                      }}
                                    >
                                      <Ionicons name="call-outline" size={12} />{" "}
                                      {profile.contact}
                                      {profile.nativePlace ? ` � ` : ""}
                                      {profile.nativePlace && (
                                        <Ionicons
                                          name="location-outline"
                                          size={12}
                                        />
                                      )}
                                      {profile.nativePlace
                                        ? ` ${profile.nativePlace}`
                                        : ""}
                                    </Text>
                                  </View>
                                  {selectedProfile?.id === profile.id && (
                                    <Ionicons
                                      name="checkmark-circle"
                                      size={20}
                                      color="#14B8A6"
                                    />
                                  )}
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          </View>
                        )}
                      </>
                    )}
                  </View>
                )}

                {/* Preview Selected Profile */}
                {selectedProfile && (
                  <View style={styles.profilePreview}>
                    <View style={styles.profilePreviewHeader}>
                      {selectedProfile.photo &&
                      !selectedProfile.photo.startsWith(
                        "data:application/pdf",
                      ) ? (
                        <Image
                          source={{ uri: selectedProfile.photo }}
                          style={styles.previewAvatar}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.previewAvatarPlaceholder}>
                          <Text style={styles.previewAvatarText}>
                            {selectedProfile.staffName.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.previewName}>
                          {selectedProfile.staffName}
                        </Text>
                        <Text style={styles.previewDetail}>
                          Contact: {selectedProfile.contact}
                        </Text>
                        {selectedProfile.nativePlace ? (
                          <Text style={styles.previewDetail}>
                            Native Place: {selectedProfile.nativePlace}
                          </Text>
                        ) : null}
                        {selectedProfile.guardianName ? (
                          <Text style={styles.previewDetail}>
                            Guardian: {selectedProfile.guardianName}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.submitBtn,
                        isUploading && styles.disabledBtn,
                        { backgroundColor: "#14B8A6" },
                      ]}
                      onPress={handleLinkExisting}
                      disabled={isUploading}
                    >
                      {isUploading ? (
                        <View style={styles.loadingWrapper}>
                          <ActivityIndicator color="white" size="small" />
                          <Text style={styles.loadingText}>Linking...</Text>
                        </View>
                      ) : (
                        <Text style={styles.submitText}>
                          <Ionicons
                            name="checkmark-circle"
                            size={18}
                            color="white"
                          />{" "}
                          Add to My Household
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* ════╕═ MODE 1: Add New Staff (existing form) ══════ */}
            {(addMode === "new" || editingId) && (
              <View>
                <View style={styles.row}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.label}>Staff Name *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. Maya Devi"
                      value={staffName}
                      onChangeText={setStaffName}
                    />
                  </View>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.label}>Contact Number *</Text>
                    <TextInput
                      style={[
                        styles.input,
                        formErrors.contact ? styles.inputError : null,
                      ]}
                      value={contact}
                      onChangeText={handleContactChange}
                      keyboardType="phone-pad"
                      maxLength={10}
                    />
                    {formErrors.contact ? (
                      <Text style={styles.errorText}>{formErrors.contact}</Text>
                    ) : null}
                  </View>
                </View>

                <View
                  style={[
                    styles.row,
                    { zIndex: showTypeDropdown ? 3500 : 1000 },
                  ]}
                >
                  <View style={[styles.inputGroup, { flex: 1 }]}>
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
                                  staffType === item &&
                                    styles.activeDropdownText,
                                ]}
                              >
                                {item}
                              </Text>
                              {staffType === item && (
                                <Ionicons
                                  name="checkmark"
                                  size={18}
                                  color="#14B8A6"
                                />
                              )}
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>

                  <View style={[styles.inputGroup, { flex: 1, zIndex: 1 }]}>
                    <Text style={styles.label}>Native Place Address</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. Mohan Nagar, Nashik"
                      value={nativePlace}
                      onChangeText={setNativePlace}
                    />
                  </View>
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

                <View style={styles.divider} />

                <Text style={styles.subsectionTitle}>Guardian Details</Text>
                <View style={styles.row}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.label}>Guardian Name</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. Husband/Father Name"
                      value={guardianName}
                      onChangeText={setGuardianName}
                    />
                  </View>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.label}>Guardian Contact</Text>
                    <TextInput
                      style={[
                        styles.input,
                        formErrors.guardianContact ? styles.inputError : null,
                      ]}
                      placeholder="98772..."
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
                    style={[
                      styles.input,
                      { height: 80, textAlignVertical: "top" },
                    ]}
                    placeholder="Complete address of the guardian"
                    value={guardianAddress}
                    onChangeText={setGuardianAddress}
                    multiline
                  />
                </View>

                <View style={styles.divider} />

                <View style={styles.uploadSection}>
                  <Text style={styles.label}>
                    Staff Documents (jpg/png/jpeg/pdf only, Max 220KB)
                  </Text>
                  <View style={styles.uploadRow}>
                    {/* PHOTO UPLOAD */}
                    <DropZoneWrapper type="photo">
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
                            <Ionicons name="person" size={24} color="#14B8A6" />
                            <Text style={styles.uploadLabel}>Photo</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                      {photo && (
                        <View style={styles.overlayControls}>
                          <TouchableOpacity
                            style={[styles.overlayBtn, styles.editOverlay]}
                            onPress={() =>
                              handleDocumentChange("photo", "pick")
                            }
                          >
                            <Ionicons name="create" size={16} color="white" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.overlayBtn, styles.deleteOverlay]}
                            onPress={() =>
                              handleDocumentChange("photo", "delete")
                            }
                          >
                            <Ionicons name="trash" size={16} color="white" />
                          </TouchableOpacity>
                        </View>
                      )}
                    </DropZoneWrapper>

                    {/* ID CARD UPLOAD */}
                    <DropZoneWrapper type="idCard">
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
                            <Ionicons name="card" size={24} color="#0EA5E9" />
                            <Text style={styles.uploadLabel}>
                              Photo ID Proof
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                      {idCard && (
                        <View style={styles.overlayControls}>
                          <TouchableOpacity
                            style={[styles.overlayBtn, styles.editOverlay]}
                            onPress={() =>
                              handleDocumentChange("idCard", "pick")
                            }
                          >
                            <Ionicons name="create" size={16} color="white" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.overlayBtn, styles.deleteOverlay]}
                            onPress={() =>
                              handleDocumentChange("idCard", "delete")
                            }
                          >
                            <Ionicons name="trash" size={16} color="white" />
                          </TouchableOpacity>
                        </View>
                      )}
                    </DropZoneWrapper>

                    {/* ADDRESS PROOF UPLOAD */}
                    <DropZoneWrapper type="addressProof">
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
                            <Ionicons name="home" size={24} color="#F59E0B" />
                            <Text style={styles.uploadLabel}>
                              Address Proof
                            </Text>
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
                    </DropZoneWrapper>
                  </View>
                </View>

                <View style={styles.formButtons}>
                  <TouchableOpacity
                    style={[
                      styles.submitBtn,
                      isUploading && styles.disabledBtn,
                    ]}
                    onPress={handleSubmit}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <ResidentStaffLoader />
                    ) : (
                      <Text style={styles.submitText}>
                        {editingId ? "Update Staff" : "Register Staff"}
                      </Text>
                    )}
                  </TouchableOpacity>

                  {editingId && (
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      onPress={resetForm}
                    >
                      <Text style={styles.cancelText}>Cancel Edit</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
          </View>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Your Household Staff</Text>
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
                    {staff.sourceRegistryId && (
                      <View
                        style={[
                          styles.typeBadge,
                          { backgroundColor: "#DCFCE7" },
                        ]}
                      >
                        <Text
                          style={[styles.typeBadgeText, { color: "#0F9B8E" }]}
                        >
                          Linked
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.staffContact}>
                    <Ionicons name="call-outline" size={13} color="#64748B" />{" "}
                    {staff.contact}
                  </Text>
                  <Text style={styles.staffNative}>
                    <Ionicons
                      name="location-outline"
                      size={12}
                      color="#14B8A6"
                    />{" "}
                    {staff.nativePlace || "N/A"}
                  </Text>
                  {staff.guardianName && (
                    <Text style={styles.staffGuardian}>
                      G: {staff.guardianName}
                    </Text>
                  )}
                  {staff.lastEditedUnit && (
                    <Text
                      style={{
                        fontSize: 10,
                        color: "#94A3B8",
                        fontStyle: "italic",
                        marginTop: 3,
                      }}
                    >
                      Updated by {staff.lastEditedUnit} on{" "}
                      {staff.lastEditedAt
                        ? new Date(staff.lastEditedAt).toLocaleDateString()
                        : "N/A"}
                      {staff.lastEditField
                        ? ` � Changed: ${staff.lastEditField}`
                        : ""}
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity
                  onPress={() => handleEdit(staff)}
                  style={styles.editBtn}
                >
                  <Ionicons name="create-outline" size={20} color="#14B8A6" />
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
    color: "#14B8A6",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F2A3D",
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0F2A3D",
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
    shadowColor: "#0F2A3D",
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
    color: "#0F2A3D",
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
    color: "#0F2A3D",
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
    shadowColor: "#0F2A3D",
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
    color: "#14B8A6",
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
  uploadWrapper: {
    flex: 1,
    position: "relative",
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
    justifyContent: "center",
    alignItems: "center",
    height: 180,
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
    backgroundColor: "#14B8A6",
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
    shadowColor: "#14B8A6",
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
    shadowColor: "#0F2A3D",
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
    color: "#0F2A3D",
  },
  typeBadge: {
    backgroundColor: "#E6FFFA",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeBadgeText: {
    color: "#14B8A6",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  staffContact: {
    color: "#64748B",
    fontSize: 13,
  },
  staffNative: {
    color: "#14B8A6",
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
    backgroundColor: "#E6FFFA",
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
    backgroundColor: "#14B8A6",
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
  // ── Mode Toggle Styles ──
  modeTabs: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
    gap: 4,
  },
  modeTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 11,
    gap: 6,
  },
  modeTabActive: {
    backgroundColor: "#14B8A6",
    shadowColor: "#14B8A6",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  modeTabText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748B",
  },
  modeTabTextActive: {
    color: "#FFFFFF",
  },
  // ── Empty Registry ──
  emptyRegistry: {
    alignItems: "center",
    padding: 20,
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderStyle: "dashed",
  },
  emptyRegistryText: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 8,
    textAlign: "center",
  },
  emptyRegistryHint: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 4,
    textAlign: "center",
  },
  // ── Profile Preview ──
  profilePreview: {
    backgroundColor: "#E6FFFA",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    marginTop: 8,
  },
  profilePreviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  previewAvatar: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
  },
  previewAvatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#DCFCE7",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  previewAvatarText: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F9B8E",
  },
  previewName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F2A3D",
    marginBottom: 2,
  },
  previewDetail: {
    fontSize: 13,
    color: "#0F2A3D",
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
});
