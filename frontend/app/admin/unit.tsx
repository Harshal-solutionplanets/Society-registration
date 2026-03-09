import { appId, db } from "@/configs/firebaseConfig";
import { useAuth } from "@/hooks/useAuth";
import { useTour } from "@/hooks/useTour";
import { refreshDriveToken } from "@/utils/driveHealthCheck";
import { checkDriveItemExists } from "@/utils/driveUtils";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
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
import AppTour from "./AppTour";
import { unitTourSteps } from "./tourSteps";

const RESIDENCE_TYPES = [
  "Residence",
  "Shop",
  "Godown",
  "Office",
  "Warehouse",
  "Studio",
  "Penthouse",
  "Nursery",
  "Tuition Center",
  "Clinic",
  "Gym",
  "Restaurant",
  "Hostel",
  "Cloud Kitchen",
  "Guest House",
  "Other",
];
export default function UnitDetails() {
  const router = useRouter();
  const { user } = useAuth();

  const tour = useTour({
    tourId: "admin-unit",
    steps: unitTourSteps,
    delay: 1000,
  });
  const {
    unitId,
    wingId,
    floorNumber,
    wingName,
    societyName,
    flatCount,
    floorName,
  } = useLocalSearchParams();

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [unitData, setUnitData] = useState<any>(null);
  const [linkedStaff, setLinkedStaff] = useState<any[]>([]);

  // Editable fields
  const [editUnitName, setEditUnitName] = useState("");
  const [editResidenceType, setEditResidenceType] = useState("Residence");
  const [editResidentName, setEditResidentName] = useState("");
  const [editResidentMobile, setEditResidentMobile] = useState("");
  const [editStatus, setEditStatus] = useState("Occupied");
  const [editOwnership, setEditOwnership] = useState("SELF_OWNED");
  const [editOwnerName, setEditOwnerName] = useState("");
  const [editOwnerContact, setEditOwnerContact] = useState("");
  const [editPassword, setEditPassword] = useState("");

  const [showResidenceDropdown, setShowResidenceDropdown] = useState(false);
  const [expandedFamily, setExpandedFamily] = useState(false);
  const [expandedVehicles, setExpandedVehicles] = useState(false);
  const [expandedStaff, setExpandedStaff] = useState(false);

  // Audit Data States
  const [auditModalVisible, setAuditModalVisible] = useState(false);
  const [auditHistory, setAuditHistory] = useState<any[]>([]);
  const [isFetchingAudit, setIsFetchingAudit] = useState(false);
  const [selectedStaffName, setSelectedStaffName] = useState("");
  const [driveToken, setDriveToken] = useState<string | null>(null);

  // Document preview modal state
  const [previewModal, setPreviewModal] = useState<{
    visible: boolean;
    uri: string;
    label: string;
  }>({ visible: false, uri: "", label: "" });

  useEffect(() => {
    if (user && unitId) {
      fetchUnitData();
      const unsubscribe = fetchLinkedStaff();
      return () => {
        if (unsubscribe) unsubscribe();
      };
    }
  }, [user, unitId]);

  const fetchUnitData = async () => {
    try {
      const residentPath = `artifacts/${appId}/public/data/societies/${user?.uid}/Residents/${unitId}`;
      const docSnap = await getDoc(doc(db, residentPath));

      if (docSnap.exists()) {
        const data = docSnap.data();
        setUnitData(data);
        // Initialize editable fields
        setEditUnitName(data.unitName || "");
        setEditResidenceType(data.residenceType || "Residence");
        setEditResidentName(data.residentName || "");
        setEditResidentMobile(data.residentMobile || "");
        setEditStatus(data.status || data.residenceStatus || "Occupied");
        setEditOwnership(data.ownership || "SELF_OWNED");
        setEditOwnerName(data.ownerName || "");
        setEditOwnerContact(data.ownerContact || "");
        setEditPassword(data.password || "");

        // 3. Get Drive Token for health checks
        const adminUID = user?.uid;
        if (adminUID) {
          const societyDoc = await getDoc(
            doc(db, `artifacts/${appId}/public/data/societies`, adminUID),
          );
          if (societyDoc.exists()) {
            const sData = societyDoc.data();
            let token = sData.driveAccessToken;
            if (!token) token = await refreshDriveToken(adminUID);
            setDriveToken(token);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching unit data:", error);
      Toast.show({
        type: "error",
        text1: "Fetch Failed",
        text2: "Could not load unit details",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchLinkedStaff = () => {
    if (!user || !unitId) return;
    try {
      const staffRef = collection(
        db,
        `artifacts/${appId}/public/data/societies/${user.uid}/Residents/${unitId}/StaffMembers`,
      );
      const unsubscribe = onSnapshot(
        staffRef,
        (snapshot: any) => {
          const staff: any[] = [];
          snapshot.forEach((d: any) => {
            staff.push({ id: d.id, ...d.data() });
          });
          setLinkedStaff(staff);
        },
        (error: any) => {
          console.log("Staff listener skipped:", error.message);
        },
      );
      return unsubscribe;
    } catch (error: any) {
      console.log("Linked staff fetch skipped:", error.message);
    }
  };

  const handleBack = () => {
    if (!user) {
      router.replace("/admin/auth");
    } else {
      if (router.canGoBack()) {
        router.back();
      } else {
        // Fallback to the specific floor/wing view if history is lost (e.g. after refresh)
        router.replace(
          `/admin/floor?wingId=${wingId}&wingName=${wingName}&floorNumber=${floorNumber}&flatCount=${flatCount}&floorName=${floorName}`,
        );
      }
    }
  };

  const handleCopyCredentials = async () => {
    if (!unitData) return;

    // Password Validation before copying
    if (!editPassword) {
      Toast.show({
        type: "error",
        text1: "Password Required",
        text2: "Password cannot be empty. Set a valid password before copying.",
      });
      return;
    }
    if (editPassword.length < 6 || editPassword.length > 14) {
      Toast.show({
        type: "error",
        text1: "Invalid Password",
        text2: "Password must be 6 to 14 characters.",
      });
      return;
    }
    if (/\s/.test(editPassword)) {
      Toast.show({
        type: "error",
        text1: "Invalid Password",
        text2: "Password cannot contain spaces.",
      });
      return;
    }

    const credentialsText = `Hello, I am the Admin of ${societyName}. Here are the login credentials for your unit ${editUnitName} of floor number ${floorNumber} of ${wingName} :\n\nUsername: ${unitData.username}\nPassword: ${editPassword}`;

    await Clipboard.setStringAsync(credentialsText);

    Toast.show({
      type: "success",
      text1: "Copied!",
      text2: "Credentials copied to clipboard",
    });
  };

  const handleSave = async () => {
    if (!unitId || !user) return;

    // Password Validation
    if (!editPassword) {
      Toast.show({
        type: "error",
        text1: "Password Required",
        text2: "Password cannot be empty.",
      });
      return;
    }
    if (editPassword.length < 6 || editPassword.length > 14) {
      Toast.show({
        type: "error",
        text1: "Invalid Password",
        text2: "Password must be 6 to 14 characters.",
      });
      return;
    }
    if (/\s/.test(editPassword)) {
      Toast.show({
        type: "error",
        text1: "Invalid Password",
        text2: "Password cannot contain spaces.",
      });
      return;
    }

    setIsSaving(true);
    try {
      const adminUID = user.uid;
      const unitPath = `artifacts/${appId}/public/data/societies/${adminUID}/wings/${wingId}/${floorNumber}/${unitId}`;
      const residentPath = `artifacts/${appId}/public/data/societies/${adminUID}/Residents/${unitId}`;

      const updatePayload = {
        unitName: editUnitName,
        displayName: `${wingName} - ${editUnitName}`,
        residenceType: editResidenceType,
        residentName: editResidentName,
        residentMobile: editResidentMobile,
        residenceStatus: editStatus,
        status: editStatus,
        ownership: editOwnership,
        ownerName: editOwnerName,
        ownerContact: editOwnerContact,
        password: editPassword,
        updatedAt: new Date().toISOString(),
      };

      // 1. Rename Drive folder if unit name changed
      if (editUnitName !== unitData.unitName && unitData.driveFolderId) {
        await syncDriveRenaming(unitData.driveFolderId, editUnitName);
      }

      // 2. Update Firestore
      await setDoc(doc(db, unitPath), updatePayload, { merge: true });
      await setDoc(doc(db, residentPath), updatePayload, { merge: true });

      Toast.show({
        type: "success",
        text1: "Updated",
        text2: "Unit details updated successfully",
      });
      fetchUnitData(); // Refresh local state
    } catch (error: any) {
      console.error("Error updating unit:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: error.message || "Failed to update unit details",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const syncDriveRenaming = async (folderId: string, newName: string) => {
    try {
      // Fetch token from society doc (like wing-setup.tsx)
      const societyDoc = await getDoc(
        doc(db, `artifacts/${appId}/public/data/societies`, user?.uid!),
      );
      const societyData = societyDoc.data();
      let token = societyData?.driveAccessToken;

      if (!token && typeof window !== "undefined") {
        token = sessionStorage.getItem("driveToken");
      }

      if (!token)
        throw new Error("Google Drive access token missing. Please re-login.");

      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${folderId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: newName }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to rename folder on Google Drive");
      }
    } catch (error) {
      console.error("Drive sync error:", error);
      // We don't block the Firestore update, but warn
      Toast.show({
        type: "info",
        text1: "Drive Warning",
        text2: "Firestore updated but Drive rename failed.",
      });
    }
  };

  const handlePreview = async (url: string, label: string) => {
    if (!url) return;

    // 1. If it's a Drive ID (or looks like one/contains ID), verify existence
    // In this app, document fields are either Base64 or Drive IDs
    const isBase64 = url.startsWith("data:");

    if (!isBase64 && driveToken) {
      // Check if the Drive ID exists (not trashed)
      const exists = await checkDriveItemExists(url, driveToken);
      if (!exists) {
        Toast.show({
          type: "error",
          text1: "Access Error",
          text2: "This document is manually deleted by admin",
        });
        return;
      }
    }

    const isPdf = url.startsWith("data:application/pdf");
    const isImage = url.startsWith("data:image");

    if (isPdf && Platform.OS === "web") {
      // Open PDF in new browser tab
      const win = window.open();
      if (win) {
        win.document.write(
          `<iframe src="${url}" style="width:100%;height:100%;border:none;"></iframe>`,
        );
        win.document.title = label;
      }
    } else if (Platform.OS !== "web") {
      // Direct open/download on mobile
      Linking.openURL(url).catch(() => {
        Toast.show({
          type: "error",
          text1: "Error",
          text2: "Could not open document.",
        });
      });
    } else if (isImage) {
      // Show image in modal overlay
      setPreviewModal({ visible: true, uri: url, label });
    } else {
      // Fallback: try to open externally (e.g. if it's a drive view link)
      const finalUrl = isBase64
        ? url
        : `https://drive.google.com/uc?id=${url}&export=download`;
      Linking.openURL(finalUrl).catch(() => {
        Toast.show({
          type: "error",
          text1: "Error",
          text2: "Could not open document.",
        });
      });
    }
  };

  const showAuditData = async (staffId?: string, name?: string) => {
    setSelectedStaffName(name || "Staff Member");
    setAuditModalVisible(true);
    setIsFetchingAudit(true);
    setAuditHistory([]);

    try {
      if (!staffId) throw new Error("Missing staff identity");
      const auditLogRef = collection(
        db,
        `artifacts/${appId}/public/data/societies/${user?.uid}/Resident_Staff_Audit/${staffId}/Logs`,
      );
      const q = query(auditLogRef, orderBy("timestamp", "desc"));
      const snapshot = await getDocs(q);
      const history = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setAuditHistory(history);
    } catch (err) {
      console.error("Fetch Audit Error:", err);
      Toast.show({
        type: "error",
        text1: "Fetch Error",
        text2: "Could not retrieve audit history.",
      });
    } finally {
      setIsFetchingAudit(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#14B8A6" />
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
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowResidenceDropdown(false)}
          style={{ flex: 1 }}
        >
          <View>
            <View style={styles.header}>
              <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={24} color="#0F2A3D" />
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

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Unit Credentials & Status</Text>

              {/* Row 1: Unit Number & Residence Type */}
              <View
                style={[
                  styles.row,
                  { zIndex: showResidenceDropdown ? 2000 : 1 },
                ]}
              >
                <View style={styles.flex1}>
                  <Text style={styles.formLabel}>Unit Number / Name</Text>
                  <TextInput
                    style={styles.formInput}
                    value={editUnitName}
                    onChangeText={setEditUnitName}
                    placeholder="e.g. 101"
                  />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.formLabel}>Residence Type</Text>
                  <TouchableOpacity
                    style={styles.dropdownBtn}
                    onPress={() =>
                      setShowResidenceDropdown(!showResidenceDropdown)
                    }
                  >
                    <Text style={styles.inputText} numberOfLines={1}>
                      {editResidenceType}
                    </Text>
                    <Ionicons
                      name={
                        showResidenceDropdown ? "chevron-up" : "chevron-down"
                      }
                      size={14}
                      color="#64748B"
                    />
                  </TouchableOpacity>
                  {showResidenceDropdown && (
                    <View style={styles.dropdownList}>
                      {RESIDENCE_TYPES.map((type) => (
                        <TouchableOpacity
                          key={type}
                          style={styles.dropdownItem}
                          onPress={() => {
                            setEditResidenceType(type);
                            setShowResidenceDropdown(false);
                          }}
                        >
                          <Text style={styles.dropdownText}>{type}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              </View>

              {/* Row 2: Living Status & Owner Status */}
              <View style={styles.row}>
                <View style={styles.flex1}>
                  <Text style={styles.formLabel}>Living Status</Text>
                  <View style={styles.toggleRow}>
                    {["Vacant", "Occupied"].map((s) => (
                      <TouchableOpacity
                        key={s}
                        style={[
                          styles.toggleBtn,
                          editStatus === s && styles.toggleBtnActive,
                        ]}
                        onPress={() => setEditStatus(s)}
                      >
                        <Text
                          style={[
                            styles.toggleText,
                            editStatus === s && styles.toggleTextActive,
                          ]}
                        >
                          {s}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.formLabel}>Ownership Status</Text>
                  <View style={styles.toggleRow}>
                    {[
                      { label: "Self Owned", value: "SELF_OWNED" },
                      { label: "Rental", value: "RENTAL" },
                    ].map((o) => (
                      <TouchableOpacity
                        key={o.value}
                        style={[
                          styles.toggleBtn,
                          editOwnership === o.value && styles.toggleBtnActive,
                        ]}
                        onPress={() => setEditOwnership(o.value)}
                      >
                        <Text
                          style={[
                            styles.toggleText,
                            editOwnership === o.value &&
                              styles.toggleTextActive,
                          ]}
                          numberOfLines={1}
                        >
                          {o.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              {/* Row 3 (Optional): Flat Owner Name & Contact (if Rental) */}
              {editOwnership === "RENTAL" && (
                <View style={styles.row}>
                  <View style={styles.flex1}>
                    <Text style={styles.formLabel}>Flat Owner Name</Text>
                    <TextInput
                      style={styles.formInput}
                      value={editOwnerName}
                      onChangeText={setEditOwnerName}
                      placeholder="Full name"
                    />
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.formLabel}>Flat Owner Contact</Text>
                    <TextInput
                      style={styles.formInput}
                      value={editOwnerContact}
                      onChangeText={setEditOwnerContact}
                      keyboardType="phone-pad"
                      placeholder="10 Digits"
                    />
                  </View>
                </View>
              )}

              {/* Row 3 (Next): Resident Name & Mobile No */}
              <View style={styles.row}>
                <View style={styles.flex1}>
                  <Text style={styles.formLabel}>Resident Name</Text>
                  <TextInput
                    style={styles.formInput}
                    value={editResidentName}
                    onChangeText={setEditResidentName}
                    placeholder="Enter Name"
                  />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.formLabel}>Resident Mobile No.</Text>
                  <TextInput
                    style={styles.formInput}
                    value={editResidentMobile}
                    onChangeText={setEditResidentMobile}
                    keyboardType="phone-pad"
                    maxLength={10}
                  />
                  {editResidentMobile.length === 10 && (
                    <TouchableOpacity style={styles.whatsappPlaceholder}>
                      <Ionicons
                        name="logo-whatsapp"
                        size={12}
                        color="#25D366"
                      />
                      <Text style={styles.whatsappPlaceholderText}>
                        Send Credentials on Whatsapp
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Row 4: Generated Username & Password */}
              <View style={styles.row}>
                <View style={styles.flex1}>
                  <Text style={styles.formLabel}>Username</Text>
                  <View style={[styles.formInput, styles.disabledInput]}>
                    <Text style={styles.inputText}>
                      {unitData?.username || "N/A"}
                    </Text>
                  </View>
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.formLabel}>Login Password</Text>
                  <TextInput
                    style={styles.formInput}
                    value={editPassword}
                    onChangeText={(val) =>
                      setEditPassword(val.replace(/\s/g, ""))
                    }
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>

              <View style={styles.actionButtonsRow}>
                <TouchableOpacity
                  style={[styles.saveBtnTop, isSaving && styles.disabledBtn]}
                  onPress={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="save-outline" size={20} color="#fff" />
                      <Text style={styles.actionBtnText}>Save Changes</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.copyBtn}
                  onPress={handleCopyCredentials}
                >
                  <Ionicons name="copy-outline" size={20} color="#fff" />
                  <Text style={styles.actionBtnText}>Copy Credentials</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Expandable Family Section */}
            <TouchableOpacity
              style={styles.expandHeader}
              onPress={() => setExpandedFamily(!expandedFamily)}
            >
              <View style={styles.expandLeft}>
                <Ionicons name="people" size={20} color="#14B8A6" />
                <Text style={styles.expandTitle}>
                  Family Members ({unitData?.familyMembers || 0})
                </Text>
              </View>
              <Ionicons
                name={expandedFamily ? "chevron-up" : "chevron-down"}
                size={20}
                color="#64748B"
              />
            </TouchableOpacity>
            {expandedFamily && (
              <View style={styles.expandContent}>
                {unitData?.familyDetails?.length > 0 ? (
                  unitData.familyDetails.map((m: any, idx: number) => (
                    <View key={idx} style={styles.itemCard}>
                      <Text style={styles.itemName}>
                        {m.name} ({m.relation})
                      </Text>
                      <Text style={styles.itemDetail}>
                        Age: {m.age} | Blood: {m.bloodGroup}
                      </Text>
                      {m.contact && (
                        <Text style={styles.itemDetail}>
                          Contact: {m.contact}
                        </Text>
                      )}
                      <Text style={styles.itemDetail}>
                        Profession: {m.profession || "N/A"} -{" "}
                        {m.companyName || ""}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyText}>No family members added.</Text>
                )}
              </View>
            )}

            {/* Expandable Vehicles Section */}
            <TouchableOpacity
              style={styles.expandHeader}
              onPress={() => setExpandedVehicles(!expandedVehicles)}
            >
              <View style={styles.expandLeft}>
                <Ionicons name="car" size={20} color="#14B8A6" />
                <Text style={styles.expandTitle}>
                  Vehicles ({unitData?.vehicleCount || 0})
                </Text>
              </View>
              <Ionicons
                name={expandedVehicles ? "chevron-up" : "chevron-down"}
                size={20}
                color="#64748B"
              />
            </TouchableOpacity>
            {expandedVehicles && (
              <View style={styles.expandContent}>
                {unitData?.vehicleDetails?.length > 0 ? (
                  unitData.vehicleDetails.map((v: any, idx: number) => (
                    <View key={idx} style={styles.itemCard}>
                      <Text style={styles.itemName}>{v.plateNumber}</Text>
                      <Text style={styles.itemDetail}>
                        {v.type} - {v.model}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyText}>No vehicles registered.</Text>
                )}
              </View>
            )}

            {/* Expandable Staff Section */}
            <TouchableOpacity
              style={styles.expandHeader}
              onPress={() => setExpandedStaff(!expandedStaff)}
            >
              <View style={styles.expandLeft}>
                <Ionicons name="shield-checkmark" size={20} color="#F59E0B" />
                <Text style={styles.expandTitle}>
                  Household Staff ({linkedStaff.length})
                </Text>
              </View>
              <Ionicons
                name={expandedStaff ? "chevron-up" : "chevron-down"}
                size={20}
                color="#64748B"
              />
            </TouchableOpacity>
            {expandedStaff && (
              <View style={styles.expandContent}>
                {linkedStaff.length > 0 ? (
                  linkedStaff.map((s: any, idx: number) => (
                    <View key={idx} style={styles.staffCard}>
                      <View style={styles.staffHeader}>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                            flexWrap: "wrap",
                            flex: 1,
                          }}
                        >
                          <Text style={styles.itemName}>{s.staffName}</Text>
                          {s.sourceRegistryId && (
                            <View
                              style={{
                                backgroundColor: "#DCFCE7",
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                                borderRadius: 4,
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 9,
                                  fontWeight: "700",
                                  color: "#0F9B8E",
                                }}
                              >
                                Linked
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.staffPos}>{s.staffType}</Text>
                      </View>
                      {/* Full metadata details */}
                      <View style={styles.staffMeta}>
                        {s.contact && (
                          <View style={styles.metaRow}>
                            <Text style={styles.metaLabel}>Contact:</Text>
                            <Text style={styles.metaValue}>{s.contact}</Text>
                          </View>
                        )}
                        {s.nativePlace && (
                          <View style={styles.metaRow}>
                            <Text style={styles.metaLabel}>Native Place:</Text>
                            <Text style={styles.metaValue}>
                              {s.nativePlace}
                            </Text>
                          </View>
                        )}
                        {s.guardianName && (
                          <View style={styles.metaRow}>
                            <Text style={styles.metaLabel}>Guardian:</Text>
                            <Text style={styles.metaValue}>
                              {s.guardianName}
                            </Text>
                          </View>
                        )}
                        {s.guardianContact && (
                          <View style={styles.metaRow}>
                            <Text style={styles.metaLabel}>
                              Guardian Phone:
                            </Text>
                            <Text style={styles.metaValue}>
                              {s.guardianContact}
                            </Text>
                          </View>
                        )}
                        {s.guardianAddress && (
                          <View style={styles.metaRow}>
                            <Text style={styles.metaLabel}>
                              Guardian Address:
                            </Text>
                            <Text style={styles.metaValue} numberOfLines={2}>
                              {s.guardianAddress}
                            </Text>
                          </View>
                        )}
                        {s.uploadedAt && (
                          <View style={styles.metaRow}>
                            <Text style={styles.metaLabel}>
                              Registered Date:
                            </Text>
                            <Text style={styles.metaValue}>
                              {new Date(s.uploadedAt).toLocaleDateString()}
                            </Text>
                          </View>
                        )}
                      </View>
                      {/* Creation Info and Document Location */}
                      <View style={styles.auditRow}>
                        <Ionicons
                          name="information-circle-outline"
                          size={11}
                          color="#14B8A6"
                        />
                        <Text style={styles.auditText}>
                          Staff Created by {s.createdWingName || "N/A"}-
                          {s.createdUnitName || "N/A"} on{" "}
                          {s.createdAt
                            ? new Date(s.createdAt).toLocaleDateString()
                            : "N/A"}
                          {"\n"}
                          Drive Location : {societyName}-Drive {"->"}{" "}
                          {s.createdWingName || "N/A"} {"->"}{" "}
                          {s.createdFloorName || "N/A"} {"->"}{" "}
                          {s.createdUnitName || "N/A"}
                        </Text>
                      </View>
                      {/* Document preview buttons */}
                      <View style={styles.staffDocs}>
                        {s.photo && (
                          <TouchableOpacity
                            style={styles.docBtn}
                            onPress={() => handlePreview(s.photo, "Photo")}
                          >
                            <Ionicons
                              name="person-circle"
                              size={16}
                              color="#4F46E5"
                            />
                            <Text style={styles.docBtnText}>Photo</Text>
                          </TouchableOpacity>
                        )}
                        {s.idCard && (
                          <TouchableOpacity
                            style={styles.docBtn}
                            onPress={() =>
                              handlePreview(s.idCard, "Photo ID Proof")
                            }
                          >
                            <Ionicons name="card" size={16} color="#4F46E5" />
                            <Text style={styles.docBtnText}>
                              Photo ID Proof
                            </Text>
                          </TouchableOpacity>
                        )}
                        {s.addressProof && (
                          <TouchableOpacity
                            style={styles.docBtn}
                            onPress={() =>
                              handlePreview(s.addressProof, "Address Proof")
                            }
                          >
                            <Ionicons name="home" size={16} color="#4F46E5" />
                            <Text style={styles.docBtnText}>Address Proof</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          style={[
                            styles.docBtn,
                            {
                              backgroundColor: "#F1F5F9",
                              borderColor: "#E2E8F0",
                            },
                          ]}
                          onPress={() =>
                            showAuditData(s.sourceRegistryId, s.staffName)
                          }
                        >
                          <Ionicons name="time" size={16} color="#64748B" />
                          <Text
                            style={[styles.docBtnText, { color: "#64748B" }]}
                          >
                            Audit data
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyText}>
                    No private staff linked to this unit.
                  </Text>
                )}
              </View>
            )}
          </View>
        </TouchableOpacity>
      </ScrollView>

      {/* Document Preview Modal */}
      <Modal
        visible={previewModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setPreviewModal({ visible: false, uri: "", label: "" })
        }
      >
        <View style={styles.modalOverlay}>
          <View style={styles.previewContainer}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewTitle}>{previewModal.label}</Text>
              <TouchableOpacity
                onPress={() =>
                  setPreviewModal({ visible: false, uri: "", label: "" })
                }
                style={styles.previewCloseBtn}
              >
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>
            {previewModal.uri ? (
              <Image
                source={{ uri: previewModal.uri }}
                style={styles.previewImage}
                resizeMode="contain"
              />
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Audit Data Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={auditModalVisible}
        onRequestClose={() => setAuditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: "80%" }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  History: {selectedStaffName}
                </Text>
                <Text style={{ fontSize: 12, color: "#64748B" }}>
                  Profile Audit Trail
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setAuditModalVisible(false)}
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 16 }}>
              {isFetchingAudit ? (
                <ActivityIndicator
                  size="large"
                  color="#14B8A6"
                  style={{ marginVertical: 40 }}
                />
              ) : auditHistory.length === 0 ? (
                <View style={{ alignItems: "center", marginVertical: 40 }}>
                  <Ionicons
                    name="documents-outline"
                    size={48}
                    color="#CBD5E1"
                  />
                  <Text style={{ marginTop: 12, color: "#64748B" }}>
                    No audit history found.
                  </Text>
                </View>
              ) : (
                auditHistory.map((log, idx) => (
                  <View key={log.id} style={styles.auditLogItem}>
                    <View style={styles.auditLogMarker}>
                      <View style={styles.markerCircle} />
                      {idx < auditHistory.length - 1 && (
                        <View style={styles.markerLine} />
                      )}
                    </View>
                    <View style={styles.auditLogBody}>
                      <View style={styles.auditHeaderRow}>
                        <Text style={styles.auditEditor}>
                          Unit {log.editedUnit}
                        </Text>
                        <Text style={styles.auditDate}>
                          {log.editedAt
                            ? new Date(log.editedAt).toLocaleString()
                            : "N/A"}
                        </Text>
                      </View>
                      <Text style={styles.auditFields}>
                        Changed:{" "}
                        <Text style={{ fontWeight: "700", color: "#0F2A3D" }}>
                          {log.changedFields}
                        </Text>
                      </Text>

                      {log.previousData && (
                        <View style={styles.prevDataBox}>
                          <Text style={styles.prevDataTitle}>
                            Previous version values:
                          </Text>
                          {(() => {
                            const AUDIT_FIELD_LABELS: Record<string, string> = {
                              staffName: "Staff Name",
                              contact: "Contact Number",
                              staffType: "Staff Category",
                              nativePlace: "Native Place Address",
                              guardianName: "Guardian Name",
                              guardianContact: "Guardian Contact",
                              guardianAddress: "Guardian Address",
                              photo: "Photo",
                              idCard: "Photo ID Proof",
                              addressProof: "Address Proof",
                            };
                            const changedFieldList = (log.changedFields || "")
                              .split(", ")
                              .filter(Boolean);
                            return Object.entries(log.previousData)
                              .filter(([key, val]) => {
                                if (
                                  changedFieldList.length > 0 &&
                                  !changedFieldList.includes(key)
                                )
                                  return false;
                                return (
                                  val !== undefined &&
                                  val !== null &&
                                  val !== ""
                                );
                              })
                              .map(([key, val]: [string, any]) => {
                                const isDoc = [
                                  "photo",
                                  "idCard",
                                  "addressProof",
                                ].includes(key);
                                if (isDoc && val.startsWith("data:")) {
                                  let label = "Document";
                                  let icon: any = "document";
                                  if (key === "photo") {
                                    label = "Photo";
                                    icon = "person-circle";
                                  } else if (key === "idCard") {
                                    label = "Photo ID Proof";
                                    icon = "card";
                                  } else if (key === "addressProof") {
                                    label = "Address Proof";
                                    icon = "home";
                                  }

                                  return (
                                    <TouchableOpacity
                                      key={key}
                                      style={[
                                        styles.docBtn,
                                        {
                                          marginTop: 4,
                                          alignSelf: "flex-start",
                                        },
                                      ]}
                                      onPress={() => handlePreview(val, label)}
                                    >
                                      <Ionicons
                                        name={icon}
                                        size={14}
                                        color="#4F46E5"
                                      />
                                      <Text
                                        style={[
                                          styles.docBtnText,
                                          { fontSize: 10 },
                                        ]}
                                      >
                                        Prev {label}
                                      </Text>
                                    </TouchableOpacity>
                                  );
                                }

                                return (
                                  <Text key={key} style={styles.prevDataLine}>
                                    •{" "}
                                    {AUDIT_FIELD_LABELS[key] ||
                                      key
                                        .replace(/([A-Z])/g, " $1")
                                        .toLowerCase()}
                                    : {val}
                                  </Text>
                                );
                              });
                          })()}
                        </View>
                      )}
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Walkthrough Tour */}
      <AppTour
        isActive={tour.isActive}
        step={tour.activeStep}
        stepNumber={tour.stepNumber}
        totalSteps={tour.totalSteps}
        isFirst={tour.isFirst}
        isLast={tour.isLast}
        onNext={tour.next}
        onPrev={tour.prev}
        onSkip={tour.skip}
        onFinish={tour.finish}
      />

      {tour.hasSeenTour && (
        <TouchableOpacity
          style={{
            position: "absolute",
            bottom: 24,
            right: 24,
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: "#14B8A6",
            justifyContent: "center",
            alignItems: "center",
            shadowColor: "#14B8A6",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 6,
            zIndex: 100,
          }}
          onPress={tour.restart}
        >
          <Text style={{ color: "#fff", fontSize: 20, fontWeight: "900" }}>
            ?
          </Text>
        </TouchableOpacity>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FA" },
  scrollContent: { padding: 15 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    gap: 15,
  },
  backBtn: {
    padding: 10,
    backgroundColor: "#fff",
    borderRadius: 14,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0F2A3D",
    letterSpacing: -0.5,
  },
  headerSubtitle: { fontSize: 13, color: "#64748B", fontWeight: "600" },
  card: {
    backgroundColor: "#fff",
    padding: 18,
    borderRadius: 24,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F2A3D",
    marginBottom: 18,
  },
  row: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 15,
  },
  flex1: {
    flex: 1,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
    marginBottom: 6,
    marginLeft: 2,
  },
  formInput: {
    backgroundColor: "#F8FAFC",
    padding: 12,
    borderRadius: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    color: "#0F2A3D",
    fontWeight: "500",
    minHeight: 45,
    justifyContent: "center",
  },
  disabledInput: {
    backgroundColor: "#F1F5F9",
    borderColor: "#CBD5E1",
  },
  inputText: { fontSize: 14, color: "#0F2A3D", fontWeight: "600" },
  dropdownBtn: {
    backgroundColor: "#F8FAFC",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 45,
  },
  dropdownList: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    marginTop: 5,
    position: "absolute",
    top: 60,
    left: 0,
    right: 0,
    zIndex: 1000,
    elevation: 5,
    maxHeight: 200,
    overflow: "scroll",
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  dropdownText: { fontSize: 14, color: "#0F2A3D", fontWeight: "500" },
  toggleRow: { flexDirection: "row", gap: 4 },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    backgroundColor: "#F1F5F9",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  toggleBtnActive: { backgroundColor: "#14B8A6", borderColor: "#0F9B8E" },
  toggleText: { fontWeight: "700", color: "#64748B", fontSize: 11 },
  toggleTextActive: { color: "#fff" },
  whatsappPlaceholder: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    marginLeft: 2,
  },
  whatsappPlaceholderText: {
    fontSize: 10,
    color: "#14B8A6",
    fontWeight: "600",
  },
  actionButtonsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  copyBtn: {
    flex: 1,
    backgroundColor: "#14B8A6",
    padding: 15,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    elevation: 2,
  },
  saveBtnTop: {
    flex: 1,
    backgroundColor: "#14B8A6",
    padding: 15,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    elevation: 2,
  },
  actionBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
  disabledBtn: { opacity: 0.6 },
  expandHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 18,
    borderRadius: 20,
    marginBottom: 10,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  expandLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  expandTitle: { fontSize: 14, fontWeight: "800", color: "#334155" },
  expandContent: { paddingHorizontal: 5, paddingBottom: 10 },
  itemCard: {
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 16,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#14B8A6",
    elevation: 1,
  },
  staffCard: {
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 16,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#F59E0B",
    elevation: 1,
  },
  staffHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  staffPos: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  staffDocs: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 8 },
  staffMeta: { marginTop: 4, marginBottom: 4 },
  metaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginBottom: 3,
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
    minWidth: 85,
  },
  metaValue: {
    fontSize: 11,
    fontWeight: "600",
    color: "#334155",
    flex: 1,
  },
  auditRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  auditText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
    flex: 1,
    lineHeight: 16,
  },
  docBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#C7D2FE",
  },
  docBtnText: { fontSize: 11, fontWeight: "700", color: "#4F46E5" },
  itemName: { fontSize: 14, fontWeight: "800", color: "#0F2A3D" },
  itemDetail: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 4,
    fontWeight: "500",
  },
  emptyText: {
    textAlign: "center",
    color: "#94A3B8",
    fontStyle: "italic",
    padding: 15,
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  previewContainer: {
    backgroundColor: "#fff",
    borderRadius: 20,
    width: "90%",
    maxWidth: 500,
    maxHeight: "85%",
    overflow: "hidden",
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
  },
  previewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F2A3D",
  },
  previewCloseBtn: {
    padding: 4,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
  },
  previewImage: {
    width: "100%",
    height: 400,
    backgroundColor: "#F8FAFC",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  modalContent: {
    backgroundColor: "white",
    borderRadius: 24,
    width: "90%",
    maxWidth: 500,
    overflow: "hidden",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F2A3D",
  },
  closeBtn: {
    padding: 4,
  },
  // Audit History Styles
  auditLogItem: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 4,
  },
  auditLogMarker: {
    alignItems: "center",
    width: 20,
  },
  markerCircle: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#14B8A6",
    marginTop: 6,
  },
  markerLine: {
    width: 2,
    flex: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 4,
  },
  auditLogBody: {
    flex: 1,
    paddingBottom: 20,
  },
  auditHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  auditEditor: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F2A3D",
  },
  auditDate: {
    fontSize: 11,
    color: "#94A3B8",
  },
  auditFields: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 4,
  },
  prevDataBox: {
    marginTop: 8,
    backgroundColor: "#F8FAFC",
    padding: 10,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#CBD5E1",
  },
  prevDataTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 4,
  },
  prevDataLine: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 1,
  },
});
