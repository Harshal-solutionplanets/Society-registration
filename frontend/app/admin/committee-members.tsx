import { appId, db } from "@/configs/firebaseConfig";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "expo-router";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from "firebase/firestore";
import * as React from "react";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import Toast from "react-native-toast-message";

interface Wing {
  id: string;
  name: string;
  isConfigured?: boolean;
}

interface CommitteeMember {
  id: string;
  name: string;
  post: string;
  phone: string;
  email: string;
  wing: string;
  flatNo: string;
  floor: string;
  level: string; // 'society' or wingId
  nonResidentAddress?: string;
}

const COMMITTEE_POSTS = [
  "Chairman",
  "Secretary",
  "Treasurer",
  "Committee Member",
  "Vice Chairman",
  "Joint Secretary",
  "Manager",
  "Joint Treasurer",
  "Accountant",
];

export default function CommitteeMembers() {
  const router = useRouter();
  const { user } = useAuth();
  const { width } = useWindowDimensions();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [wings, setWings] = useState<Wing[]>([]);
  const [selectedLevel, setSelectedLevel] = useState("society");
  const [members, setMembers] = useState<CommitteeMember[]>([]);

  // Form state
  const [name, setName] = useState("");
  const [post, setPost] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [wing, setWing] = useState("");
  const [flatNo, setFlatNo] = useState("");
  const [floor, setFloor] = useState("");
  const [nonResidentAddress, setNonResidentAddress] = useState("");
  const [showPostDropdown, setShowPostDropdown] = useState(false);
  const [showWingDropdown, setShowWingDropdown] = useState(false);
  const [showFloorDropdown, setShowFloorDropdown] = useState(false);
  const [showFlatDropdown, setShowFlatDropdown] = useState(false);

  const [floorsList, setFloorsList] = useState<string[]>([]);
  const [flatsList, setFlatsList] = useState<string[]>([]);
  const [additionalWingPosts, setAdditionalWingPosts] = useState<
    Record<string, string>
  >({});
  const [showAdditionalPostDropdown, setShowAdditionalPostDropdown] = useState<
    Record<string, boolean>
  >({});
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState("");
  const [formErrors, setFormErrors] = useState({
    phone: "",
    email: "",
  });

  // Auto-fill logic state
  const [lastSavedByPost, setLastSavedByPost] = useState<Record<string, any>>(
    {},
  );
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [suggestedData, setSuggestedData] = useState<any>(null);

  useEffect(() => {
    if (user) {
      fetchInitialData();
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchMembers();
    }
  }, [user, selectedLevel]);

  // Handle suggestion logic
  useEffect(() => {
    if (selectedLevel !== "society" && post && lastSavedByPost[post]) {
      setSuggestedData(lastSavedByPost[post]);
      setShowSuggestion(true);
    } else {
      setShowSuggestion(false);
    }
  }, [post, selectedLevel]);

  const fetchInitialData = async () => {
    if (!user) return;
    try {
      const societyPath = `artifacts/${appId}/public/data/societies/${user.uid}`;
      const wingsRef = collection(db, `${societyPath}/wings`);
      const wingsSnapshot = await getDocs(wingsRef);
      const fetchedWings = wingsSnapshot.docs.map((doc) => ({
        id: doc.id,
        name: doc.data().name,
        isConfigured: doc.data().isConfigured || false,
      })) as Wing[];
      setWings(fetchedWings);
    } catch (error) {
      console.error("Error fetching wings:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMembers = async () => {
    if (!user) return;
    try {
      let membersRef;
      if (selectedLevel === "society") {
        membersRef = collection(
          db,
          `artifacts/${appId}/public/data/societies/${user.uid}/society_committee_members`,
        );
      } else {
        const wingObj = wings.find((w) => w.id === selectedLevel);
        if (!wingObj) return;
        membersRef = collection(
          db,
          `artifacts/${appId}/public/data/societies/${user.uid}/wings/${wingObj.id}/wing_committee_members`,
        );
      }

      const snapshot = await getDocs(membersRef);
      const fetchedMembers = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as CommitteeMember[];
      setMembers(fetchedMembers);
    } catch (error) {
      console.error("Error fetching members:", error);
    }
  };

  const handleWingSelect = async (selectedWing: Wing) => {
    setWing(selectedWing.name);
    setFloor("");
    setFlatNo("");
    setNonResidentAddress("");
    setFloorsList([]);
    setFlatsList([]);
    setShowWingDropdown(false);

    try {
      const wingRef = doc(
        db,
        `artifacts/${appId}/public/data/societies/${user.uid}/wings/${selectedWing.id}`,
      );
      const wingDoc = await getDoc(wingRef);
      if (wingDoc.exists()) {
        const data = wingDoc.data();
        const floorNums =
          data.floors?.map((f: any) => f.floorNumber.toString()) || [];
        setFloorsList(
          floorNums.sort((a: string, b: string) => parseInt(a) - parseInt(b)),
        );
      }
    } catch (error) {
      console.error("Error fetching floors:", error);
    }
  };

  const handleNonResidentSelect = () => {
    setWing("Non-Resident");
    setFloor("N/A");
    setFlatNo("N/A");
    setFloorsList(["N/A"]);
    setFlatsList(["N/A"]);
    setNonResidentAddress("");
    setShowWingDropdown(false);
  };

  const handleFloorSelect = async (selectedFloor: string) => {
    setFloor(selectedFloor);
    setFlatNo("");
    setFlatsList([]);
    setShowFloorDropdown(false);

    try {
      const selectedWingObj = wings.find((w: Wing) => w.name === wing);
      if (!selectedWingObj) return;

      const flatsPath = `artifacts/${appId}/public/data/societies/${user.uid}/wings/${selectedWingObj.id}/${selectedFloor}`;
      const snapshot = await getDocs(collection(db, flatsPath));
      const flatNames = snapshot.docs
        .map((doc) => doc.data().unitName)
        .filter(Boolean);
      setFlatsList(
        flatNames.sort((a: string, b: string) =>
          a.localeCompare(b, undefined, { numeric: true }),
        ),
      );
    } catch (error) {
      console.error("Error fetching flats:", error);
    }
  };

  const handlePhoneChange = (val: string) => {
    // Allow digits only (optional)
    const sanitized = val.replace(/[^0-9]/g, "");
    if (sanitized.length > 10) return;
    setPhone(sanitized);
    // Validation removed as per request
    setFormErrors((prev) => ({ ...prev, phone: "" }));
  };

  const handleEmailChange = (val: string) => {
    setEmail(val);
    if (val.length > 0) {
      if (!val.toLowerCase().endsWith("@gmail.com")) {
        setFormErrors((prev) => ({
          ...prev,
          email: "Only @gmail.com is allowed",
        }));
      } else {
        setFormErrors((prev) => ({ ...prev, email: "" }));
      }
    } else {
      setFormErrors((prev) => ({ ...prev, email: "" }));
    }
  };

  const handleAddMember = async () => {
    if (!user) return;

    // Validation check
    if (phone.length !== 10) {
      setFormErrors((prev) => ({ ...prev, phone: "Phone must be 10 digits" }));
      return;
    }
    if (email && !email.toLowerCase().endsWith("@gmail.com")) {
      setFormErrors((prev) => ({
        ...prev,
        email: "Only @gmail.com is allowed",
      }));
      return;
    }

    // Phone number is now optional
    if (!name || !post || !wing) {
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Please fill all required fields",
      });
      return;
    }

    if (wing === "Non-Resident") {
      if (!nonResidentAddress.trim()) {
        Toast.show({
          type: "error",
          text1: "Error",
          text2: "Please enter complete address",
        });
        return;
      }
    } else if (!flatNo) {
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Please select flat",
      });
      return;
    }

    // Validate Resident Match (if not Non-Resident)
    if (wing !== "Non-Resident") {
      const targetWing = wings.find((w) => w.name === wing);
      if (!targetWing) {
        Toast.show({ type: "error", text1: "Invalid Wing" });
        return;
      }

      // Fix: Uppercase ID for Resident Path to match likely storage format
      const wingIdSanitized = targetWing.id.replace(/\s+/g, "_").toUpperCase();
      const resId = `${wingIdSanitized}-${floor}-${flatNo}`;
      const residentPath = `artifacts/${appId}/public/data/societies/${user.uid}/Residents/${resId}`;

      try {
        const residentDoc = await getDoc(doc(db, residentPath));
        if (!residentDoc.exists()) {
          console.error(
            "Resident ID not found:",
            resId,
            "using path:",
            residentPath,
          );
          Toast.show({
            type: "error",
            text1: "Unit Not Registered",
            text2: "No resident found in this unit.",
          });
          return;
        }

        const resData = residentDoc.data();
        const primaryName = resData.residentName || "";
        // Check both 'members' (legacy) and 'familyDetails' (new form)
        const familyMembers = resData.familyDetails || resData.members || [];

        const isPrimary =
          primaryName.trim().toLowerCase() === name.trim().toLowerCase();

        // Robust check for family members (handle object structure)
        const isFamily =
          Array.isArray(familyMembers) &&
          familyMembers.some(
            (m: any) =>
              (m.name || "").trim().toLowerCase() === name.trim().toLowerCase(),
          );

        if (!isPrimary && !isFamily) {
          // Notification Removed
          Toast.show({
            type: "error",
            text1: "Person Mismatch",
            text2: "Person not found in this unit (Primary or Family).",
          });
          return;
        }
      } catch (err) {
        console.error("Validation error:", err);
        Toast.show({ type: "error", text1: "Validation Failed" });
        return;
      }
    }

    setSaving(true);
    try {
      const formattedName = name
        .toLowerCase()
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");

      const memberId = formattedName;
      const memberData: CommitteeMember = {
        id: memberId,
        name: formattedName,
        post,
        phone,
        email,
        wing,
        flatNo: wing === "Non-Resident" ? "N/A" : flatNo,
        floor: wing === "Non-Resident" ? "N/A" : floor,
        level: selectedLevel,
        nonResidentAddress: wing === "Non-Resident" ? nonResidentAddress : "",
      };

      let memberPath = "";
      if (selectedLevel === "society") {
        memberPath = `artifacts/${appId}/public/data/societies/${user.uid}/society_committee_members/${memberId}`;
      } else {
        const wingObj = wings.find((w) => w.id === selectedLevel);
        if (!wingObj) throw new Error("Wing not found");
        memberPath = `artifacts/${appId}/public/data/societies/${user.uid}/wings/${wingObj.id}/wing_committee_members/${memberId}`;
      }

      // Handle name change during edit (delete old record if ID changes)
      if (isEditing && editId !== memberId) {
        let oldPath = "";
        if (selectedLevel === "society") {
          oldPath = `artifacts/${appId}/public/data/societies/${user.uid}/society_committee_members/${editId}`;
        } else {
          const wingObj = wings.find((w) => w.id === selectedLevel);
          if (wingObj) {
            oldPath = `artifacts/${appId}/public/data/societies/${user.uid}/wings/${wingObj.id}/wing_committee_members/${editId}`;
          }
        }
        if (oldPath) await deleteDoc(doc(db, oldPath));
      }

      await setDoc(doc(db, memberPath), memberData);

      setMembers((prev) => {
        const filtered = prev.filter((m) => m.id !== memberId);
        return [...filtered, memberData];
      });

      // Save to additional wings if selected (with their specific posts)
      for (const [additionalWingId, additionalPost] of Object.entries(
        additionalWingPosts,
      )) {
        if (additionalPost) {
          const addWingObj = wings.find((w) => w.id === additionalWingId);
          if (addWingObj) {
            const addMemberPath = `artifacts/${appId}/public/data/societies/${user.uid}/wings/${addWingObj.id}/wing_committee_members/${memberId}`;
            await setDoc(doc(db, addMemberPath), {
              ...memberData,
              post: additionalPost,
              level: additionalWingId,
            });
          }
        }
      }

      // Reset form
      setName("");
      setPost("");
      setPhone("");
      setEmail("");
      setWing("");
      setFlatNo("");
      setFloor("");
      setNonResidentAddress(""); // Reset non-resident adr
      setAdditionalWingPosts({});
      setShowAdditionalPostDropdown({});

      // Save to auto-fill store
      setLastSavedByPost((prev: Record<string, any>) => ({
        ...prev,
        [post]: { name, phone, email, floor, flatNo },
      }));

      setIsEditing(false);
      setEditId("");

      Toast.show({
        type: "success",
        text1: isEditing ? "Member Updated" : "Member Added",
        text2: `${name} has been ${isEditing ? "updated" : "added"}.`,
      });
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMember = async (member: CommitteeMember) => {
    if (!user) return;

    const confirmMessage = `Are you sure you want to remove ${member.name}?`;
    const confirmDelete =
      Platform.OS === "web"
        ? window.confirm(confirmMessage)
        : await new Promise<boolean>((resolve) => {
            Alert.alert("Delete Member", confirmMessage, [
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

    try {
      let memberPath = "";
      if (selectedLevel === "society") {
        memberPath = `artifacts/${appId}/public/data/societies/${user.uid}/society_committee_members/${member.id}`;
      } else {
        const wingObj = wings.find((w) => w.id === selectedLevel);
        if (!wingObj) throw new Error("Wing not found");
        memberPath = `artifacts/${appId}/public/data/societies/${user.uid}/wings/${wingObj.id}/wing_committee_members/${member.id}`;
      }

      await deleteDoc(doc(db, memberPath));
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
      Toast.show({
        type: "info",
        text1: "Member Removed",
      });
    } catch (error: any) {
      Alert.alert("Error", error.message);
    }
  };

  const handleEditMember = (member: CommitteeMember) => {
    setName(member.name);
    setPost(member.post);
    setPhone(member.phone);
    setEmail(member.email);
    setWing(member.wing);
    setFloor(member.floor);
    setFlatNo(member.flatNo);
    setNonResidentAddress(member.nonResidentAddress || "");
    setIsEditing(true);
    setEditId(member.id);

    // Scroll to top to show form
    // Optional: add a ref to ScrollView
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
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
          <Text style={styles.title}>Committee Members</Text>
        </View>

        <View style={styles.levelSelector}>
          <Text style={styles.sectionLabel}>Select committee</Text>
          <View style={styles.wingsGrid}>
            <TouchableOpacity
              style={[
                styles.levelBtn,
                selectedLevel === "society" && styles.levelBtnActive,
              ]}
              onPress={() => {
                setSelectedLevel("society");
                setWing("");
                setFloor("");
                setFlatNo("");
                setFloorsList([]);
                setFlatsList([]);
              }}
            >
              <Text
                style={[
                  styles.levelBtnText,
                  selectedLevel === "society" && styles.levelBtnTextActive,
                ]}
              >
                Complete Society
              </Text>
            </TouchableOpacity>
            {/* Configured Wings */}
            {wings
              .filter((w) => w.isConfigured)
              .map((w: Wing) => (
                <TouchableOpacity
                  key={w.id}
                  style={[
                    styles.levelBtn,
                    selectedLevel === w.id && styles.levelBtnActive,
                  ]}
                  onPress={() => {
                    setSelectedLevel(w.id);
                    handleWingSelect(w);
                  }}
                >
                  <Text
                    style={[
                      styles.levelBtnText,
                      selectedLevel === w.id && styles.levelBtnTextActive,
                    ]}
                  >
                    {w.name}
                  </Text>
                </TouchableOpacity>
              ))}
            {/* Other Wings */}
            {wings
              .filter((w) => !w.isConfigured)
              .map((w: Wing) => (
                <TouchableOpacity
                  key={w.id}
                  style={[
                    styles.levelBtn,
                    selectedLevel === w.id && styles.levelBtnActive,
                  ]}
                  onPress={() => {
                    setSelectedLevel(w.id);
                    handleWingSelect(w);
                  }}
                >
                  <Text
                    style={[
                      styles.levelBtnText,
                      selectedLevel === w.id && styles.levelBtnTextActive,
                    ]}
                  >
                    {w.name}
                  </Text>
                </TouchableOpacity>
              ))}
          </View>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>
            {isEditing ? "Edit Member" : "Add New Member"}
          </Text>

          {showSuggestion && (
            <View style={styles.suggestionBanner}>
              <View style={styles.suggestionInfo}>
                <Text style={styles.suggestionTitle}>
                  Use details from previous wing?
                </Text>
                <Text style={styles.suggestionText}>
                  We found previous details for {post}: {suggestedData?.name}
                </Text>
              </View>
              <View style={styles.suggestionActions}>
                <TouchableOpacity
                  style={styles.suggestionBtnYes}
                  onPress={() => {
                    setName(suggestedData.name);
                    setPhone(suggestedData.phone);
                    setEmail(suggestedData.email);
                    setShowSuggestion(false);
                  }}
                >
                  <Text style={styles.suggestionBtnTextYes}>Yes</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.suggestionBtnNo}
                  onPress={() => setShowSuggestion(false)}
                >
                  <Text style={styles.suggestionBtnTextNo}>No</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          <View
            style={{
              flexDirection: width > 768 ? "row" : "column",
              gap: 10,
              width: "100%",
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Name"
                value={name}
                onChangeText={setName}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Phone Number</Text>
              <TextInput
                style={[
                  styles.input,
                  formErrors.phone ? styles.inputError : null,
                ]}
                placeholder="e.g. 9876543210"
                value={phone}
                onChangeText={handlePhoneChange}
                keyboardType="phone-pad"
                maxLength={10}
              />
              {formErrors.phone ? (
                <Text style={styles.errorText}>{formErrors.phone}</Text>
              ) : null}
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={[
                  styles.input,
                  formErrors.email ? styles.inputError : null,
                ]}
                placeholder="e.g. member@gmail.com"
                value={email}
                onChangeText={handleEmailChange}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              {formErrors.email ? (
                <Text style={styles.errorText}>{formErrors.email}</Text>
              ) : null}
            </View>
          </View>

          <View style={{ zIndex: 1000, position: "relative" }}>
            <Text style={styles.label}>Committee member Position</Text>
            <TouchableOpacity
              style={styles.dropdownButton}
              onPress={() => setShowPostDropdown(!showPostDropdown)}
            >
              <Text
                style={[
                  styles.dropdownButtonText,
                  !post && { color: "#94A3B8" },
                ]}
              >
                {post || "Select Post"}
              </Text>
              <Text style={styles.dropdownArrow}>
                {showPostDropdown ? "▲" : "▼"}
              </Text>
            </TouchableOpacity>

            {showPostDropdown && (
              <View style={styles.dropdownListContainer}>
                <ScrollView
                  style={styles.dropdownList}
                  nestedScrollEnabled={true}
                  keyboardShouldPersistTaps="handled"
                >
                  {COMMITTEE_POSTS.map((item) => (
                    <TouchableOpacity
                      key={item}
                      style={[
                        styles.dropdownItem,
                        post === item && styles.dropdownItemSelected,
                      ]}
                      onPress={() => {
                        setPost(item);
                        setShowPostDropdown(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.dropdownItemText,
                          post === item && styles.dropdownItemTextSelected,
                        ]}
                      >
                        {item}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          <View style={[styles.row, { zIndex: 900 }]}>
            {/* Wing Dropdown */}
            <View style={{ flex: 1, position: "relative" }}>
              <TouchableOpacity
                style={[styles.dropdownButton, { marginBottom: 0 }]}
                onPress={() => setShowWingDropdown(!showWingDropdown)}
              >
                <Text
                  style={[
                    styles.dropdownButtonText,
                    { fontSize: 13 },
                    !wing && { color: "#94A3B8" },
                  ]}
                  numberOfLines={1}
                >
                  {wing || "Wing"}
                </Text>
              </TouchableOpacity>
              {showWingDropdown && (
                <View style={[styles.dropdownListContainer, { top: 48 }]}>
                  <ScrollView
                    style={styles.dropdownList}
                    nestedScrollEnabled={true}
                    keyboardShouldPersistTaps="handled"
                  >
                    {/* Configured Wings */}
                    {wings
                      .filter((w) => w.isConfigured)
                      .map((w: Wing) => (
                        <TouchableOpacity
                          key={w.id}
                          style={styles.dropdownItem}
                          onPress={() => handleWingSelect(w)}
                        >
                          <Text style={styles.dropdownItemText}>{w.name}</Text>
                        </TouchableOpacity>
                      ))}
                    {/* Other Wings */}
                    {wings
                      .filter((w) => !w.isConfigured)
                      .map((w: Wing) => (
                        <TouchableOpacity
                          key={w.id}
                          style={styles.dropdownItem}
                          onPress={() => handleWingSelect(w)}
                        >
                          <Text style={styles.dropdownItemText}>{w.name}</Text>
                        </TouchableOpacity>
                      ))}
                    {/* Non-Resident Option */}
                    <TouchableOpacity
                      style={styles.dropdownItem}
                      onPress={() => handleNonResidentSelect()}
                    >
                      <Text style={styles.dropdownItemText}>Non-Resident</Text>
                    </TouchableOpacity>
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Floor and Flat Dropdowns OR Address for Non-Resident */}
            {wing === "Non-Resident" ? (
              <View style={{ flex: 2 }}>
                <TextInput
                  style={[styles.input, { marginBottom: 0 }]}
                  placeholder="Complete address of a non-resident committee member"
                  value={nonResidentAddress}
                  onChangeText={setNonResidentAddress}
                  multiline
                />
              </View>
            ) : (
              <>
                {/* Floor Dropdown */}
                <View style={{ flex: 1, position: "relative" }}>
                  <TouchableOpacity
                    style={[styles.dropdownButton, { marginBottom: 0 }]}
                    onPress={() => {
                      if (!wing)
                        return Toast.show({
                          type: "info",
                          text1: "Select Wing First",
                        });
                      setShowFloorDropdown(!showFloorDropdown);
                    }}
                  >
                    <Text
                      style={[
                        styles.dropdownButtonText,
                        { fontSize: 13 },
                        !floor && { color: "#94A3B8" },
                      ]}
                      numberOfLines={1}
                    >
                      {floor !== "" ? `Flr ${floor}` : "Floor"}
                    </Text>
                  </TouchableOpacity>
                  {showFloorDropdown && (
                    <View style={[styles.dropdownListContainer, { top: 48 }]}>
                      <ScrollView
                        style={styles.dropdownList}
                        nestedScrollEnabled={true}
                        keyboardShouldPersistTaps="handled"
                      >
                        {floorsList.map((f: string) => (
                          <TouchableOpacity
                            key={f}
                            style={styles.dropdownItem}
                            onPress={() => handleFloorSelect(f)}
                          >
                            <Text style={styles.dropdownItemText}>
                              {f === "0" ? "Ground" : `Floor ${f}`}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>

                {/* Flat Dropdown */}
                <View style={{ flex: 1, position: "relative" }}>
                  <TouchableOpacity
                    style={[styles.dropdownButton, { marginBottom: 0 }]}
                    onPress={() => {
                      if (!floor)
                        return Toast.show({
                          type: "info",
                          text1: "Select Floor First",
                        });
                      setShowFlatDropdown(!showFlatDropdown);
                    }}
                  >
                    <Text
                      style={[
                        styles.dropdownButtonText,
                        { fontSize: 13 },
                        !flatNo && { color: "#94A3B8" },
                      ]}
                      numberOfLines={1}
                    >
                      {flatNo || "Flat"}
                    </Text>
                  </TouchableOpacity>
                  {showFlatDropdown && (
                    <View style={[styles.dropdownListContainer, { top: 48 }]}>
                      <ScrollView
                        style={styles.dropdownList}
                        nestedScrollEnabled={true}
                        keyboardShouldPersistTaps="handled"
                      >
                        {flatsList.map((flat: string) => (
                          <TouchableOpacity
                            key={flat}
                            style={styles.dropdownItem}
                            onPress={() => {
                              setFlatNo(flat);
                              setShowFlatDropdown(false);
                            }}
                          >
                            <Text style={styles.dropdownItemText}>{flat}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>
              </>
            )}
          </View>

          {/* Additional Wings Multi-select Section */}
          <View
            style={[
              styles.additionalWingsSection,
              Object.values(showAdditionalPostDropdown).some((v) => v) && {
                zIndex: 3000,
              },
              { flexDirection: "row", flexWrap: "wrap", gap: 10 },
            ]}
          >
            <Text style={[styles.additionalWingsLabel, { width: "100%" }]}>
              Is this person a committee member of any other wing?
            </Text>
            {wings
              .filter((w) => w.id !== selectedLevel)
              .map((w) => (
                <View
                  key={w.id}
                  style={[
                    styles.additionalWingItem,
                    showAdditionalPostDropdown[w.id] && { zIndex: 1000 },
                    { width: width > 768 ? "32%" : "100%" },
                  ]}
                >
                  <TouchableOpacity
                    style={styles.checkboxRow}
                    onPress={() => {
                      if (additionalWingPosts[w.id] !== undefined) {
                        // Remove this wing
                        setAdditionalWingPosts((prev) => {
                          const newPosts = { ...prev };
                          delete newPosts[w.id];
                          return newPosts;
                        });
                        setShowAdditionalPostDropdown((prev) => {
                          const newDropdowns = { ...prev };
                          delete newDropdowns[w.id];
                          return newDropdowns;
                        });
                      } else {
                        // Add this wing with empty post
                        setAdditionalWingPosts((prev) => ({
                          ...prev,
                          [w.id]: "",
                        }));
                      }
                    }}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        additionalWingPosts[w.id] !== undefined &&
                          styles.checkboxActive,
                      ]}
                    >
                      {additionalWingPosts[w.id] !== undefined && (
                        <View style={styles.checkboxTick} />
                      )}
                    </View>
                    <Text style={styles.checkboxLabel}>{w.name}</Text>
                  </TouchableOpacity>

                  {/* Post dropdown for this wing */}
                  {additionalWingPosts[w.id] !== undefined && (
                    <View style={styles.additionalWingPostContainer}>
                      <Text style={styles.additionalWingPostLabel}>
                        Committee member post
                      </Text>
                      <View style={{ zIndex: 1000, position: "relative" }}>
                        <TouchableOpacity
                          style={styles.dropdownButton}
                          onPress={() =>
                            setShowAdditionalPostDropdown((prev) => ({
                              ...prev,
                              [w.id]: !prev[w.id],
                            }))
                          }
                        >
                          <Text
                            style={[
                              styles.dropdownButtonText,
                              !additionalWingPosts[w.id] && {
                                color: "#94A3B8",
                              },
                            ]}
                          >
                            {additionalWingPosts[w.id] || "Select Post"}
                          </Text>
                          <Text style={styles.dropdownArrow}>▼</Text>
                        </TouchableOpacity>
                        {showAdditionalPostDropdown[w.id] && (
                          <View style={styles.dropdownListContainer}>
                            <ScrollView style={styles.dropdownList}>
                              {COMMITTEE_POSTS.map((p) => (
                                <TouchableOpacity
                                  key={p}
                                  style={[
                                    styles.dropdownItem,
                                    additionalWingPosts[w.id] === p &&
                                      styles.dropdownItemSelected,
                                  ]}
                                  onPress={() => {
                                    setAdditionalWingPosts((prev) => ({
                                      ...prev,
                                      [w.id]: p,
                                    }));
                                    setShowAdditionalPostDropdown((prev) => ({
                                      ...prev,
                                      [w.id]: false,
                                    }));
                                  }}
                                >
                                  <Text
                                    style={[
                                      styles.dropdownItemText,
                                      additionalWingPosts[w.id] === p &&
                                        styles.dropdownItemTextSelected,
                                    ]}
                                  >
                                    {p}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          </View>
                        )}
                      </View>
                    </View>
                  )}
                </View>
              ))}
          </View>

          <TouchableOpacity
            style={[styles.addBtn, saving && styles.disabledBtn]}
            onPress={handleAddMember}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.addBtnText}>
                {isEditing ? "Update Member" : "Add Member"}
              </Text>
            )}
          </TouchableOpacity>
          {isEditing && (
            <TouchableOpacity
              style={[styles.cancelBtn, { marginTop: 10 }]}
              onPress={() => {
                setIsEditing(false);
                setEditId("");
                setName("");
                setPost("");
                setPhone("");
                setEmail("");
                setWing("");
                setFloor("");
                setFlatNo("");
              }}
            >
              <Text style={styles.cancelBtnText}>Cancel Edit</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.listSection}>
          <Text style={styles.sectionTitle}>
            {selectedLevel === "society" ? "Society" : "Wing"} Committee
          </Text>
          {members.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                No members added yet for this level.
              </Text>
            </View>
          ) : (
            members.map((member: CommitteeMember) => (
              <View key={member.id} style={styles.memberCard}>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{member.name}</Text>
                  <Text style={styles.memberPost}>
                    {member.post} • {member.wing || "Wing N/A"} - Flat{" "}
                    {member.flatNo}
                  </Text>
                  <Text style={styles.memberContact}>{member.phone}</Text>
                </View>
                <View style={styles.memberActions}>
                  <TouchableOpacity
                    style={styles.editBtn}
                    onPress={() => handleEditMember(member)}
                  >
                    <Text style={styles.editBtnText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDeleteMember(member)}
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
    backgroundColor: "#F8F9FA",
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
    borderBottomColor: "#EEE",
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
  levelSelector: {
    padding: 20,
    backgroundColor: "#fff",
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    marginBottom: 12,
  },
  scrollSelector: {
    flexDirection: "row",
  },
  wingsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  levelBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#F1F3F5",
    marginRight: 10,
    borderWidth: 1,
    borderColor: "#E9ECEF",
  },
  levelBtnActive: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
  levelBtnText: {
    color: "#495057",
    fontWeight: "600",
  },
  levelBtnTextActive: {
    color: "#fff",
  },
  formSection: {
    padding: 20,
    backgroundColor: "#fff",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 15,
  },
  input: {
    backgroundColor: "#F8F9FA",
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#DEE2E6",
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  addBtn: {
    backgroundColor: "#34C759",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 5,
  },
  addBtnText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
  disabledBtn: {
    opacity: 0.7,
  },
  listSection: {
    padding: 20,
  },
  memberCard: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#EEE",
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
  },
  memberPost: {
    fontSize: 13,
    color: "#666",
    marginBottom: 4,
  },
  memberContact: {
    fontSize: 13,
    color: "#007AFF",
  },
  deleteBtn: {
    padding: 8,
    backgroundColor: "#FEE2E2",
    borderRadius: 6,
  },
  deleteBtnText: {
    color: "#FF3B30",
    fontWeight: "600",
  },
  memberActions: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  editBtn: {
    padding: 8,
    backgroundColor: "#E7F3FF",
    borderRadius: 6,
  },
  editBtnText: {
    color: "#007AFF",
    fontWeight: "600",
    fontSize: 13,
  },
  cancelBtn: {
    backgroundColor: "#F1F3F5",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelBtnText: {
    color: "#495057",
    fontWeight: "bold",
    fontSize: 16,
  },
  emptyState: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    color: "#94A3B8",
    fontSize: 14,
    textAlign: "center",
  },
  additionalWingsSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#EEE",
  },
  additionalWingsLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#495057",
    marginBottom: 12,
  },
  checkboxContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8F9FA",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#DEE2E6",
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#007AFF",
    marginRight: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxActive: {
    backgroundColor: "#007AFF",
  },
  checkboxTick: {
    width: 8,
    height: 8,
    backgroundColor: "#fff",
    borderRadius: 2,
  },
  checkboxLabel: {
    fontSize: 13,
    color: "#495057",
    fontWeight: "500",
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
    marginBottom: 12,
  },
  dropdownButtonText: {
    fontSize: 16,
    color: "#333",
  },
  dropdownArrow: {
    fontSize: 12,
    color: "#666",
  },
  dropdownListContainer: {
    position: "absolute",
    top: 48,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DEE2E6",
    zIndex: 1000,
    maxHeight: 200,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  dropdownList: {
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
    fontSize: 15,
    color: "#333",
  },
  dropdownItemTextSelected: {
    color: "#007AFF",
    fontWeight: "600",
  },
  suggestionBanner: {
    backgroundColor: "#F0F9FF",
    borderWidth: 1,
    borderColor: "#BAE6FD",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  suggestionInfo: {
    flex: 1,
    marginRight: 10,
  },
  suggestionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0369A1",
  },
  suggestionText: {
    fontSize: 11,
    color: "#0C4A6E",
    marginTop: 2,
  },
  suggestionActions: {
    flexDirection: "row",
    gap: 8,
  },
  suggestionBtnYes: {
    backgroundColor: "#0369A1",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  suggestionBtnNo: {
    backgroundColor: "transparent",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#0369A1",
  },
  suggestionBtnTextYes: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  suggestionBtnTextNo: {
    color: "#0369A1",
    fontSize: 12,
    fontWeight: "700",
  },
  inputGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    color: "#495057",
    marginBottom: 6,
    fontWeight: "500",
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
  additionalWingItem: {
    marginBottom: 12,
    backgroundColor: "#FAFAFA",
    borderRadius: 8,
    padding: 8,
  },
  additionalWingPostContainer: {
    marginTop: 8,
    marginLeft: 26,
  },
  additionalWingPostLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
    fontWeight: "500",
  },
});
