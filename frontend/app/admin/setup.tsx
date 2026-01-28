import { appId, db } from "@/configs/firebaseConfig";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "expo-router";
import { doc, getDoc, setDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
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
import { Ionicons } from "@expo/vector-icons";

export default function AdminSetup() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [activeTab, setActiveTab] = useState<"basic" | "advance">("basic");
  const [formData, setFormData] = useState({
    societyName: "",
    societyAddress: "",
    registrationNo: "",
    pincode: "",
    googleLocation: "",
    wingCount: "",
    adminName: "",
    adminContact: "",
  });

  const [advanceFormData, setAdvanceFormData] = useState({
    // Fire Safety
    fireNocStatus: "", // Valid, Expired, Never Applied
    fireNocExpiryDate: "",
    lastFireAuditDate: "",
    fireExtinguisherCount: "",
    lastRefillDate: "",
    fireHydrantAmc: "", // Yes, No

    // Statutory Compliances
    completionYear: "",
    lastStructuralAuditDate: "",
    conveyanceDeedStatus: "", // Yes, No, On progress
    appointedAuditor: "", // Yes, No

    // Machinery and Lift
    hasLift: "", // Yes, No
    liftCount: "",
    liftLicenceExpiryDate: "",
    liftAmcType: "", // Original Manufacturer, Third Party
    pumpStpGenAmc: "", // Yes, No

    // Insurance
    structureInsured: "", // Yes, No
    insuranceExpiryDate: "",
    publicLiabilityInsurance: "", // Yes, No
    fidelityInsurance: "", // Yes, No

    // Waste and Environment
    hasStp: "", // Yes, No
    processWasteOnSite: "", // Yes, No
    rainwaterHarvesting: "", // Yes, No
    solarPowerInterest: "", // Yes, No

    // Hygiene and Water Management
    waterTankCount: "",
    lastTankCleaningDate: "",
    waterQualityTestedAnnually: "", // Yes, No
    waterTankAmc: "", // Yes, No
    waterSource: "", // Borewell, Municipal, Tanker, Mixed

    // Pest Control
    pestControlFrequency: "", // Monthly, Quarterly, Yearly, As needed
    lastFoggingDate: "",
    antiTermiteAmc: "", // Yes, No

    // Security
    hasCctv: "", // Yes, No
    cctvCount: "",
    cctvIntercomAmc: "", // Yes, No
    gateSecurityType: "", // Manual Register, Digital App, Both, None

    // Others
    waterMetering: "", // Yes, No, Not required
    evCharging: "", // Yes, No, Not required
    solarRoofTop: "", // Yes, No, Not required
  });

  const [showDropdowns, setShowDropdowns] = useState<Record<string, boolean>>({});
  const [formErrors, setFormErrors] = useState({
    pincode: "",
    adminContact: "",
    googleLocation: "",
  });

  const [societyRef, setSocietyRef] = useState<any>(null);

  useEffect(() => {
    if (user) {
      fetchSocietyData();
    }
  }, [user]);

  const fetchSocietyData = async () => {
    if (!user) return;
    try {
      const societyDoc = await getDoc(
        doc(db, `artifacts/${appId}/public/data/societies`, user.uid),
      );
      if (societyDoc.exists()) {
        const data = societyDoc.data();
        setFormData({
          societyName: data.societyName || "",
          societyAddress: data.societyAddress || "",
          registrationNo: data.registrationNo || "",
          pincode: data.pincode || "",
          googleLocation: data.googleLocation || "",
          wingCount: data.wingCount?.toString() || "",
          adminName: data.adminName || "",
          adminContact: data.adminContact || "",
        });
        if (data.advanceDetails) {
          setAdvanceFormData(data.advanceDetails);
        }
        setIsEditMode(true);
      }
    } catch (error) {
      console.error("Error fetching society data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = async () => {
    await signOut();
    router.replace("/admin/auth");
  };

  const handleInputChange = (field: string, value: string) => {
    // Clear error when user changes input
    if (formErrors[field as keyof typeof formErrors]) {
      setFormErrors(prev => ({ ...prev, [field]: "" }));
    }

    // Enforce 6-digit limit for pincode
    if (field === "pincode") {
      const sanitized = value.replace(/[^0-9]/g, "");
      if (sanitized.length > 6) return;

      setFormData((prev) => ({ ...prev, [field]: sanitized }));

      // Inline validation
      if (sanitized.length > 0 && sanitized.length < 6) {
        setFormErrors(prev => ({ ...prev, pincode: "Pincode must be 6 digits" }));
      }
      return;
    }

    // Enforce 10-digit limit for contact number
    if (field === "adminContact") {
      const sanitized = value.replace(/[^0-9]/g, "");
      if (sanitized.length > 10) return;

      setFormData((prev) => ({ ...prev, [field]: sanitized }));

      // Inline validation
      if (sanitized.length > 0 && sanitized.length < 10) {
        setFormErrors(prev => ({ ...prev, adminContact: "Contact must be 10 digits" }));
      }
      return;
    }

    // Google Maps URL validation - Strictly original google links
    if (field === "googleLocation") {
      setFormData((prev) => ({ ...prev, [field]: value }));
      if (value.length === 0) {
        setFormErrors(prev => ({ ...prev, googleLocation: "" }));
      } else {
        const googleMapsRegex = /^(https?:\/\/)?(www\.)?(google\.com\/maps|goo\.gl\/maps|maps\.app\.goo\.gl)\/.+$/;
        if (!googleMapsRegex.test(value)) {
          setFormErrors(prev => ({ ...prev, googleLocation: "Invalid Google Maps URL. Use original shared link." }));
        } else {
          setFormErrors(prev => ({ ...prev, googleLocation: "" }));
        }
      }
      return;
    }

    // Limit wing count to 3 digits
    if (field === "wingCount") {
      const sanitized = value.replace(/[^0-9]/g, "");
      if (sanitized.length > 3) return;
      setFormData((prev) => ({ ...prev, [field]: sanitized }));
      return;
    }

    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleAdvanceInputChange = (field: string, value: string) => {
    // Global limit for any numeric field in advance form (preventing accidental massive numbers)
    // Most counts won't exceed 4 digits (9999)
    const numericFields = ["fireExtinguisherCount", "liftCount", "waterTankCount", "cctvCount", "completionYear"];
    if (numericFields.includes(field)) {
      const sanitized = value.replace(/[^0-9]/g, "");
      const limit = field === "completionYear" ? 4 : 4;
      if (sanitized.length > limit) return;
      value = sanitized;
    }

    setAdvanceFormData((prev) => {
      const updatedData = { ...prev, [field]: value };

      // If Fire NOC Status is changed to "Never Applied", clear related fields
      if (field === "fireNocStatus" && value === "Never Applied") {
        updatedData.fireNocExpiryDate = "";
        updatedData.lastFireAuditDate = "";
        updatedData.fireExtinguisherCount = "";
        updatedData.lastRefillDate = "";
        updatedData.fireHydrantAmc = "";
      }

      // If Lift status is changed to "No", clear related fields
      if (field === "hasLift" && value === "No") {
        updatedData.liftCount = "";
        updatedData.liftLicenceExpiryDate = "";
        updatedData.liftAmcType = "";
      }

      return updatedData;
    });
  };

  const toggleDropdown = (field: string) => {
    setShowDropdowns(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handleSetup = async () => {
    const { societyName, wingCount, pincode, adminName, adminContact, googleLocation } = formData;

    // Validation for essential fields
    if (!societyName || !wingCount || !pincode || !adminName) {
      Toast.show({
        type: "error",
        text1: "Required Fields",
        text2: "Please fill in all essential fields.",
      });
      return;
    }

    // Final validation check before submission
    if (formErrors.pincode || formErrors.adminContact || formErrors.googleLocation) {
      Toast.show({
        type: "error",
        text1: "Validation Error",
        text2: "Please fix the errors in the form before submitting.",
      });
      return;
    }

    // Doubly ensure values are correct length (in case user just left it incomplete)
    if (pincode.length !== 6) {
      setFormErrors(prev => ({ ...prev, pincode: "Pincode must be 6 digits" }));
      return;
    }
    if (adminContact && adminContact.length !== 10) {
      setFormErrors(prev => ({ ...prev, adminContact: "Contact must be 10 digits" }));
      return;
    }

    if (googleLocation) {
      const googleMapsRegex = /^(https?:\/\/)?(www\.)?(google\.com\/maps|goo\.gl\/maps|maps\.app\.goo\.gl)\/.+$/;
      if (!googleMapsRegex.test(googleLocation)) {
        setFormErrors(prev => ({ ...prev, googleLocation: "Invalid Google Maps URL. Use original shared link." }));
        return;
      }
    }

    if (!user || !user.email) {
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "User authentication failed. Please log in again.",
      });
      return;
    }

    const token =
      typeof window !== "undefined"
        ? sessionStorage.getItem("driveToken")
        : null;
    if (!token) {
      Toast.show({
        type: "error",
        text1: "Session Expired",
        text2: "Please log in again to link Google Drive.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      let realFolderId = null;

      if (!isEditMode) {
        // 1. Create the physical folder in Google Drive only during initial setup
        const driveResponse = await fetch(
          "https://www.googleapis.com/drive/v3/files",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: `${societyName.toUpperCase()}-DRIVE`,
              mimeType: "application/vnd.google-apps.folder",
            }),
          },
        );

        if (!driveResponse.ok) {
          const errorData = await driveResponse.json();
          throw new Error(
            errorData.error?.message || "Failed to create Google Drive folder",
          );
        }

        const driveData = await driveResponse.json();
        realFolderId = driveData.id;
      }

      // 2. Save everything to Firestore
      const updateData: any = {
        ...formData,
        advanceDetails: advanceFormData,
        wingCount: parseInt(wingCount),
        adminUserId: user.uid,
        adminEmail: user.email,
        updatedAt: new Date().toISOString(),
      };

      if (!isEditMode) {
        updateData.driveEmail = user.email;
        updateData.driveFolderId = realFolderId;
        updateData.driveAccessToken = token; // Store Drive token for persistence
        updateData.role = "ADMIN";
        updateData.createdAt = new Date().toISOString();
      }

      await setDoc(
        doc(db, `artifacts/${appId}/public/data/societies`, user.uid),
        updateData,
        { merge: true },
      );

      Toast.show({
        type: "success",
        text1: isEditMode ? "Update Successful" : "Setup Successful",
        text2: isEditMode
          ? "Profile updated!"
          : "Society and Drive folder created!",
      });
      router.replace("/admin/dashboard");
    } catch (error: any) {
      console.error("Setup error:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: error.message || "Could not save society data.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper for dynamic zIndex in rows to prevent overlap
  const getRowZIndex = (fields: string[], baseZ: number) => {
    return fields.some(f => showDropdowns[f]) ? 10000 : baseZ;
  };

  const renderAdvanceDropdown = (label: string, field: string, options: string[], value: string, flex: number = 1) => (
    <View style={[styles.advanceInputGroup, { flex, zIndex: showDropdowns[field] ? 11000 : 1 }]}>
      <Text style={styles.compactLabel} numberOfLines={2}>{label}</Text>
      <TouchableOpacity
        style={styles.compactDropdownButton}
        onPress={() => toggleDropdown(field)}
      >
        <Text style={[styles.compactDropdownText, !value && styles.placeholderText]} numberOfLines={1}>
          {value || "Select"}
        </Text>
        <Ionicons name={showDropdowns[field] ? "chevron-up" : "chevron-down"} size={12} color="#64748B" />
      </TouchableOpacity>
      {showDropdowns[field] && (
        <View style={styles.compactDropdownList}>
          <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 150 }} keyboardShouldPersistTaps="handled">
            {options.map((opt) => (
              <TouchableOpacity
                key={opt}
                style={styles.dropdownItem}
                onPress={() => {
                  handleAdvanceInputChange(field, opt);
                  toggleDropdown(field);
                }}
              >
                <Text style={styles.compactDropdownItemText}>{opt}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );

  const renderAdvanceInput = (label: string, field: string, placeholder: string, keyboardType: any = "default", flex: number = 1) => (
    <View style={[styles.advanceInputGroup, { flex }]}>
      <Text style={styles.compactLabel}>{label}</Text>
      <TextInput
        style={styles.compactInput}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        value={advanceFormData[field as keyof typeof advanceFormData] as string}
        onChangeText={(val) => handleAdvanceInputChange(field, val)}
        keyboardType={keyboardType}
        maxLength={keyboardType === "numeric" ? (field === "completionYear" ? 4 : 4) : undefined}
      />
    </View>
  );

  const renderAdvanceForm = () => (
    <View style={{ zIndex: 100 }}>
      {/* Fire Safety Section */}
      <Text style={styles.sectionHeader}>FIRE SAFETY AND EQUIPMENT</Text>
      <View style={[styles.compactRow, { zIndex: getRowZIndex(["fireNocStatus"], 500) }]}>
        {renderAdvanceDropdown("What is the current Fire NOC Status of the society?", "fireNocStatus", ["Valid", "Expired", "Never Applied"], advanceFormData.fireNocStatus)}
      </View>

      {(advanceFormData.fireNocStatus === "Valid" || advanceFormData.fireNocStatus === "Expired") && (
        <>
          <View style={[styles.compactRow, { zIndex: 450 }]}>
            {renderAdvanceInput("Fire NOC Expiry Date", "fireNocExpiryDate", "DD/MM/YYYY")}
            {renderAdvanceInput("Last Fire Audit Date", "lastFireAuditDate", "DD/MM/YYYY")}
            {renderAdvanceInput("Total Fire Extinguishers on premises", "fireExtinguisherCount", "Qty", "numeric")}
          </View>
          <View style={[styles.compactRow, { zIndex: getRowZIndex(["fireHydrantAmc"], 400) }]}>
            {renderAdvanceInput("Last  Extinguisher Refill Date", "lastRefillDate", "DD/MM/YYYY")}
            {renderAdvanceDropdown("Do you have an annual maintenance contract (AMC)for the fire hydrant system?", "fireHydrantAmc", ["Yes", "No"], advanceFormData.fireHydrantAmc)}
          </View>
        </>
      )}

      <View style={styles.compactDivider} />

      {/* Statutory Compliances */}
      <Text style={styles.sectionHeader}>STATUTORY COMPLIANCES</Text>
      <View style={[styles.compactRow, { zIndex: getRowZIndex(["conveyanceDeedStatus", "appointedAuditor"], 350) }]}>
        {renderAdvanceInput("Society Completion Year", "completionYear", "2015", "numeric")}
        {renderAdvanceInput("Last Structural Audit Date", "lastStructuralAuditDate", "DD/MM/Y")}
        {renderAdvanceDropdown("Is your society Conveyance Deed complete?", "conveyanceDeedStatus", ["Yes", "No", "On progress"], advanceFormData.conveyanceDeedStatus)}
        {renderAdvanceDropdown("Appointed auditor for financial year?", "appointedAuditor", ["Yes", "No"], advanceFormData.appointedAuditor)}
      </View>

      <View style={styles.compactDivider} />

      {/* Machinery and Lift */}
      <Text style={styles.sectionHeader}>MACHINERY AND LIFT</Text>
      <View style={[styles.compactRow, { zIndex: getRowZIndex(["hasLift"], 250) }]}>
        {renderAdvanceDropdown("Does the society have lift facility?", "hasLift", ["Yes", "No"], advanceFormData.hasLift)}
      </View>

      {advanceFormData.hasLift === "Yes" && (
        <View style={[styles.compactRow, { zIndex: getRowZIndex(["liftAmcType"], 240) }]}>
          {renderAdvanceInput("Total Number of Lifts ? ", "liftCount", "0", "numeric")}
          {renderAdvanceInput("Lift License Expiry Date ?", "liftLicenceExpiryDate", "DD/MM/YYYY")}
          {renderAdvanceDropdown("Are your Lifts under AMC with the Original Manufacturer (OEM) ?", "liftAmcType", ["Original", "3rd Party", "No"], advanceFormData.liftAmcType)}
        </View>
      )}


      <View style={styles.compactDivider} />

      {/* Insurance Coverage */}
      <Text style={styles.sectionHeader}>INSURANCE COVERAGE</Text>
      <View style={[styles.compactRow, { zIndex: getRowZIndex(["structureInsured", "publicLiabilityInsurance"], 150) }]}>
        {renderAdvanceDropdown("Is the Building Structure insured against Fire/Earthquake?", "structureInsured", ["Yes", "No"], advanceFormData.structureInsured)}
        {renderAdvanceDropdown("Do you have Public Liability Insurance for visitors/staff?", "publicLiabilityInsurance", ["Yes", "No"], advanceFormData.publicLiabilityInsurance)}
        {renderAdvanceDropdown("Do you have Fidelity Insurance for the Managing Committee? ", "fidelityInsurance", ["Yes", "No"], advanceFormData.fidelityInsurance)}
      </View>

      {advanceFormData.structureInsured === "Yes" && (
        <View style={styles.compactRow}>
          {renderAdvanceInput("Building Insurance Policy Expiry Date", "insuranceExpiryDate", "DD/MM/YYYY")}
        </View>
      )}

      <View style={styles.compactDivider} />

      {/* Waste and Environment */}
      <Text style={styles.sectionHeader}>WASTE AND ENVIRONMENT</Text>
      <View style={[styles.compactRow, { zIndex: getRowZIndex(["hasStp", "processWasteOnSite", "rainwaterHarvesting", "solarPowerInterest"], 100) }]}>
        {renderAdvanceDropdown("Do you have an on-site Sewage Treatment Plant (STP) ?", "hasStp", ["Yes", "No"], advanceFormData.hasStp)}
        {renderAdvanceDropdown("Do you currently process Organic Waste on-site ?", "processWasteOnSite", ["Yes", "No"], advanceFormData.processWasteOnSite)}
        {renderAdvanceDropdown("Does the society have functional Rainwater Harvesting ?", "rainwaterHarvesting", ["Yes", "No"], advanceFormData.rainwaterHarvesting)}
        {renderAdvanceDropdown("Are you interested in exploring Solar Power for common area lighting ?", "solarPowerInterest", ["Yes", "No"], advanceFormData.solarPowerInterest)}
      </View>

      <View style={styles.compactDivider} />

      {/* Hygiene and Water Management */}
      <Text style={styles.sectionHeader}>HYGIENE AND WATER MANAGEMENT</Text>
      <View style={[styles.compactRow, { zIndex: 90 }]}>
        {renderAdvanceInput("Total Number of Water Tanks (Underground + Overhead)", "waterTankCount", "0", "numeric")}
        {renderAdvanceInput("Date of Last Water Tank Cleaning", "lastTankCleaningDate", "DD/MM/YYYY")}
        {renderAdvanceDropdown("Is the Water Quality tested annually in a Lab?", "waterQualityTestedAnnually", ["Yes", "No"], advanceFormData.waterQualityTestedAnnually)}
      </View>
      <View style={[styles.compactRow, { zIndex: getRowZIndex(["waterTankAmc", "waterSource"], 80) }]}>
        {renderAdvanceDropdown("Do you have an AMC for Water Tank Cleaning / Chlorination?", "waterTankAmc", ["Yes", "No"], advanceFormData.waterTankAmc)}
        {renderAdvanceDropdown("Source of Water", "waterSource", ["Borewell", "Municipal", "Tanker", "Mixed"], advanceFormData.waterSource)}
      </View>

      <View style={styles.compactDivider} />

      {/* Pest Control */}
      <Text style={styles.sectionHeader}>PEST CONTROL AND SANITIZATION</Text>
      <View style={[styles.compactRow, { zIndex: getRowZIndex(["pestControlFrequency", "antiTermiteAmc"], 70) }]}>
        {renderAdvanceDropdown("Frequency of Pest Control in Common Areas", "pestControlFrequency", ["Monthly", "Quarterly", "Yearly", "As needed"], advanceFormData.pestControlFrequency)}
        {renderAdvanceInput("Date of Last Fogging (for Mosquitoes)", "lastFoggingDate", "DD/MM/YYYY")}
        {renderAdvanceDropdown("Do you have an AMC for Anti-Termite Treatment for the building?", "antiTermiteAmc", ["Yes", "No"], advanceFormData.antiTermiteAmc)}
      </View>

      <View style={styles.compactDivider} />

      {/* Security */}
      <Text style={styles.sectionHeader}>SECURITY AND SURVEILLANCE</Text>
      <View style={[styles.compactRow, { zIndex: getRowZIndex(["hasCctv", "cctvIntercomAmc"], 60) }]}>
        {renderAdvanceDropdown("Does your society have CCTV cameras?", "hasCctv", ["Yes", "No"], advanceFormData.hasCctv)}
        {advanceFormData.hasCctv === "Yes" && renderAdvanceInput("Number of CCTV Cameras installed", "cctvCount", "0", "numeric")}
        {renderAdvanceDropdown("Do you have a maintenance contract for CCTVs and Intercoms?", "cctvIntercomAmc", ["Yes", "No"], advanceFormData.cctvIntercomAmc)}
      </View>
      <View style={[styles.compactRow, { zIndex: getRowZIndex(["gateSecurityType"], 50) }]}>
        {renderAdvanceDropdown("Type of Main Gate Security?", "gateSecurityType", ["Manual", "App", "Both", "None"], advanceFormData.gateSecurityType)}
      </View>

      <View style={styles.compactDivider} />

      {/* Others */}
      <Text style={styles.sectionHeader}>OTHER FACILITIES AND SERVICES</Text>
      <View style={[styles.compactRow, { zIndex: getRowZIndex(["waterMetering", "evCharging", "solarRoofTop", "pumpStpGenAmc"], 40) }]}>
        {renderAdvanceDropdown("Water Metering (Individual Flats)?", "waterMetering", ["Yes", "No", "NR"], advanceFormData.waterMetering)}
        {renderAdvanceDropdown("EV Charging Infrastructure?", "evCharging", ["Yes", "No", "NR"], advanceFormData.evCharging)}
        {renderAdvanceDropdown("Solar Roof-Top?", "solarRoofTop", ["Yes", "No", "NR"], advanceFormData.solarRoofTop)}
        {renderAdvanceDropdown("Do you have an AMC for the Water Pumps/STP/Generators?", "pumpStpGenAmc", ["Yes", "No"], advanceFormData.pumpStpGenAmc)}
      </View>
      <View style={{ marginTop: 8, zIndex: 10 }}>
        {/* Removed mixed water source input box per user request */}
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.mainContainer}
    >
      <StatusBar barStyle="dark-content" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={styles.headerBackButton}
          onPress={isEditMode ? () => router.back() : handleBackToLogin}
        >
          <Ionicons name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>

        <View style={styles.headerContainer}>
          <Text style={styles.title}>
            {isEditMode ? "Society Profile" : "Society Setup"}
          </Text>
          <Text style={styles.description}>
            {isEditMode
              ? "Update your society details and administration information."
              : "Register your society to start managing staff documentation."}
          </Text>
        </View>

        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === "basic" && styles.activeTab]}
            onPress={() => setActiveTab("basic")}
          >
            <Text style={[styles.tabText, activeTab === "basic" && styles.activeTabText]}>Basic</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "advance" && styles.activeTab]}
            onPress={() => setActiveTab("advance")}
          >
            <Text style={[styles.tabText, activeTab === "advance" && styles.activeTabText]}>Advance</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          {activeTab === "basic" ? (
            <>
              <Text style={styles.sectionHeader}>SOCIETY INFORMATION</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Society Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Blue Ridge Society"
                  placeholderTextColor="#94A3B8"
                  value={formData.societyName}
                  onChangeText={(val) => handleInputChange("societyName", val)}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Society Address</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="e.g. 123 Street, Pune, India"
                  placeholderTextColor="#94A3B8"
                  value={formData.societyAddress}
                  onChangeText={(val) => handleInputChange("societyAddress", val)}
                  multiline
                />
              </View>

              <View style={styles.row}>
                <View style={styles.flex1}>
                  <Text style={styles.label}>Pincode *</Text>
                  <TextInput
                    style={[styles.input, formErrors.pincode ? styles.inputError : null]}
                    placeholder="411057"
                    placeholderTextColor="#94A3B8"
                    value={formData.pincode}
                    onChangeText={(val) => handleInputChange("pincode", val)}
                    keyboardType="numeric"
                    maxLength={6}
                  />
                  {formErrors.pincode ? <Text style={styles.errorText}>{formErrors.pincode}</Text> : null}
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.label}>Wings/Blocks *</Text>
                  <TextInput
                    style={[styles.input, isEditMode && styles.inputDisabled]}
                    placeholder="e.g. 5"
                    placeholderTextColor="#94A3B8"
                    value={formData.wingCount}
                    onChangeText={(val) => handleInputChange("wingCount", val)}
                    keyboardType="numeric"
                    maxLength={3}
                    editable={!isEditMode}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Society Registration No.</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. SR/12345/2026"
                  placeholderTextColor="#94A3B8"
                  value={formData.registrationNo}
                  onChangeText={(val) => handleInputChange("registrationNo", val)}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Google Maps Location URL</Text>
                <TextInput
                  style={[styles.input, formErrors.googleLocation ? styles.inputError : null]}
                  placeholder="https://goo.gl/maps/..."
                  placeholderTextColor="#94A3B8"
                  value={formData.googleLocation}
                  onChangeText={(val) => handleInputChange("googleLocation", val)}
                />
                {formErrors.googleLocation ? <Text style={styles.errorText}>{formErrors.googleLocation}</Text> : null}
              </View>

              <View style={styles.divider} />

              <Text style={styles.sectionHeader}>ADMIN DETAILS</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Admin Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Harshal Patil"
                  placeholderTextColor="#94A3B8"
                  value={formData.adminName}
                  onChangeText={(val) => handleInputChange("adminName", val)}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Admin Contact</Text>
                <TextInput
                  style={[styles.input, formErrors.adminContact ? styles.inputError : null]}
                  placeholder="e.g. 9876543210"
                  placeholderTextColor="#94A3B8"
                  value={formData.adminContact}
                  onChangeText={(val) => handleInputChange("adminContact", val)}
                  keyboardType="phone-pad"
                  maxLength={10}
                />
                {formErrors.adminContact ? <Text style={styles.errorText}>{formErrors.adminContact}</Text> : null}
              </View>
            </>
          ) : (
            renderAdvanceForm()
          )}

          <TouchableOpacity
            style={[
              styles.primaryButton,
              isSubmitting && styles.buttonDisabled,
            ]}
            onPress={handleSetup}
            disabled={isSubmitting}
          >
            <Text style={styles.buttonText}>
              {isSubmitting
                ? isEditMode
                  ? "Updating..."
                  : "Registering..."
                : isEditMode
                  ? "Update Profile"
                  : "Complete Setup"}
            </Text>
          </TouchableOpacity>

          {isEditMode ? (
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
              disabled={isSubmitting}
            >
              <Text style={styles.backButtonText}>Cancel Updates</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.backButton}
              onPress={handleBackToLogin}
              disabled={isSubmitting}
            >
              <Text style={styles.backButtonText}>Back to Login</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView >
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: "#F1F5F9",
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 60,
  },
  headerBackButton: {
    position: "absolute",
    top: 20,
    left: 20,
    zIndex: 10,
    padding: 8,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerContainer: {
    marginBottom: 32,
    alignItems: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  description: {
    fontSize: 16,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 5,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "visible", // Fix for dropdown clipping
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: "800",
    color: "#3B82F6",
    letterSpacing: 1.5,
    marginBottom: 20,
    marginTop: 8,
  },
  inputGroup: {
    marginBottom: 20,
    position: "relative",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    color: "#0F172A",
  },
  inputDisabled: {
    backgroundColor: "#F1F5F9",
    color: "#94A3B8",
  },
  textArea: {
    height: 100,
    textAlignVertical: "top",
  },
  row: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 20,
  },
  flex1: {
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginVertical: 24,
  },
  primaryButton: {
    backgroundColor: "#0F172A",
    padding: 20,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 12,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  backButton: {
    marginTop: 20,
    padding: 12,
    alignItems: "center",
  },
  backButtonText: {
    color: "#64748B",
    fontSize: 15,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#E2E8F0",
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
  },
  activeTab: {
    backgroundColor: "#FFFFFF",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748B",
  },
  activeTabText: {
    color: "#3B82F6",
  },
  dropdownButton: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    padding: 16,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dropdownText: {
    fontSize: 16,
    color: "#0F172A",
    fontWeight: "500",
  },
  placeholderText: {
    color: "#94A3B8",
  },
  dropdownList: {
    position: "absolute",
    top: 78,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    zIndex: 5000,
    elevation: 10,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    overflow: "hidden",
  },
  dropdownItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  dropdownItemText: {
    fontSize: 15,
    color: "#475569",
    fontWeight: "500",
  },
  activeDropdownText: {
    color: "#3B82F6",
    fontWeight: "700",
  },
  compactRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  advanceInputGroup: {
    position: "relative",
    marginBottom: 4,
  },
  compactLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 4,
    marginLeft: 2,
    height: 32, // Increased height to accommodate larger font for 2 lines
  },
  compactInput: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 8,
    borderRadius: 8,
    fontSize: 13,
    color: "#0F172A",
  },
  compactDropdownButton: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 8,
    borderRadius: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  compactDropdownText: {
    fontSize: 13,
    color: "#0F172A",
    fontWeight: "500",
    maxWidth: "85%",
  },
  compactDropdownList: {
    position: "absolute",
    top: 40,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    zIndex: 10000,
    elevation: 20,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    overflow: "visible",
  },
  compactDropdownItemText: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "500",
    padding: 8,
  },
  compactDivider: {
    height: 1.5,
    backgroundColor: "#E2E8F0",
    marginVertical: 16,
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
});
