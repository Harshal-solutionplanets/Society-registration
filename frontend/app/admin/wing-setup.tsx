import { appId, db } from "@/configs/firebaseConfig";
import { useAuth } from "@/hooks/useAuth";
import { Ionicons } from "@expo/vector-icons";
import {
    documentDirectory,
    EncodingType,
    writeAsStringAsync,
} from "expo-file-system";
import { useLocalSearchParams, useRouter } from "expo-router";
import { isAvailableAsync, shareAsync } from "expo-sharing";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    writeBatch,
} from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    Easing,
    Image,
    KeyboardAvoidingView,
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

interface FloorData {
  floorNumber: number;
  flatCount: number;
  driveFolderId?: string;
  floorName?: string;
}

const BuildingLoader = () => {
  const liftAnim = useRef(new Animated.Value(0)).current;
  const [msgIndex, setMsgIndex] = useState(0);
  const messages = [
    "Scanning structure...",
    "Syncing with Drive...",
    "Updating Firestore...",
    "Finalizing setup...",
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % messages.length);
    }, 2000);

    Animated.loop(
      Animated.sequence([
        Animated.timing(liftAnim, {
          toValue: -10,
          duration: 700,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
        Animated.timing(liftAnim, {
          toValue: 0,
          duration: 700,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
      ]),
    ).start();

    return () => clearInterval(timer);
  }, [liftAnim]);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Animated.View style={{ transform: [{ translateY: liftAnim }] }}>
        <Ionicons name="business" size={24} color="#fff" />
      </Animated.View>
      <Text
        style={{
          color: "#fff",
          fontWeight: "700",
          marginLeft: 10,
          fontSize: 14, // Slightly smaller to fit messages
          letterSpacing: 0.5,
        }}
      >
        {messages[msgIndex]}
      </Text>
    </View>
  );
};

export default function WingSetup() {
  const params = useLocalSearchParams();
  const wingIndex = params.wingIndex as string;
  const wingId = params.wingId as string;
  const initialWingName = params.wingName as string;
  const router = useRouter();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [initialName, setInitialName] = useState(initialWingName); // Track initial name for rename logic
  const [wingName, setWingName] = useState(initialWingName);
  const [floorCount, setFloorCount] = useState("");
  const [floors, setFloors] = useState<FloorData[]>([]);
  const [deletedFloors, setDeletedFloors] = useState<
    { floorNumber: number; driveFolderId?: string; fullClear?: boolean }[]
  >([]);
  const [isInitialFlatSetup, setIsInitialFlatSetup] = useState(true);
  const [existingWingData, setExistingWingData] = useState<any>(null);
  const [editStatus, setEditStatus] = useState<"Vacant" | "Occupied">(
    "Occupied",
  );
  const [generatingReport, setGeneratingReport] = useState(false);

  const handleBack = () => {
    if (!user) {
      router.replace("/admin/auth");
    } else {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/admin/dashboard");
      }
    }
  };

  const handleFloorCountChange = (val: string) => {
    const sanitized = val.replace(/[^0-9]/g, "");
    const num = parseInt(sanitized) || 0;
    if (num > 88) {
      Toast.show({
        type: "error",
        text1: "Floor Limit",
        text2: "Maximum 88 floors are allowed per wing.",
      });
      setFloorCount("88");
      return;
    }
    setFloorCount(sanitized);
  };

  // Stable ID for database paths - consistently use underscores for spaces
  const wingIdToUse = wingId || wingName.trim().replace(/\s+/g, "_");

  const [selectedFloor, setSelectedFloor] = useState<number | null>(null);
  const [flatInput, setFlatInput] = useState("");
  const [floorNumberInput, setFloorNumberInput] = useState("");
  const [floorNameInput, setFloorNameInput] = useState("");
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    if (user) {
      fetchWingData();
    }
  }, [user]);

  // Helper to delete a folder/file from Drive
  const deleteDriveFolder = async (folderId: string, token: string) => {
    try {
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${folderId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      if (!response.ok && response.status !== 404) {
        const error = await response.json();
        console.warn("Drive folder deletion failed:", error);
        return false;
      }
      return true;
    } catch (error) {
      console.warn("Error deleting Drive folder:", error);
      return false;
    }
  };

  const fetchWingData = async () => {
    if (!user) return;
    try {
      const wingPath = `artifacts/${appId}/public/data/societies/${user?.uid}/wings/${wingId}`;
      const wingDoc = await getDoc(doc(db, wingPath));

      if (wingDoc.exists()) {
        const data = wingDoc.data();
        setExistingWingData(data);
        setWingName(data.name);
        setInitialName(data.name); // Sync initial name with DB
        setFloorCount(data.floorCount?.toString() || "0");
        setFloors(data.floors || []);
        if (
          data.floors &&
          data.floors.length > 0 &&
          data.floors.some((f: FloorData) => f.flatCount > 0)
        ) {
          setIsInitialFlatSetup(false);
        }
      }
    } catch (error: any) {
      console.error(error);
      Toast.show({
        type: "error",
        text1: "Fetch Failed",
        text2:
          "Could not load wing data. Check your connection or login again.",
      });
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
    } catch (error: any) {
      console.error("DEBUG: Token refresh failed:", error);
      Toast.show({
        type: "error",
        text1: "Drive Access Error",
        text2: "Drive token refresh failed, please login again.",
      });
      return null;
    }
  };

  const handleGenerateStructure = () => {
    if (floors.length > 0) {
      Alert.alert(
        "Structure Exists",
        'A structure already exists. Use "Add Floor" to expand or delete individual floors to modify.',
        [{ text: "OK" }],
      );
      return;
    }

    const numFloors = parseInt(floorCount) || 0;

    if (numFloors <= 0) {
      Alert.alert("Error", "Please enter a valid number of floors");
      return;
    }

    const newFloors: FloorData[] = [];
    for (let i = numFloors; i >= 0; i--) {
      newFloors.push({
        floorNumber: i,
        flatCount: 0,
        floorName: i === 0 ? "Ground Floor" : `Floor ${i}`,
      });
    }
    setFloors(newFloors);
    setIsInitialFlatSetup(true);

    Toast.show({
      type: "success",
      text1: "Structure Generated",
      text2: `${numFloors} floors + Ground floor created. Click any floor to set flats.`,
    });
  };

  const handleAddFloor = () => {
    const maxFloor =
      floors.length > 0 ? Math.max(...floors.map((f) => f.floorNumber)) : -1;
    const newFloorNumber = maxFloor + 1;
    const newFloorName = `Floor ${newFloorNumber}`;

    setFloors((prev) => {
      const updated = [
        { floorNumber: newFloorNumber, flatCount: 0, floorName: newFloorName },
        ...prev,
      ];
      setFloorCount(updated.length.toString());
      return updated;
    });

    Toast.show({
      type: "success",
      text1: "Floor Added",
      text2: `${newFloorName} added to the structure.`,
    });
  };

  const handleDeleteFloor = (floorNumber: number) => {
    console.log("Attempting to delete floor:", floorNumber);

    const performDelete = () => {
      const floorToDelete = floors.find((f) => f.floorNumber === floorNumber);
      if (!floorToDelete) return;

      setFloors((prev) => {
        const updated = prev.filter((f) => f.floorNumber !== floorNumber);
        // Update floor count based on the actual remaining floors
        setFloorCount(updated.length.toString());
        return updated;
      });

      setDeletedFloors((prev) => [
        ...prev,
        {
          floorNumber: floorToDelete.floorNumber,
          driveFolderId: floorToDelete.driveFolderId,
          fullClear: true,
        },
      ]);

      Toast.show({
        type: "info",
        text1: "Floor Removed",
        text2: `Floor ${floorNumber} removed from local structure. Save to apply changes.`,
      });
    };

    if (Platform.OS === "web") {
      if (
        window.confirm(
          `Are you sure you want to delete Floor ${floorNumber}? This will remove all units on this floor from the structure.`,
        )
      ) {
        performDelete();
      }
    } else {
      Alert.alert(
        "Delete Floor",
        `Are you sure you want to delete Floor ${floorNumber}? This will remove all units on this floor from the structure.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: performDelete,
          },
        ],
      );
    }
  };

  const handleFloorNumberInputChange = (val: string) => {
    const sanitized = val.replace(/[^0-9]/g, "");
    setFloorNumberInput(sanitized);

    if (sanitized !== "") {
      const num = parseInt(sanitized);
      const baseName = num === 0 ? "Ground Floor" : `Floor ${num}`;

      // Check if this name already exists in OTHER floors
      let finalName = baseName;
      let counter = 2;
      while (
        floors.some(
          (f) =>
            f.floorNumber !== selectedFloor &&
            (f.floorName === finalName ||
              (!f.floorName &&
                (f.floorNumber === 0
                  ? "Ground Floor"
                  : `Floor ${f.floorNumber}`) === finalName)),
        )
      ) {
        finalName = `${baseName} (${counter})`;
        counter++;
      }
      setFloorNameInput(finalName);
    }
  };

  const openFloorModal = (floorNumber: number) => {
    const floor = floors.find((f) => f.floorNumber === floorNumber);
    setSelectedFloor(floorNumber);
    setFloorNumberInput(floorNumber.toString());
    setFlatInput(floor?.flatCount.toString() || "0");
    setFloorNameInput(
      floor?.floorName ||
        (floorNumber === 0 ? "Ground Floor" : `Floor ${floorNumber}`),
    );
    setModalVisible(true);
  };

  const handleSaveFlats = () => {
    if (selectedFloor === null) return;
    const numFlats = parseInt(flatInput) || 0;
    // Cap flat count to 40
    if (numFlats > 40) {
      Toast.show({
        type: "error",
        text1: "Flat Limit",
        text2: "Maximum 40 flats are allowed per floor.",
      });
      return;
    }
    const allFloorsEmpty = floors.every((f) => f.flatCount === 0);
    const trimmedName = floorNameInput.trim();

    const newFloorNumber = parseInt(floorNumberInput);
    if (isNaN(newFloorNumber)) {
      Toast.show({
        type: "error",
        text1: "Invalid Number",
        text2: "Please enter a valid floor number.",
      });
      return;
    }

    // Validate unique floor number
    const isNumDuplicate = floors.some(
      (f) =>
        f.floorNumber !== selectedFloor && f.floorNumber === newFloorNumber,
    );
    if (isNumDuplicate) {
      Toast.show({
        type: "error",
        text1: "Duplicate Floor Number",
        text2: `Floor number ${newFloorNumber} already exists in this wing.`,
      });
      return;
    }

    // Handle floor number change for existing floors - queue old one for Firestore migration cleanup
    if (newFloorNumber !== selectedFloor) {
      const oldFound = floors.find((f) => f.floorNumber === selectedFloor);
      if (oldFound) {
        // We set fullClear to false because we are moving data, not deleting it permanently
        setDeletedFloors((prev) => [
          ...prev,
          { floorNumber: selectedFloor as number, fullClear: false },
        ]);
      }
    }

    // Validate unique floor name
    const isDuplicate = floors.some(
      (f) =>
        f.floorNumber !== selectedFloor &&
        (f.floorName ||
          (f.floorNumber === 0 ? "Ground Floor" : `Floor ${f.floorNumber}`)) ===
          trimmedName,
    );

    if (isDuplicate) {
      Toast.show({
        type: "error",
        text1: "Duplicate Name",
        text2:
          "Another floor already has this name. Please choose a unique name.",
      });
      return;
    }

    // Check if flat count is locked for this floor (already saved with data)
    const existingFloor = existingWingData?.floors?.find(
      (f: any) => f.floorNumber === selectedFloor,
    );
    const isFlatCountLocked = existingFloor && existingFloor.flatCount > 0;

    if (isFlatCountLocked && numFlats !== existingFloor.flatCount) {
      Toast.show({
        type: "error",
        text1: "Flat Count Locked",
        text2:
          "Cannot change flat count after structure is saved. Only floor name can be edited.",
      });
      return;
    }

    if (isInitialFlatSetup && allFloorsEmpty) {
      setFloors((prev) =>
        prev.map((f) => ({
          ...f,
          flatCount: numFlats,
          floorName:
            f.floorNumber === selectedFloor
              ? trimmedName || f.floorName
              : f.floorName,
        })),
      );
      setIsInitialFlatSetup(false);
      Toast.show({
        type: "success",
        text1: "Flats Set",
        text2: `All floors set to ${numFlats} flats (symmetrical structure)`,
      });
    } else {
      setFloors((prev) =>
        prev.map((f) =>
          f.floorNumber === selectedFloor
            ? {
                ...f,
                floorNumber: newFloorNumber,
                flatCount: isFlatCountLocked
                  ? existingFloor.flatCount
                  : numFlats,
                floorName: trimmedName,
              }
            : f,
        ),
      );
      Toast.show({
        type: "success",
        text1: "Floor Updated",
        text2: `${trimmedName || `Floor ${newFloorNumber}`} ${isFlatCountLocked ? "name updated" : `set to ${numFlats} flats`}`,
      });
    }
    setModalVisible(false);
    setSelectedFloor(null);
  };

  const moveFloor = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === floors.length - 1) return;

    const newFloors = [...floors];
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    // Swap elements
    [newFloors[index], newFloors[targetIndex]] = [
      newFloors[targetIndex],
      newFloors[index],
    ];

    setFloors(newFloors);
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

  const createDriveFolder = async (
    name: string,
    parentId: string,
    token: string,
  ) => {
    try {
      const response = await fetch(
        "https://www.googleapis.com/drive/v3/files",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: name,
            mimeType: "application/vnd.google-apps.folder",
            parents: [parentId],
          }),
        },
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error?.message || `Failed to create folder ${name}`,
        );
      }
      const data = await response.json();
      const folderId = data.id;

      // Set permission to "Anyone with the link"
      await setFolderPublic(folderId, token);

      return folderId;
    } catch (error) {
      console.error(`Error creating folder ${name}:`, error);
      throw error;
    }
  };

  // Rename an existing Drive folder
  const renameDriveFolder = async (
    folderId: string,
    newName: string,
    token: string,
  ) => {
    try {
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
        const error = await response.json();
        console.warn("Drive folder rename failed:", error);
        return false;
      }
      console.log(`DEBUG: Renamed Drive folder ${folderId} to ${newName}`);
      return true;
    } catch (error) {
      console.warn("Error renaming Drive folder:", error);
      return false;
    }
  };

  const handleSaveWing = async () => {
    if (!user) return;
    if (!wingName) {
      Alert.alert("Error", "Please enter a wing name");
      return;
    }
    if (floors.length === 0) {
      Alert.alert("Error", "Please generate the building structure first");
      return;
    }

    setSaving(true);
    try {
      const societyDoc = await getDoc(
        doc(db, `artifacts/${appId}/public/data/societies`, user?.uid),
      );
      const societyData = societyDoc.data();
      const rootFolderId = societyData?.driveFolderId;
      let token =
        societyData?.driveAccessToken ||
        (typeof window !== "undefined"
          ? sessionStorage.getItem("driveToken")
          : null);

      // If we have a folder but no token, try to refresh immediately
      if (rootFolderId && !token) {
        console.log(
          "DEBUG: Token missing from DB, attempting proactive refresh...",
        );
        token = await refreshAccessToken();
      }

      if (!rootFolderId || !token) {
        throw new Error(
          "Google Drive not linked or session expired. Please log in again.",
        );
      }

      // Test & Refresh Token if it's expired (already has 401 check)
      try {
        const testRes = await fetch(
          "https://www.googleapis.com/drive/v3/about?fields=user",
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (testRes.status === 401) {
          console.log("DEBUG: Token expired, refreshing...");
          const newToken = await refreshAccessToken();
          if (newToken) {
            token = newToken;
          } else {
            throw new Error("Could not refresh Drive access. Please re-login.");
          }
        }
      } catch (err: any) {
        if (err.message.includes("re-login")) throw err;
        console.warn("Token validation failed, attempting refresh anyway...");
        const newToken = await refreshAccessToken();
        if (newToken) token = newToken;
      }

      let wingFolderId = existingWingData?.driveFolderId;
      if (!wingFolderId) {
        wingFolderId = await createDriveFolder(
          wingName,
          rootFolderId as string,
          token as string,
        );
      } else if (initialName !== wingName) {
        // Rename Wing Folder if name changed
        await renameDriveFolder(wingFolderId, wingName, token as string);
        setInitialName(wingName);
      }

      const batch = writeBatch(db);

      // AUTO-DELETE LOGIC: Filter floors with 0 flats and queue them for deletion
      const activeFloors = floors.filter((f) => f.flatCount > 0);
      const autoDeleted = floors
        .filter((f) => f.flatCount === 0)
        .map((f) => ({
          floorNumber: f.floorNumber,
          driveFolderId: f.driveFolderId,
        }));

      const finalDeletedQueue = [...deletedFloors, ...autoDeleted];
      const updatedFloors = [...activeFloors];

      // Handle Cleanup (Firestore + Drive)
      for (const item of deletedFloors) {
        // 1. Clear old Firestore location
        const oldFloorPath = `artifacts/${appId}/public/data/societies/${user?.uid}/wings/${wingIdToUse}/${item.floorNumber}`;
        const oldUnitsSnap = await getDocs(collection(db, oldFloorPath));

        for (const unitDoc of oldUnitsSnap.docs) {
          const unitData = unitDoc.data();

          // ONLY delete Drive subfolders if this is a PERMANENT deletion (fullClear: true)
          if (item.fullClear && unitData.driveFolderId && token) {
            console.log(
              `Cleaning up Drive: Deleting unit folder ${unitData.driveFolderId}`,
            );
            await deleteDriveFolder(unitData.driveFolderId, token);
          }

          batch.delete(unitDoc.ref);
          // Only clear resident profile if it's a permanent deletion
          if (item.fullClear) {
            batch.delete(
              doc(
                db,
                `artifacts/${appId}/public/data/societies/${user?.uid}/Residents/${unitDoc.id}`,
              ),
            );
          }
        }

        // 2. Delete Floor Folder from Google Drive ONLY if permanent
        if (item.fullClear && item.driveFolderId && token) {
          console.log(
            `Cleaning up Drive: Deleting floor folder ${item.driveFolderId}`,
          );
          await deleteDriveFolder(item.driveFolderId, token);
        }
      }

      const isRenaming = wingId && initialName !== wingName;
      // Standardize wingIdToUse - use underscores consistently
      const wingPrefix = (wingIdToUse as string)
        .replace(/\s+/g, "_")
        .toUpperCase();
      let unitsGenerated = 0;

      // PRE-MIGRATION DATA COLLECTION
      // Collect all existing unit data from Floors being renumbered to avoid deletion loss
      const migrationCache: Record<string, any> = {};
      for (const floor of updatedFloors) {
        const renumberedFrom = existingWingData?.floors?.find(
          (f: any) => f.driveFolderId === floor.driveFolderId,
        );
        if (
          renumberedFrom &&
          renumberedFrom.floorNumber !== floor.floorNumber
        ) {
          console.log(
            `Pre-collecting data from floor ${renumberedFrom.floorNumber} for migration...`,
          );
          const oldLocPath = `artifacts/${appId}/public/data/societies/${user?.uid}/wings/${wingIdToUse}/${renumberedFrom.floorNumber}`;
          const oldUnitsSnap = await getDocs(collection(db, oldLocPath));

          for (const unitDoc of oldUnitsSnap.docs) {
            const wingUnitData = unitDoc.data();
            const oldUnitId = unitDoc.id;

            // FETCH FULL PROFILE from Residents collection to ensure NO data lost
            const fullResidentDoc = await getDoc(
              doc(
                db,
                `artifacts/${appId}/public/data/societies/${user?.uid}/Residents/${oldUnitId}`,
              ),
            );
            const fullData = fullResidentDoc.exists()
              ? fullResidentDoc.data()
              : wingUnitData;

            const unitIdx = oldUnitId.split("-").pop();
            const baseNum = parseInt(unitIdx || "0") % 100;
            const newUnitNum = floor.floorNumber * 100 + baseNum;
            const newId = `${wingPrefix}-${floor.floorNumber}-${newUnitNum}`;

            migrationCache[newId] = {
              ...fullData,
              id: newId,
              oldId: oldUnitId,
            };
          }
        }
      }

      for (let i = 0; i < updatedFloors.length; i++) {
        const floor = updatedFloors[i];
        const currentFloorName =
          floor.floorName ||
          (floor.floorNumber === 0
            ? "Ground Floor"
            : `Floor ${floor.floorNumber}`);

        let floorFolderId = floor.driveFolderId;
        if (!floorFolderId) {
          floorFolderId = await createDriveFolder(
            currentFloorName,
            wingFolderId as string,
            token as string,
          );
          updatedFloors[i] = { ...floor, driveFolderId: floorFolderId };
        } else {
          const oldFloor = existingWingData?.floors?.find(
            (f: any) => f.driveFolderId === floor.driveFolderId,
          );
          if (oldFloor && oldFloor.floorName !== currentFloorName) {
            await renameDriveFolder(
              floorFolderId,
              currentFloorName,
              token as string,
            );
          }
        }

        // Fetch current location units to merge with migration data
        const newFloorPath = `artifacts/${appId}/public/data/societies/${user?.uid}/wings/${wingIdToUse}/${floor.floorNumber}`;
        const currentUnitsSnap = await getDocs(collection(db, newFloorPath));
        const floorDataCache: Record<string, any> = {};
        currentUnitsSnap.forEach((d) => (floorDataCache[d.id] = d.data()));

        for (let unitIndex = 1; unitIndex <= floor.flatCount; unitIndex++) {
          const unitNumber = floor.floorNumber * 100 + unitIndex;
          const unitName = `${unitNumber}`;
          const unitId = `${wingPrefix}-${floor.floorNumber}-${unitNumber}`;

          const existingData = migrationCache[unitId] || floorDataCache[unitId];
          const societyUnitPath = `artifacts/${appId}/public/data/societies/${user?.uid}/wings/${wingIdToUse}/${floor.floorNumber}/${unitId}`;
          const residentPath = `artifacts/${appId}/public/data/societies/${user?.uid}/Residents/${unitId}`;

          if (!existingData || !existingData.username) {
            // Logic for a truly new unit
            let flatFolderId = "";
            if (floorFolderId) {
              try {
                flatFolderId = await createDriveFolder(
                  unitName,
                  floorFolderId as string,
                  token as string,
                );
              } catch (err) {
                flatFolderId = "";
              }
            }

            const societyPrefix = (societyData?.societyName || "SOC")
              .substring(0, 3)
              .toUpperCase();
            const wingPrefixForUsername = wingIdToUse
              .replace(/\s+/g, "")
              .toUpperCase();
            const residentUsername =
              `${societyPrefix}-${wingPrefixForUsername}-${unitNumber}`.toUpperCase();
            const residentPassword = generatePassword(6);

            const unitPayload = {
              id: unitId,
              societyName: societyData?.societyName || "",
              wingName: wingName,
              floorName: currentFloorName,
              unitName: unitName,
              username: residentUsername,
              password: residentPassword,
              displayName: `${wingName} - ${unitName}`,
              residenceType: "Residence",
              residenceStatus: "Occupied",
              status: "Occupied",
              ownership: "SELF_OWNED",
              wingId: wingIdToUse,
              floorNumber: floor.floorNumber,
              unitNumber: unitNumber,
              driveFolderId: flatFolderId,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };

            batch.set(doc(db, societyUnitPath), unitPayload, { merge: true });
            batch.set(doc(db, residentPath), unitPayload, { merge: true });
            unitsGenerated++;
          } else {
            // Sync existing/migrated unit
            const updatedPayload = {
              ...existingData,
              id: unitId,
              wingName: wingName,
              floorName: currentFloorName,
              displayName: `${wingName} - ${existingData.unitName || unitName}`,
              floorNumber: floor.floorNumber,
              unitNumber: unitNumber,
              updatedAt: new Date().toISOString(),
            };

            // If it was migrated, we need to handle staff migration too
            if (existingData.oldId) {
              const oldStaffRef = collection(
                db,
                `artifacts/${appId}/public/data/societies/${user?.uid}/Residents/${existingData.oldId}/StaffMembers`,
              );
              const staffSnap = await getDocs(oldStaffRef);
              staffSnap.forEach((sDoc) => {
                const newStaffPath = `artifacts/${appId}/public/data/societies/${user?.uid}/Residents/${unitId}/StaffMembers/${sDoc.id}`;
                batch.set(doc(db, newStaffPath), sDoc.data());
              });
              // Queue old resident doc for deletion AFTER migration
              batch.delete(
                doc(
                  db,
                  `artifacts/${appId}/public/data/societies/${user?.uid}/Residents/${existingData.oldId}`,
                ),
              );
            }

            batch.set(doc(db, societyUnitPath), updatedPayload, {
              merge: true,
            });
            batch.set(doc(db, residentPath), updatedPayload, { merge: true });
          }
        }
      }

      // FINAL CLEANUP STEP: Delete old records that were either migrated or removed
      for (const item of deletedFloors) {
        const oldFloorPath = `artifacts/${appId}/public/data/societies/${user?.uid}/wings/${wingIdToUse}/${item.floorNumber}`;
        const oldUnitsSnap = await getDocs(collection(db, oldFloorPath));
        for (const unitDoc of oldUnitsSnap.docs) {
          const unitData = unitDoc.data();
          if (item.fullClear && unitData.driveFolderId && token) {
            await deleteDriveFolder(unitData.driveFolderId, token);
          }
          batch.delete(unitDoc.ref); // Delete old structural wing unit
          if (item.fullClear) {
            batch.delete(
              doc(
                db,
                `artifacts/${appId}/public/data/societies/${user?.uid}/Residents/${unitDoc.id}`,
              ),
            );
          }
        }
        if (item.fullClear && item.driveFolderId && token) {
          await deleteDriveFolder(item.driveFolderId, token);
        }
      }

      // Use the ORIGINAL wingId for the path - don't create new collection
      const wingPath = `artifacts/${appId}/public/data/societies/${user?.uid}/wings/${wingIdToUse}`;
      const totalFlatsInWing = updatedFloors.reduce(
        (sum, f) => sum + f.flatCount,
        0,
      );
      const wingRef = doc(db, wingPath);
      batch.set(
        wingRef,
        {
          name: wingName, // Updated display name
          wingId: wingIdToUse, // Keep original ID
          wingIndex: parseInt(wingIndex as string),
          driveFolderId: wingFolderId,
          floorCount: updatedFloors.length,
          totalFlats: totalFlatsInWing,
          floors: updatedFloors,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );

      // Rename Drive folder if wing name changed
      if (isRenaming && wingFolderId && token) {
        await renameDriveFolder(wingFolderId, wingName, token);
      }

      await batch.commit();
      Toast.show({
        type: "success",
        text1: "Wing structure Saved",
        text2: `${wingName}: ${unitsGenerated} units synchronized successfully.`,
      });
      // Removed router.back() to keep user on same page as requested
    } catch (error: any) {
      console.error("Error saving wing:", error);
      Alert.alert(
        "Save Failed",
        error.message || "Could not save wing structure.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadReport = async () => {
    if (!user || !wingIdToUse) return;
    setGeneratingReport(true);
    try {
      const isWeb = Platform.OS === "web";
      const backendUrl = isWeb
        ? window.location.origin + "/api"
        : process.env.EXPO_PUBLIC_BACKEND_URL ||
          "https://asia-south1-zonect-8d847.cloudfunctions.net/api";

      const res = await fetch(`${backendUrl}/drive/generate-wing-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminUID: user.uid,
          wingId: wingIdToUse,
          appId,
          wingName: wingName,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Report generation failed");
      }

      const { data, fileName } = await res.json();

      if (isWeb) {
        const link = document.createElement("a");
        link.href = `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${data}`;
        link.download = fileName;
        link.click();
      } else {
        const fileUri = `${documentDirectory}${fileName}`;
        await writeAsStringAsync(fileUri, data, {
          encoding: EncodingType.Base64,
        });

        if (await isAvailableAsync()) {
          await shareAsync(fileUri, {
            mimeType:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            dialogTitle: "Download Wing Report",
            UTI: "com.microsoft.word.doc",
          });
        } else {
          Alert.alert("Error", "Sharing is not available on this device");
        }
      }

      Toast.show({
        type: "success",
        text1: "Report Ready",
        text2: "Wing report has been downloaded.",
      });
    } catch (error: any) {
      console.error("Report Error:", error);
      Toast.show({
        type: "error",
        text1: "Report Error",
        text2: error.message || "Could not generate report.",
      });
    } finally {
      setGeneratingReport(false);
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

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0E5D56" />
      </View>
    );
  }

  const sanitizedWingId = wingName.replace(/\s+/g, "");

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
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Back</Text>
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

        <View style={styles.setupSection}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Wing Name</Text>
            <TextInput
              style={styles.input}
              value={wingName}
              onChangeText={setWingName}
              placeholder="e.g. Wing A"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Total Floors</Text>
            <View style={styles.row}>
              <TextInput
                style={[
                  styles.input,
                  { flex: 1, marginBottom: 0 },
                  floors.length > 0 && styles.disabledInput,
                ]}
                value={floorCount}
                onChangeText={handleFloorCountChange}
                placeholder="e.g. 12"
                keyboardType="numeric"
                editable={floors.length === 0}
              />
              {floors.length === 0 ? (
                <TouchableOpacity
                  style={styles.generateBtn}
                  onPress={handleGenerateStructure}
                >
                  <Text style={styles.generateBtnText}>Generate</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.generateBtn, { backgroundColor: "#0E5D56" }]}
                  onPress={handleAddFloor}
                >
                  <Text style={styles.generateBtnText}>Add Floor</Text>
                </TouchableOpacity>
              )}
            </View>
            {floors.length > 0 && (
              <Text style={styles.helpText}>
                Floor count is locked. Use Add Floor or delete buttons below.
              </Text>
            )}
          </View>
        </View>

        {floors.length > 0 && (
          <View style={styles.buildingSection}>
            <Text style={styles.sectionTitle}>Building Structure</Text>
            <Text style={styles.sectionSubtitle}>
              Click a floor to set number of flats
            </Text>

            <View style={styles.buildingContainer}>
              <View style={styles.roof} />
              {floors.map((floor, index) => (
                <View
                  key={floor.floorNumber}
                  style={[
                    styles.floorBlock,
                    floor.flatCount > 0 && styles.floorBlockConfigured,
                  ]}
                >
                  <View style={styles.moveActions}>
                    <TouchableOpacity
                      onPress={() => moveFloor(index, "up")}
                      disabled={index === 0}
                      style={[
                        styles.moveBtn,
                        index === 0 && styles.disabledMoveBtn,
                      ]}
                    >
                      <Ionicons
                        name="chevron-up"
                        size={20}
                        color={index === 0 ? "#CCC" : "#666"}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => moveFloor(index, "down")}
                      disabled={index === floors.length - 1}
                      style={[
                        styles.moveBtn,
                        index === floors.length - 1 && styles.disabledMoveBtn,
                      ]}
                    >
                      <Ionicons
                        name="chevron-down"
                        size={20}
                        color={index === floors.length - 1 ? "#CCC" : "#666"}
                      />
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={styles.floorMainArea}
                    onPress={() => openFloorModal(floor.floorNumber)}
                  >
                    <Text style={styles.floorNumberText}>
                      {floor.floorName ||
                        (floor.floorNumber === 0
                          ? "Ground Floor"
                          : `Floor ${floor.floorNumber}`)}
                    </Text>
                    <View style={styles.flatTag}>
                      <Text style={styles.flatTagText}>
                        {floor.flatCount} Flats
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <View style={styles.floorActions}>
                    {floor.flatCount > 0 && (
                      <TouchableOpacity
                        style={styles.viewDetailsBtn}
                        onPress={() =>
                          router.push({
                            pathname: "/admin/floor",
                            params: {
                              wingId: wingIdToUse,
                              wingName: wingName,
                              floorNumber: floor.floorNumber.toString(),
                              flatCount: floor.flatCount.toString(),
                              floorName:
                                floor.floorName ||
                                (floor.floorNumber === 0
                                  ? "Ground Floor"
                                  : `Floor ${floor.floorNumber}`),
                            },
                          })
                        }
                      >
                        <Text style={styles.viewDetailsBtnText}>→</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.deleteFloorBtn}
                      onPress={() => handleDeleteFloor(floor.floorNumber)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={20}
                        color="#C2413B"
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              <View style={styles.ground} />
            </View>
          </View>
        )}

        {floors.length > 0 && (
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.disabledBtn]}
            onPress={handleSaveWing}
            disabled={saving}
          >
            {saving ? (
              <BuildingLoader />
            ) : (
              <Text style={styles.saveBtnText}>Save Wing Structure</Text>
            )}
          </TouchableOpacity>
        )}

        {existingWingData && floors.length > 0 && (
          <TouchableOpacity
            style={[styles.reportBtn, generatingReport && styles.disabledBtn]}
            onPress={handleDownloadReport}
            disabled={generatingReport}
          >
            {generatingReport ? (
              <ActivityIndicator color="#0E5D56" size="small" />
            ) : (
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Ionicons
                  name="document-text-outline"
                  size={20}
                  color="#0E5D56"
                />
                <Text style={styles.reportBtnText}>Download Wing Report</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>

      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {floorNumberInput === "0"
                ? "Ground Floor"
                : `Floor ${floorNumberInput || "?"}`}
            </Text>

            <Text style={styles.label}>Floor Number</Text>
            <TextInput
              style={[styles.modalInput, { marginBottom: 16 }]}
              value={floorNumberInput}
              onChangeText={handleFloorNumberInputChange}
              keyboardType="numeric"
              placeholder="e.g. 5"
            />

            <Text style={styles.label}>Floor Name (Optional)</Text>
            <TextInput
              style={[styles.modalInput, { marginBottom: 16 }]}
              value={floorNameInput}
              onChangeText={setFloorNameInput}
              placeholder="e.g. Gym Floor"
            />

            <Text style={styles.modalSubtitle}>
              How many flats on this floor?
            </Text>
            {(() => {
              const existingFloor = existingWingData?.floors?.find(
                (f: any) => f.floorNumber === selectedFloor,
              );
              const isLocked = existingFloor && existingFloor.flatCount > 0;
              return (
                <>
                  <TextInput
                    style={[
                      styles.modalInput,
                      isLocked && styles.disabledInput,
                    ]}
                    value={flatInput}
                    onChangeText={(val) => {
                      if (!isLocked) {
                        const num = parseInt(val) || 0;
                        if (num > 40) {
                          Toast.show({
                            type: "error",
                            text1: "Flat Limit",
                            text2: "Maximum 40 flats are allowed per floor.",
                          });
                          setModalVisible(false);
                          setFlatInput("");
                          return;
                        }
                        setFlatInput(val);
                      }
                    }}
                    keyboardType="numeric"
                    selectTextOnFocus={!isLocked}
                    autoFocus={!isLocked}
                    editable={!isLocked}
                  />
                  {isLocked && (
                    <Text
                      style={{
                        color: "#8D8271",
                        fontSize: 11,
                        marginTop: 4,
                        fontStyle: "italic",
                      }}
                    >
                      Flat count is locked after saving. Only floor name can be
                      changed.
                    </Text>
                  )}
                </>
              );
            })()}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.confirmBtn]}
                onPress={handleSaveFlats}
              >
                <Text style={styles.confirmBtnText}>Set Flats</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F3EB",
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
    borderBottomColor: "#E0E0E0",
  },
  backBtn: {
    marginBottom: 10,
  },
  backBtnText: {
    color: "#0E5D56",
    fontSize: 16,
    fontWeight: "600",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1F2937",
  },
  setupSection: {
    padding: 20,
    backgroundColor: "#fff",
    marginBottom: 10,
  },
  inputGroup: {
    marginBottom: 15,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#F7F3EB",
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#E3D8C6",
  },
  disabledInput: {
    backgroundColor: "#E3D8C6",
    color: "#6F675B",
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  generateBtn: {
    backgroundColor: "#1E7A57",
    paddingHorizontal: 20,
    justifyContent: "center",
    borderRadius: 8,
  },
  generateBtnText: {
    color: "#fff",
    fontWeight: "bold",
  },
  helpText: {
    fontSize: 12,
    color: "#666",
    marginTop: 6,
    fontStyle: "italic",
  },
  buildingSection: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    textAlign: "center",
  },
  sectionSubtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 20,
  },
  buildingContainer: {
    alignItems: "center",
    paddingVertical: 10,
  },
  roof: {
    width: "60%",
    height: 0,
    borderLeftWidth: 40,
    borderLeftColor: "transparent",
    borderRightWidth: 40,
    borderRightColor: "transparent",
    borderBottomWidth: 30,
    borderBottomColor: "#5A5349",
    marginBottom: -2,
  },
  floorBlock: {
    width: "80%",
    backgroundColor: "#fff",
    padding: 15,
    borderWidth: 2,
    borderColor: "#E3D8C6",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: -2,
  },
  floorBlockConfigured: {
    borderColor: "#0E5D56",
    backgroundColor: "#EEF7F4",
    zIndex: 1,
  },
  floorMainArea: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginHorizontal: 10,
  },
  moveActions: {
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
    marginRight: 5,
  },
  moveBtn: {
    padding: 2,
    backgroundColor: "#F7F3EB",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#E3D8C6",
  },
  disabledMoveBtn: {
    backgroundColor: "#EFE8DB",
    borderColor: "#E3D8C6",
  },
  floorNumberText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#5A5349",
  },
  flatTag: {
    backgroundColor: "#E3D8C6",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  flatTagText: {
    fontSize: 12,
    color: "#666",
    fontWeight: "600",
  },
  viewDetailsBtn: {
    backgroundColor: "#0E5D56",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 10,
  },
  viewDetailsBtnText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  floorActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  deleteFloorBtn: {
    padding: 8,
    backgroundColor: "#FFF3F2",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FEE2E2",
  },
  ground: {
    width: "90%",
    height: 10,
    backgroundColor: "#343A40",
    borderRadius: 5,
    marginTop: 5,
  },
  saveBtn: {
    backgroundColor: "#0E5D56",
    margin: 20,
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#0E5D56",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  disabledBtn: {
    opacity: 0.7,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
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
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 5,
  },
  modalSubtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 20,
  },
  modalInput: {
    width: "100%",
    backgroundColor: "#EFE8DB",
    padding: 15,
    borderRadius: 12,
    fontSize: 24,
    textAlign: "center",
    fontWeight: "bold",
    marginBottom: 25,
    borderWidth: 1,
    borderColor: "#E3D8C6",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 15,
  },
  modalBtn: {
    flex: 1,
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelBtn: {
    backgroundColor: "#EFE8DB",
  },
  confirmBtn: {
    backgroundColor: "#0E5D56",
  },
  cancelBtnText: {
    color: "#5A5349",
    fontWeight: "bold",
  },
  confirmBtnText: {
    color: "#fff",
    fontWeight: "bold",
  },
  reportBtn: {
    backgroundColor: "#fff",
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#0E5D56",
    flexDirection: "row",
    justifyContent: "center",
  },
  reportBtnText: {
    color: "#0E5D56",
    fontSize: 16,
    fontWeight: "700",
  },
});
