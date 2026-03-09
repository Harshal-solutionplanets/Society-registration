import { appId, db } from "@/configs/firebaseConfig";
import { useAuth } from "@/hooks/useAuth";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { doc, getDoc, setDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Toast from "react-native-toast-message";

const PROFESSIONS = [
  "Doctor",
  "Engineer",
  "Student",
  "Teacher",
  "Lawyer",
  "Architect",
  "Accountant",
  "Businessman",
  "IT Professional",
  "Government Employee",
  "Artist",
  "Home Maker",
  "Influencer",
  "Unemployed",
  "Retired",
  "Other",
];

const RELATIONS = [
  "Father",
  "Mother",
  "Sister",
  "Brother",
  "Spouse",
  "Cousin",
  "Uncle",
  "Aunt",
  "Nephew",
  "Niece",
  "Son",
  "Daughter",
  "Grandson",
  "Granddaughter",
  "Grandmother",
  "Grandfather",
  "Other",
];

const BLOOD_GROUPS = [
  "A+",
  "A-",
  "B+",
  "B-",
  "O+",
  "O-",
  "AB+",
  "AB-",
  "Other",
];
const VEHICLE_TYPES = ["Two-Wheeler", "Three-Wheeler", "Four-Wheeler"];

export default function ResidentForm() {
  const router = useRouter();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionData, setSessionData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"basic" | "advance">("basic");

  const [formData, setFormData] = useState<any>({
    residentName: "",
    residentAge: "",
    residentGender: "Male",
    residentBloodGroup: "",
    residentMobile: "",
    alternateMobile: "",
    status: "Occupied",
    ownership: "SELF_OWNED",
    ownerName: "",
    ownerContact: "",
    familyMemberCount: "0",
    familyDetails: [],
    profession: "",
    otherProfession: "",
    companyName: "",
    vehicleCount: "0",
    vehicleDetails: [],
    hobbies: "",
    staffMembers: 0,
    familyMembers: 0,
  });
  const [newPassword, setNewPassword] = useState("");
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  const [formErrors, setFormErrors] = useState<any>({
    residentMobile: "",
    alternateMobile: "",
    familyContacts: {},
  });

  const [showDropdowns, setShowDropdowns] = useState<any>({
    status: false,
    ownership: false,
    profession: false,
    residentGender: false,
    residentBlood: false,
    gender: {},
    relation: {},
    blood: {},
    familyProfession: {},
    vehicleType: {},
  });

  const closeAllDropdowns = () => {
    setShowDropdowns({
      status: false,
      ownership: false,
      profession: false,
      residentGender: false,
      residentBlood: false,
      gender: {},
      relation: {},
      blood: {},
      familyProfession: {},
      vehicleType: {},
    });
  };

  useEffect(() => {
    fetchResidentSession();
  }, []);

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

  const fetchResidentSession = async () => {
    try {
      const session = await AsyncStorage.getItem("resident_session");
      if (session) {
        const data = JSON.parse(session);
        setSessionData(data);
        if (data.adminUID && data.id) {
          const residentDoc = await getDoc(
            doc(
              db,
              `artifacts/${appId}/public/data/societies/${data.adminUID}/Residents`,
              data.id,
            ),
          );
          if (residentDoc.exists()) {
            const existingData = residentDoc.data();
            // Sync unitName & wingName from Firestore into sessionData
            const syncedSession = { ...data };
            let sessionChanged = false;
            if (
              existingData.unitName &&
              existingData.unitName !== data.unitName
            ) {
              syncedSession.unitName = existingData.unitName;
              sessionChanged = true;
            }
            if (
              existingData.wingName &&
              existingData.wingName !== data.wingName
            ) {
              syncedSession.wingName = existingData.wingName;
              sessionChanged = true;
            }
            if (existingData.wingId && existingData.wingId !== data.wingId) {
              syncedSession.wingId = existingData.wingId;
              sessionChanged = true;
            }
            if (
              existingData.floorNumber !== undefined &&
              existingData.floorNumber !== data.floorNumber
            ) {
              syncedSession.floorNumber = existingData.floorNumber;
              sessionChanged = true;
            }
            if (
              existingData.staffMembers !== undefined &&
              existingData.staffMembers !== data.staffMembers
            ) {
              syncedSession.staffMembers = existingData.staffMembers;
              sessionChanged = true;
            }
            if (
              existingData.familyMembers !== undefined &&
              existingData.familyMembers !== data.familyMembers
            ) {
              syncedSession.familyMembers = existingData.familyMembers;
              sessionChanged = true;
            }
            if (sessionChanged) {
              setSessionData(syncedSession);
              await AsyncStorage.setItem(
                "resident_session",
                JSON.stringify(syncedSession),
              );
            }
            setFormData((prev: any) => ({
              ...prev,
              ...existingData,
              familyMemberCount:
                existingData.familyMemberCount?.toString() || "0",
              vehicleCount: existingData.vehicleCount?.toString() || "0",
              familyDetails: existingData.familyDetails || [],
              vehicleDetails: existingData.vehicleDetails || [],
            }));
          } else {
            setFormData((prev: any) => ({
              ...prev,
              residentName: data.residentName || "",
            }));
          }
        }
      }
    } catch (error) {
      console.error("Error fetching resident session:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    // Mobile number validation
    if (
      field === "residentMobile" ||
      field === "alternateMobile" ||
      field === "ownerContact"
    ) {
      const sanitized = value.replace(/[^0-9]/g, "");
      if (sanitized.length > 10) return;

      setFormData((prev: any) => ({ ...prev, [field]: sanitized }));

      if (sanitized.length > 0 && sanitized.length < 10) {
        setFormErrors((prev: any) => ({
          ...prev,
          [field]: "Mobile must be 10 digits",
        }));
      } else {
        setFormErrors((prev: any) => ({ ...prev, [field]: "" }));
      }
      return;
    }

    if (field === "residentAge") {
      const sanitized = value.replace(/[^0-9]/g, "");
      if (sanitized === "") {
        setFormData((prev: any) => ({ ...prev, [field]: "" }));
        return;
      }
      const num = parseInt(sanitized);
      if (num > 150) return;
      setFormData((prev: any) => ({ ...prev, [field]: num.toString() }));
      return;
    }

    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleFamilyCountChange = (val: string) => {
    const cleanVal = val.replace(/[^0-9]/g, "");
    let num = parseInt(cleanVal) || 0;
    if (num > 40) {
      Toast.show({ type: "info", text1: "Limit", text2: "Max 40 members" });
      num = 40;
    }
    let newDetails = [...formData.familyDetails];
    if (newDetails.length < num) {
      for (let i = newDetails.length; i < num; i++) {
        newDetails.push({
          name: "",
          age: "",
          gender: "Male",
          relation: "",
          otherRelation: "",
          bloodGroup: "",
          otherBloodGroup: "",
          contact: "",
          profession: "",
          companyName: "",
          otherProfession: "",
        });
      }
    } else {
      newDetails = newDetails.slice(0, num);
    }
    setFormData((prev: any) => ({
      ...prev,
      familyMemberCount: num.toString(),
      familyDetails: newDetails,
    }));
  };

  const addFamilyMember = () => {
    let currentCount = parseInt(formData.familyMemberCount) || 0;
    if (currentCount >= 40) {
      Toast.show({ type: "info", text1: "Limit", text2: "Max 40 members" });
      return;
    }
    const newCount = currentCount + 1;
    const newDetails = [
      ...formData.familyDetails,
      {
        name: "",
        age: "",
        gender: "Male",
        relation: "",
        otherRelation: "",
        bloodGroup: "",
        otherBloodGroup: "",
        contact: "",
        profession: "",
        companyName: "",
        otherProfession: "",
      },
    ];
    setFormData((prev: any) => ({
      ...prev,
      familyMemberCount: newCount.toString(),
      familyDetails: newDetails,
    }));
  };

  const removeFamilyMember = (index: number) => {
    const newDetails = [...formData.familyDetails];
    newDetails.splice(index, 1);
    const newCount = newDetails.length;
    setFormData((prev: any) => ({
      ...prev,
      familyMemberCount: newCount.toString(),
      familyDetails: newDetails,
    }));

    // Clear dropdown state for that index to avoid issues
    const newGender = { ...showDropdowns.gender };
    delete newGender[index];
    const newRelation = { ...showDropdowns.relation };
    delete newRelation[index];
    const newBlood = { ...showDropdowns.blood };
    delete newBlood[index];
    const newProfession = { ...showDropdowns.familyProfession };
    delete newProfession[index];
    setShowDropdowns({
      ...showDropdowns,
      gender: newGender,
      relation: newRelation,
      blood: newBlood,
      familyProfession: newProfession,
    });

    // Clear family contact error for that index
    const newFamilyErrors = { ...formErrors.familyContacts };
    delete newFamilyErrors[index];
    // Shift errors for remaining members
    const shiftedErrors: any = {};
    Object.keys(newFamilyErrors).forEach((key) => {
      const k = parseInt(key);
      if (k > index) {
        shiftedErrors[k - 1] = newFamilyErrors[key];
      } else {
        shiftedErrors[k] = newFamilyErrors[key];
      }
    });
    setFormErrors((prev: any) => ({
      ...prev,
      familyContacts: shiftedErrors,
    }));
  };

  const updateFamilyMember = (index: number, field: string, value: string) => {
    const newDetails = [...formData.familyDetails];
    if (field === "age") {
      const sanitized = value.replace(/[^0-9]/g, "");
      if (sanitized === "") {
        newDetails[index] = { ...newDetails[index], [field]: "" };
      } else {
        const num = parseInt(sanitized);
        if (num > 150) return;
        newDetails[index] = { ...newDetails[index], [field]: num.toString() };
      }
    } else if (field === "contact") {
      const sanitized = value.replace(/[^0-9]/g, "");
      if (sanitized.length > 10) return;
      newDetails[index] = { ...newDetails[index], [field]: sanitized };
      setFormErrors((prev: any) => {
        const newFamilyErrors = { ...prev.familyContacts };
        if (sanitized.length > 0 && sanitized.length < 10) {
          newFamilyErrors[index] = "Mobile must be 10 digits";
        } else {
          delete newFamilyErrors[index];
        }
        return { ...prev, familyContacts: newFamilyErrors };
      });
    } else {
      newDetails[index] = { ...newDetails[index], [field]: value };
    }
    setFormData((prev: any) => ({ ...prev, familyDetails: newDetails }));
  };

  const handleVehicleCountChange = (val: string) => {
    const cleanVal = val.replace(/[^0-9]/g, "");
    let num = parseInt(cleanVal) || 0;
    if (num > 200) num = 200;
    let newDetails = [...formData.vehicleDetails];
    if (newDetails.length < num) {
      for (let i = newDetails.length; i < num; i++) {
        newDetails.push({ type: "Two-Wheeler", model: "", plateNumber: "" });
      }
    } else {
      newDetails = newDetails.slice(0, num);
    }
    setFormData((prev: any) => ({
      ...prev,
      vehicleCount: num.toString(),
      vehicleDetails: newDetails,
    }));
  };

  const addVehicle = () => {
    let currentCount = parseInt(formData.vehicleCount) || 0;
    if (currentCount >= 200) {
      Toast.show({ type: "info", text1: "Limit", text2: "Max 200 vehicles" });
      return;
    }
    const newCount = currentCount + 1;
    const newDetails = [
      ...formData.vehicleDetails,
      { type: "Two-Wheeler", model: "", plateNumber: "" },
    ];
    setFormData((prev: any) => ({
      ...prev,
      vehicleCount: newCount.toString(),
      vehicleDetails: newDetails,
    }));
  };

  const removeVehicle = (index: number) => {
    const newDetails = [...formData.vehicleDetails];
    newDetails.splice(index, 1);
    const newCount = newDetails.length;
    setFormData((prev: any) => ({
      ...prev,
      vehicleCount: newCount.toString(),
      vehicleDetails: newDetails,
    }));

    // Clear dropdown state
    const newTypeDropdowns = { ...showDropdowns.vehicleType };
    delete newTypeDropdowns[index];
    setShowDropdowns({
      ...showDropdowns,
      vehicleType: newTypeDropdowns,
    });
  };

  const updateVehicle = (index: number, field: string, value: string) => {
    const newDetails = [...formData.vehicleDetails];
    newDetails[index] = { ...newDetails[index], [field]: value };
    setFormData((prev: any) => ({ ...prev, vehicleDetails: newDetails }));
  };

  const handleSubmit = async () => {
    // Validation check before submit
    if (formData.residentMobile && formData.residentMobile.length !== 10) {
      setFormErrors((prev: any) => ({
        ...prev,
        residentMobile: "Mobile must be 10 digits",
      }));
      return;
    }
    if (
      formData.alternateMobile &&
      formData.alternateMobile.length > 0 &&
      formData.alternateMobile.length !== 10
    ) {
      setFormErrors((prev: any) => ({
        ...prev,
        alternateMobile: "Mobile must be 10 digits",
      }));
      return;
    }

    // Filter out "empty" profiles:
    // Family member mandatory field: name
    // Vehicle mandatory field: plateNumber
    const filteredFamily = formData.familyDetails.filter(
      (m: any) => m.name && m.name.trim() !== "",
    );
    const filteredVehicles = formData.vehicleDetails.filter(
      (v: any) => v.plateNumber && v.plateNumber.trim() !== "",
    );

    // Update state to reflect filtered lists on UI
    setFormData((prev: any) => ({
      ...prev,
      familyDetails: filteredFamily,
      familyMemberCount: filteredFamily.length.toString(),
      vehicleDetails: filteredVehicles,
      vehicleCount: filteredVehicles.length.toString(),
    }));

    // Validate family contact inputs ONLY for the filtered members
    const familyContactErrors: any = {};
    let hasFamilyError = false;
    filteredFamily.forEach((member: any, index: number) => {
      if (member.contact && member.contact.length !== 10) {
        familyContactErrors[index] = "Mobile must be 10 digits";
        hasFamilyError = true;
      }
    });

    if (hasFamilyError) {
      setFormErrors((prev: any) => ({
        ...prev,
        familyContacts: familyContactErrors,
      }));
      Toast.show({
        type: "error",
        text1: "Validation Error",
        text2: "Some family contact numbers are invalid.",
      });
      return;
    } else {
      // Clear family errors if none found for valid members
      setFormErrors((prev: any) => ({ ...prev, familyContacts: {} }));
    }

    if (!formData.residentName || !formData.residentMobile) {
      Toast.show({
        type: "error",
        text1: "Required Fields",
        text2: "Resident Name and Mobile are mandatory.",
      });
      return;
    }

    // New Password Validation
    if (showPasswordChange) {
      if (!newPassword) {
        setPasswordError("Password cannot be empty");
        return;
      }
      if (newPassword.length < 6 || newPassword.length > 14) {
        setPasswordError("Password must be 6 to 14 characters");
        return;
      }
      if (/\s/.test(newPassword)) {
        setPasswordError("Password cannot contain spaces");
        return;
      }
      setPasswordError("");
    }
    setIsSubmitting(true);
    try {
      // Build paths for both locations
      const adminUID = sessionData.adminUID;
      const unitId = sessionData.id;
      const wingId = sessionData.wingId;
      const floorNumber = sessionData.floorNumber;

      // Path 1: Residents collection (for authentication)
      const residentPath = `artifacts/${appId}/public/data/societies/${adminUID}/Residents/${unitId}`;

      // Path 2: Wings hierarchy (for admin floor.tsx view)
      const wingsPath = `artifacts/${appId}/public/data/societies/${adminUID}/wings/${wingId}/${floorNumber}/${unitId}`;

      const updateData = {
        ...formData,
        familyDetails: filteredFamily,
        familyMemberCount: filteredFamily.length.toString(),
        familyMembers: filteredFamily.length,
        vehicleDetails: filteredVehicles,
        vehicleCount: filteredVehicles.length.toString(),
        residenceStatus: formData.status, // Ensure admin side reflects this
        updatedAt: new Date().toISOString(),
      };

      if (showPasswordChange && newPassword) {
        updateData.password = newPassword;
      }

      // Save to BOTH Firestore locations
      await setDoc(doc(db, residentPath), updateData, { merge: true });
      await setDoc(doc(db, wingsPath), updateData, { merge: true });
      const newSession = { ...sessionData, ...updateData };
      await AsyncStorage.setItem(
        "resident_session",
        JSON.stringify(newSession),
      );
      Toast.show({ type: "success", text1: "Profile Updated" });
      router.replace("/resident/dashboard");
    } catch (error: any) {
      console.error(error);
      Toast.show({ type: "error", text1: "Error saving profile" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderDropdown = (
    label: string,
    currentValue: string,
    options: string[],
    isOpen: boolean,
    onSelect: (val: string) => void,
    toggle: () => void,
    containerStyle: any = {},
  ) => (
    <View
      style={[styles.inputGroup, { zIndex: isOpen ? 2500 : 1 }, containerStyle]}
    >
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={styles.dropdownButton} onPress={toggle}>
        <Text style={styles.dropdownButtonText}>
          {currentValue || `Select ${label}`}
        </Text>
        <Ionicons
          name={isOpen ? "chevron-up" : "chevron-down"}
          size={20}
          color="#64748B"
        />
      </TouchableOpacity>
      {isOpen && (
        <View style={styles.dropdownListContainer}>
          <ScrollView
            style={styles.dropdownList}
            nestedScrollEnabled={true}
            showsVerticalScrollIndicator={true}
          >
            {options.map((opt) => (
              <TouchableOpacity
                key={opt}
                style={styles.dropdownItem}
                onPress={() => onSelect(opt)}
              >
                <Text
                  style={[
                    styles.dropdownItemText,
                    currentValue === opt && styles.activeDropdownText,
                  ]}
                >
                  {opt}
                </Text>
                {currentValue === opt && (
                  <Ionicons name="checkmark" size={18} color="#14B8A6" />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );

  const renderRowDropdown = (
    placeholder: string,
    currentValue: string,
    options: string[],
    isOpen: boolean,
    onSelect: (val: string) => void,
    toggle: () => void,
    flex: number = 1,
  ) => (
    <View style={{ flex, zIndex: isOpen ? 3000 : 1, position: "relative" }}>
      <TouchableOpacity
        style={[
          styles.rowInput,
          {
            justifyContent: "space-between",
            flexDirection: "row",
            alignItems: "center",
          },
        ]}
        onPress={toggle}
      >
        <Text
          style={{
            color: currentValue ? "#0F2A3D" : "#94A3B8",
            fontSize: 13,
            fontWeight: "500",
          }}
        >
          {currentValue || placeholder}
        </Text>
        <Ionicons
          name={isOpen ? "chevron-up" : "chevron-down"}
          size={14}
          color="#64748B"
        />
      </TouchableOpacity>
      {isOpen && (
        <View
          style={[styles.dropdownListContainer, { top: 45, maxHeight: 150 }]}
        >
          <ScrollView nestedScrollEnabled={true} style={styles.dropdownList}>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt}
                style={styles.dropdownItem}
                onPress={() => onSelect(opt)}
              >
                <Text
                  style={[
                    styles.dropdownItemText,
                    currentValue === opt && styles.activeDropdownText,
                    { fontSize: 12 },
                  ]}
                >
                  {opt}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#14B8A6" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.mainContainer}
    >
      <StatusBar barStyle="dark-content" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={closeAllDropdowns}
          style={{ flex: 1 }}
        >
          <View>
            <View style={styles.headerContainer}>
              <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={24} color="#14B8A6" />
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

            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tab, activeTab === "basic" && styles.activeTab]}
                onPress={() => setActiveTab("basic")}
              >
                <Text
                  style={[
                    styles.tabText,
                    activeTab === "basic" && styles.activeTabText,
                  ]}
                >
                  Basic
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.tab,
                  activeTab === "advance" && styles.activeTab,
                ]}
                onPress={() => setActiveTab("advance")}
              >
                <Text
                  style={[
                    styles.tabText,
                    activeTab === "advance" && styles.activeTabText,
                  ]}
                >
                  Advance
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              {activeTab === "basic" ? (
                <>
                  <Text style={styles.sectionHeader}>PRIMARY RESIDENT</Text>
                  <View
                    style={[
                      styles.rowInputsContainer,
                      { zIndex: showDropdowns.residentGender ? 3000 : 20 },
                    ]}
                  >
                    <View style={[styles.inputGroup, { flex: 1.5 }]}>
                      <Text style={styles.label}>Full Name *</Text>
                      <TextInput
                        style={styles.input}
                        value={formData.residentName}
                        onChangeText={(val) =>
                          handleInputChange("residentName", val)
                        }
                        placeholder="Name"
                      />
                    </View>
                    <View style={[styles.inputGroup, { flex: 0.6 }]}>
                      <Text style={styles.label}>Age</Text>
                      <TextInput
                        style={styles.input}
                        value={formData.residentAge}
                        onChangeText={(val) =>
                          handleInputChange("residentAge", val)
                        }
                        placeholder="Age"
                        keyboardType="numeric"
                        maxLength={3}
                      />
                    </View>
                    {renderDropdown(
                      "Gender",
                      formData.residentGender,
                      ["Male", "Female", "Other"],
                      showDropdowns.residentGender,
                      (val) => {
                        handleInputChange("residentGender", val);
                        setShowDropdowns({
                          ...showDropdowns,
                          residentGender: false,
                        });
                      },
                      () =>
                        setShowDropdowns({
                          ...showDropdowns,
                          residentGender: !showDropdowns.residentGender,
                        }),
                      { flex: 0.9 },
                    )}
                  </View>

                  <View
                    style={[
                      styles.rowInputsContainer,
                      { zIndex: showDropdowns.residentBlood ? 3000 : 15 },
                    ]}
                  >
                    <View style={[styles.inputGroup, { flex: 1 }]}>
                      <Text style={styles.label}>Mobile Number *</Text>
                      <TextInput
                        style={[
                          styles.input,
                          formErrors.residentMobile ? styles.inputError : null,
                        ]}
                        value={formData.residentMobile}
                        onChangeText={(val) =>
                          handleInputChange("residentMobile", val)
                        }
                        placeholder="e.g. 9876543210"
                        placeholderTextColor="#94A3B8"
                        keyboardType="phone-pad"
                        maxLength={10}
                      />
                      {formErrors.residentMobile ? (
                        <Text style={styles.errorText}>
                          {formErrors.residentMobile}
                        </Text>
                      ) : null}
                    </View>

                    <View style={[styles.inputGroup, { flex: 1 }]}>
                      <Text style={styles.label}>
                        Alternate Mobile (Optional)
                      </Text>
                      <TextInput
                        style={[
                          styles.input,
                          formErrors.alternateMobile ? styles.inputError : null,
                        ]}
                        value={formData.alternateMobile}
                        onChangeText={(val) =>
                          handleInputChange("alternateMobile", val)
                        }
                        placeholder="e.g. 9876543210"
                        placeholderTextColor="#94A3B8"
                        keyboardType="phone-pad"
                        maxLength={10}
                      />
                      {formErrors.alternateMobile ? (
                        <Text style={styles.errorText}>
                          {formErrors.alternateMobile}
                        </Text>
                      ) : null}
                    </View>
                    {renderDropdown(
                      "Blood Group",
                      formData.residentBloodGroup,
                      BLOOD_GROUPS,
                      showDropdowns.residentBlood,
                      (val) => {
                        handleInputChange("residentBloodGroup", val);
                        setShowDropdowns({
                          ...showDropdowns,
                          residentBlood: false,
                        });
                      },
                      () =>
                        setShowDropdowns({
                          ...showDropdowns,
                          residentBlood: !showDropdowns.residentBlood,
                        }),
                      { flex: 1 },
                    )}
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.passwordSection}>
                    <TouchableOpacity
                      style={styles.passwordToggleBtn}
                      onPress={() => setShowPasswordChange(!showPasswordChange)}
                    >
                      <Ionicons
                        name={showPasswordChange ? "chevron-up" : "key-outline"}
                        size={20}
                        color="#14B8A6"
                      />
                      <Text style={styles.passwordToggleText}>
                        {showPasswordChange
                          ? "Cancel Password Change"
                          : "Change Login Password"}
                      </Text>
                    </TouchableOpacity>

                    {showPasswordChange && (
                      <View style={styles.passwordInputContainer}>
                        <Text style={styles.label}>
                          New Password (6-14 chars, no spaces) *
                        </Text>
                        <TextInput
                          style={[
                            styles.input,
                            passwordError ? styles.inputError : null,
                          ]}
                          placeholder="Enter new password"
                          value={newPassword}
                          onChangeText={(val) => {
                            setNewPassword(val.replace(/\s/g, ""));
                            if (passwordError) setPasswordError("");
                          }}
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                        {passwordError ? (
                          <Text style={styles.errorText}>{passwordError}</Text>
                        ) : null}
                      </View>
                    )}
                  </View>

                  <View style={styles.divider} />
                  <Text style={styles.sectionHeader}>LIVING STATUS</Text>
                  <View
                    style={[
                      styles.rowInputsContainer,
                      {
                        zIndex:
                          showDropdowns.status || showDropdowns.ownership
                            ? 3000
                            : 10,
                      },
                    ]}
                  >
                    {renderDropdown(
                      "Occupancy",
                      formData.status,
                      ["Vacant", "Occupied"],
                      showDropdowns.status,
                      (val) => {
                        handleInputChange("status", val);
                        setShowDropdowns({ ...showDropdowns, status: false });
                      },
                      () =>
                        setShowDropdowns({
                          ...showDropdowns,
                          status: !showDropdowns.status,
                        }),
                      { flex: 1 },
                    )}
                    {renderDropdown(
                      "Ownership",
                      formData.ownership,
                      ["SELF_OWNED", "RENTAL"],
                      showDropdowns.ownership,
                      (val) => {
                        handleInputChange("ownership", val);
                        if (val === "SELF_OWNED") {
                          setFormData((prev: any) => ({
                            ...prev,
                            ownerName: "",
                            ownerContact: "",
                          }));
                        }
                        setShowDropdowns({
                          ...showDropdowns,
                          ownership: false,
                        });
                      },
                      () =>
                        setShowDropdowns({
                          ...showDropdowns,
                          ownership: !showDropdowns.ownership,
                        }),
                      { flex: 1 },
                    )}
                  </View>

                  {formData.ownership === "RENTAL" && (
                    <View
                      style={{
                        flexDirection: "row",
                        gap: 12,
                        marginTop: 16,
                        zIndex: 5,
                        width: "100%",
                      }}
                    >
                      <View style={{ flex: 1.2 }}>
                        <Text style={styles.label}>Owner Name</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="Full name"
                          value={formData.ownerName}
                          onChangeText={(val) =>
                            handleInputChange("ownerName", val)
                          }
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.label}>Owner Contact</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="10 digits"
                          value={formData.ownerContact}
                          onChangeText={(val) =>
                            handleInputChange("ownerContact", val)
                          }
                          keyboardType="phone-pad"
                          maxLength={10}
                        />
                      </View>
                    </View>
                  )}

                  <View style={styles.divider} />
                  <Text style={styles.sectionHeader}>FAMILY MEMBERS</Text>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Total members (Max 40)</Text>
                    <TextInput
                      style={[
                        styles.input,
                        formData.familyDetails.length > 0 && {
                          backgroundColor: "#F1F5F9",
                          color: "#64748B",
                        },
                      ]}
                      placeholder="Type count"
                      value={formData.familyMemberCount}
                      onChangeText={handleFamilyCountChange}
                      keyboardType="numeric"
                      maxLength={2}
                      editable={formData.familyDetails.length === 0}
                    />
                    {formData.familyDetails.length > 0 && (
                      <Text
                        style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}
                      >
                        Note: Use Add Member below once initialized to prevent
                        accidental loss.
                      </Text>
                    )}
                  </View>
                  {formData.familyDetails.map((member: any, index: number) => {
                    const isGOpen = showDropdowns.gender[index];
                    const isROpen = showDropdowns.relation[index];
                    const isBOpen = showDropdowns.blood[index];
                    return (
                      <View
                        key={index}
                        style={[
                          styles.dynamicRowCard,
                          {
                            zIndex:
                              isGOpen ||
                              isROpen ||
                              isBOpen ||
                              showDropdowns.familyProfession[index]
                                ? 2000
                                : 100 - index,
                          },
                        ]}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 8,
                          }}
                        >
                          <Text style={[styles.rowLabel, { marginBottom: 0 }]}>
                            Member {index + 1}
                          </Text>
                          <TouchableOpacity
                            onPress={() => removeFamilyMember(index)}
                          >
                            <Ionicons
                              name="trash-outline"
                              size={18}
                              color="#EF4444"
                            />
                          </TouchableOpacity>
                        </View>
                        <View
                          style={[
                            styles.rowInputsContainer,
                            { zIndex: isGOpen ? 3000 : 5 },
                          ]}
                        >
                          <View style={{ flex: 1.5 }}>
                            <TextInput
                              style={styles.rowInput}
                              placeholder="Full Name *"
                              value={member.name}
                              onChangeText={(val) =>
                                updateFamilyMember(index, "name", val)
                              }
                            />
                          </View>
                          <View style={{ flex: 0.5 }}>
                            <TextInput
                              style={styles.rowInput}
                              placeholder="Age"
                              value={member.age}
                              onChangeText={(val) =>
                                updateFamilyMember(index, "age", val)
                              }
                              keyboardType="numeric"
                            />
                          </View>
                          {renderRowDropdown(
                            "Gender",
                            member.gender,
                            ["Male", "Female", "Other"],
                            isGOpen,
                            (val) => {
                              updateFamilyMember(index, "gender", val);
                              setShowDropdowns({
                                ...showDropdowns,
                                gender: {
                                  ...showDropdowns.gender,
                                  [index]: false,
                                },
                              });
                            },
                            () =>
                              setShowDropdowns({
                                ...showDropdowns,
                                gender: {
                                  ...showDropdowns.gender,
                                  [index]: !isGOpen,
                                },
                              }),
                            0.8,
                          )}
                        </View>
                        <View
                          style={[
                            styles.rowInputsContainer,
                            { zIndex: isROpen || isBOpen ? 3000 : 1 },
                          ]}
                        >
                          {renderRowDropdown(
                            "Relation",
                            member.relation,
                            RELATIONS,
                            isROpen,
                            (val) => {
                              updateFamilyMember(index, "relation", val);
                              setShowDropdowns({
                                ...showDropdowns,
                                relation: {
                                  ...showDropdowns.relation,
                                  [index]: false,
                                },
                              });
                            },
                            () =>
                              setShowDropdowns({
                                ...showDropdowns,
                                relation: {
                                  ...showDropdowns.relation,
                                  [index]: !isROpen,
                                },
                              }),
                          )}
                          <View style={{ flex: 1.2 }}>
                            <TextInput
                              style={[
                                styles.rowInput,
                                formErrors.familyContacts?.[index]
                                  ? styles.inputError
                                  : null,
                              ]}
                              placeholder="Contact Number"
                              value={member.contact}
                              onChangeText={(val) =>
                                updateFamilyMember(index, "contact", val)
                              }
                              keyboardType="numeric"
                              maxLength={10}
                            />
                            {formErrors.familyContacts?.[index] ? (
                              <Text style={styles.errorText}>
                                {formErrors.familyContacts[index]}
                              </Text>
                            ) : null}
                          </View>
                          {renderRowDropdown(
                            "Blood",
                            member.bloodGroup,
                            BLOOD_GROUPS,
                            isBOpen,
                            (val) => {
                              updateFamilyMember(index, "bloodGroup", val);
                              setShowDropdowns({
                                ...showDropdowns,
                                blood: {
                                  ...showDropdowns.blood,
                                  [index]: false,
                                },
                              });
                            },
                            () =>
                              setShowDropdowns({
                                ...showDropdowns,
                                blood: {
                                  ...showDropdowns.blood,
                                  [index]: !isBOpen,
                                },
                              }),
                          )}
                        </View>
                        {member.relation === "Other" && (
                          <TextInput
                            style={[styles.rowInput, { marginTop: 4 }]}
                            placeholder="Specify Relation"
                            value={member.otherRelation}
                            onChangeText={(val) =>
                              updateFamilyMember(index, "otherRelation", val)
                            }
                          />
                        )}
                        {member.bloodGroup === "Other" && (
                          <TextInput
                            style={[styles.rowInput, { marginTop: 4 }]}
                            placeholder="Specify Blood Group"
                            value={member.otherBloodGroup}
                            onChangeText={(val) =>
                              updateFamilyMember(index, "otherBloodGroup", val)
                            }
                          />
                        )}

                        <View
                          style={[
                            styles.rowInputsContainer,
                            {
                              zIndex: showDropdowns.familyProfession[index]
                                ? 3000
                                : 1,
                              marginTop: 8,
                            },
                          ]}
                        >
                          {renderRowDropdown(
                            "Profession",
                            member.profession,
                            PROFESSIONS,
                            showDropdowns.familyProfession[index],
                            (val) => {
                              updateFamilyMember(index, "profession", val);
                              setShowDropdowns({
                                ...showDropdowns,
                                familyProfession: {
                                  ...showDropdowns.familyProfession,
                                  [index]: false,
                                },
                              });
                            },
                            () =>
                              setShowDropdowns({
                                ...showDropdowns,
                                familyProfession: {
                                  ...showDropdowns.familyProfession,
                                  [index]:
                                    !showDropdowns.familyProfession[index],
                                },
                              }),
                            1,
                          )}
                          <View style={{ flex: 1 }}>
                            <TextInput
                              style={styles.rowInput}
                              placeholder="Company/School"
                              value={member.companyName}
                              onChangeText={(val) =>
                                updateFamilyMember(index, "companyName", val)
                              }
                            />
                          </View>
                        </View>
                        {member.profession === "Other" && (
                          <TextInput
                            style={[styles.rowInput, { marginTop: 4 }]}
                            placeholder="Specify Profession"
                            value={member.otherProfession}
                            onChangeText={(val) =>
                              updateFamilyMember(index, "otherProfession", val)
                            }
                          />
                        )}
                      </View>
                    );
                  })}

                  <TouchableOpacity
                    style={styles.addMemberBtn}
                    onPress={addFamilyMember}
                  >
                    <Ionicons
                      name="add-circle-outline"
                      size={20}
                      color="#14B8A6"
                    />
                    <Text style={styles.addMemberText}>Add Member</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.sectionHeader}>PROFESSIONAL INFO</Text>
                  <View
                    style={[
                      styles.rowInputsContainer,
                      { zIndex: showDropdowns.profession ? 3000 : 10 },
                    ]}
                  >
                    {renderDropdown(
                      "Profession",
                      formData.profession,
                      PROFESSIONS,
                      showDropdowns.profession,
                      (val) => {
                        handleInputChange("profession", val);
                        setShowDropdowns({
                          ...showDropdowns,
                          profession: false,
                        });
                      },
                      () =>
                        setShowDropdowns({
                          ...showDropdowns,
                          profession: !showDropdowns.profession,
                        }),
                      { flex: 1 },
                    )}
                    <View style={[styles.inputGroup, { flex: 1.2 }]}>
                      <Text style={styles.label}>Company/Business</Text>
                      <TextInput
                        style={styles.input}
                        value={formData.companyName}
                        onChangeText={(val) =>
                          handleInputChange("companyName", val)
                        }
                        placeholder="Where work?"
                      />
                    </View>
                  </View>
                  {formData.profession === "Other" && (
                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Specify Profession</Text>
                      <TextInput
                        style={styles.input}
                        value={formData.otherProfession}
                        onChangeText={(val) =>
                          handleInputChange("otherProfession", val)
                        }
                        placeholder="Profession"
                      />
                    </View>
                  )}
                  <View style={styles.divider} />
                  <Text style={styles.sectionHeader}>VEHICLES (MAX 200)</Text>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Total Vehicles</Text>
                    <TextInput
                      style={[
                        styles.input,
                        formData.vehicleDetails.length > 0 && {
                          backgroundColor: "#F1F5F9",
                          color: "#64748B",
                        },
                      ]}
                      placeholder="e.g. 2"
                      value={formData.vehicleCount}
                      onChangeText={handleVehicleCountChange}
                      keyboardType="numeric"
                      maxLength={3}
                      editable={formData.vehicleDetails.length === 0}
                    />
                    {formData.vehicleDetails.length > 0 && (
                      <Text
                        style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}
                      >
                        Note: Use Add Vehicle below once initialized to prevent
                        accidental data loss.
                      </Text>
                    )}
                  </View>
                  {formData.vehicleDetails.map((v: any, index: number) => {
                    const isVOpen = showDropdowns.vehicleType[index];
                    return (
                      <View
                        key={index}
                        style={[
                          styles.dynamicRowCard,
                          { zIndex: isVOpen ? 2000 : 100 - index },
                        ]}
                      >
                        <View style={styles.rowInputsContainer}>
                          {renderRowDropdown(
                            "Type",
                            v.type,
                            VEHICLE_TYPES,
                            isVOpen,
                            (val) => {
                              updateVehicle(index, "type", val);
                              setShowDropdowns({
                                ...showDropdowns,
                                vehicleType: {
                                  ...showDropdowns.vehicleType,
                                  [index]: false,
                                },
                              });
                            },
                            () =>
                              setShowDropdowns({
                                ...showDropdowns,
                                vehicleType: {
                                  ...showDropdowns.vehicleType,
                                  [index]: !isVOpen,
                                },
                              }),
                            0.8,
                          )}
                          <View style={{ flex: 1 }}>
                            <TextInput
                              style={styles.rowInput}
                              placeholder="Model (e.g. Swift)"
                              value={v.model}
                              onChangeText={(val) =>
                                updateVehicle(index, "model", val)
                              }
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <TextInput
                              style={styles.rowInput}
                              placeholder="Plate Number *"
                              value={v.plateNumber}
                              onChangeText={(val) =>
                                updateVehicle(index, "plateNumber", val)
                              }
                              autoCapitalize="characters"
                            />
                          </View>
                          <TouchableOpacity
                            style={styles.removeRowBtn}
                            onPress={() => removeVehicle(index)}
                          >
                            <Ionicons
                              name="trash-outline"
                              size={18}
                              color="#EF4444"
                            />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}

                  <TouchableOpacity
                    style={styles.addMemberBtn}
                    onPress={addVehicle}
                  >
                    <Ionicons
                      name="add-circle-outline"
                      size={20}
                      color="#14B8A6"
                    />
                    <Text style={styles.addMemberText}>Add Vehicle</Text>
                  </TouchableOpacity>
                  <View style={styles.divider} />
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Hobbies & Interests</Text>
                    <TextInput
                      style={[styles.input, { height: 60 }]}
                      multiline
                      value={formData.hobbies}
                      onChangeText={(val) => handleInputChange("hobbies", val)}
                      placeholder="Hobbies..."
                    />
                  </View>
                </>
              )}
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  isSubmitting && styles.buttonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={isSubmitting}
              >
                <Text style={styles.buttonText}>
                  {isSubmitting ? "Saving..." : "Save Profile"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.backButton}
                onPress={handleBack}
                disabled={isSubmitting}
              >
                <Text style={styles.backButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: "#F8FAFC" },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 30,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
  headerContainer: {
    marginBottom: 20,
    flexDirection: "row",
    alignItems: "center",
  },
  backBtn: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  title: { fontSize: 24, fontWeight: "800", color: "#0F2A3D", marginBottom: 4 },
  unitBadge: {
    backgroundColor: "#14B8A6",
    color: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    fontSize: 13,
    fontWeight: "700",
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#E2E8F0",
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 10 },
  activeTab: {
    backgroundColor: "#FFFFFF",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  tabText: { fontSize: 14, fontWeight: "700", color: "#64748B" },
  activeTabText: { color: "#14B8A6" },
  placeholderText: {
    color: "#94A3B8",
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
    backgroundColor: "#FEF2F2",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 15,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: "800",
    color: "#14B8A6",
    letterSpacing: 0.5,
    marginBottom: 12,
    marginTop: 4,
  },
  inputGroup: { marginBottom: 12 },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 4,
    marginLeft: 2,
  },
  input: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 10,
    borderRadius: 10,
    fontSize: 14,
    color: "#0F2A3D",
  },
  dropdownButton: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 10,
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dropdownButtonText: { fontSize: 14, color: "#0F2A3D", fontWeight: "500" },
  dropdownListContainer: {
    position: "absolute",
    top: 55,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    maxHeight: 180,
    zIndex: 4000,
    elevation: 10,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  dropdownList: { padding: 2 },
  dropdownItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 10,
    borderRadius: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  dropdownItemText: { fontSize: 13, color: "#334155", fontWeight: "500" },
  activeDropdownText: { color: "#14B8A6", fontWeight: "700" },
  divider: { height: 1, backgroundColor: "#F1F5F9", marginVertical: 15 },
  passwordSection: {
    paddingVertical: 10,
  },
  passwordToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  passwordToggleText: {
    color: "#14B8A6",
    fontWeight: "700",
    fontSize: 14,
  },
  passwordInputContainer: {
    marginTop: 12,
  },
  dynamicRowCard: {
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    position: "relative",
  },
  rowLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    marginBottom: 6,
  },
  rowInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D6C9B3",
    padding: 8,
    borderRadius: 8,
    fontSize: 13,
    color: "#0F2A3D",
  },
  rowInputsContainer: { flexDirection: "row", gap: 6, marginBottom: 6 },
  primaryButton: {
    backgroundColor: "#14B8A6",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 15,
  },
  buttonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  buttonDisabled: { opacity: 0.6 },
  backButton: { marginTop: 12, padding: 8, alignItems: "center" },
  backButtonText: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  addMemberBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#14B8A6",
    borderStyle: "dashed",
    marginTop: 8,
    backgroundColor: "#E6FFFA",
  },
  addMemberText: {
    marginLeft: 8,
    color: "#14B8A6",
    fontSize: 14,
    fontWeight: "700",
  },
  removeRowBtn: {
    padding: 8,
    justifyContent: "center",
    alignItems: "center",
  },
});
