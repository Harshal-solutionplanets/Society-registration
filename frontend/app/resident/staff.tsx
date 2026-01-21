import { db } from "@/configs/firebaseConfig";
import { COLLECTIONS } from "@/constants/Config";
import { useAuth } from "@/hooks/useAuth";
import { uploadFileToGoogleDrive } from "@/utils/driveUtils";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
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

export default function ResidentStaff() {
  const { user } = useAuth();
  const router = useRouter();
  const [staffName, setStaffName] = useState("");
  const [staffType, setStaffType] = useState("Maid");
  const [contact, setContact] = useState("");

  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [idCard, setIdCard] = useState<ImagePicker.ImagePickerAsset | null>(
    null,
  );

  const [isUploading, setIsUploading] = useState(false);
  const [staffList, setStaffList] = useState<any[]>([]);

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

  const pickImage = async (setImage: any) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.5,
    });

    if (!result.canceled) {
      setImage(result.assets[0]);
    }
  };

  const handleSubmit = async () => {
    if (!staffName || !contact || !photo || !idCard) {
      Alert.alert(
        "Error",
        "Please fill all fields and upload both Photo and ID Card.",
      );
      return;
    }

    if (!user) return;

    setIsUploading(true);
    try {
      // Mock Uploads
      const photoUploadResult = await uploadFileToGoogleDrive(
        { name: "photo.jpg", uri: photo.uri },
        { type: "photo", parentFolderId: "MOCK_FOLDER_ID" },
      );

      const idCardUploadResult = await uploadFileToGoogleDrive(
        { name: "id_card.jpg", uri: idCard.uri },
        { type: "id_card", parentFolderId: "MOCK_FOLDER_ID" },
      );

      // Save Metadata
      await addDoc(collection(db, `users/${user.uid}/${COLLECTIONS.STAFF}`), {
        staffName,
        staffType,
        contact,
        photoFileId: photoUploadResult.fileId,
        idCardFileId: idCardUploadResult.fileId,
        uploadedBy: user.uid,
        uploadedAt: new Date().toISOString(),
      });

      Alert.alert("Success", "Staff registered successfully!");
      setStaffName("");
      setContact("");
      setPhoto(null);
      setIdCard(null);
    } catch (error: any) {
      Alert.alert("Error", error.message);
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
        <Text style={styles.title}>Manage Staff</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.form}>
          <Text style={styles.sectionTitle}>Add New Staff</Text>

          <TextInput
            style={styles.input}
            placeholder="Staff Name"
            value={staffName}
            onChangeText={setStaffName}
          />

          <View style={styles.row}>
            {["Maid", "Driver", "Cook", "Other"].map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.typeChip,
                  staffType === type && styles.activeChip,
                ]}
                onPress={() => setStaffType(type)}
              >
                <Text
                  style={[
                    styles.chipText,
                    staffType === type && styles.activeChipText,
                  ]}
                >
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={styles.input}
            placeholder="Contact Number"
            value={contact}
            onChangeText={setContact}
            keyboardType="phone-pad"
          />

          <View style={styles.uploadRow}>
            <TouchableOpacity
              style={styles.uploadBtn}
              onPress={() => pickImage(setPhoto)}
            >
              <Text style={styles.uploadText}>
                {photo ? "Change Photo" : "Upload Photo"}
              </Text>
            </TouchableOpacity>
            {photo && (
              <Image source={{ uri: photo.uri }} style={styles.preview} />
            )}
          </View>

          <View style={styles.uploadRow}>
            <TouchableOpacity
              style={styles.uploadBtn}
              onPress={() => pickImage(setIdCard)}
            >
              <Text style={styles.uploadText}>
                {idCard ? "Change ID" : "Upload ID Card"}
              </Text>
            </TouchableOpacity>
            {idCard && (
              <Image source={{ uri: idCard.uri }} style={styles.preview} />
            )}
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, isUploading && styles.disabledBtn]}
            onPress={handleSubmit}
            disabled={isUploading}
          >
            {isUploading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.submitText}>Register Staff</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Registered Staff</Text>
        {staffList.map((staff) => (
          <View key={staff.id} style={styles.card}>
            <View style={styles.staffHeader}>
              <Text style={styles.staffName}>{staff.staffName}</Text>
              <View style={styles.typeBadge}>
                <Text style={styles.typeBadgeText}>{staff.staffType}</Text>
              </View>
            </View>
            <Text style={styles.staffContact}>📞 {staff.contact}</Text>
            <View style={styles.fileIds}>
              <Text style={styles.fileId}>Photo: {staff.photoFileId}</Text>
              <Text style={styles.fileId}>Doc: {staff.idCardFileId}</Text>
            </View>
          </View>
        ))}
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
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 16,
    marginTop: 8,
  },
  form: {
    backgroundColor: "#FFFFFF",
    padding: 20,
    borderRadius: 20,
    marginBottom: 24,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  input: {
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: "#0F172A",
    marginBottom: 16,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  typeChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  activeChip: {
    backgroundColor: "#3B82F6",
    borderColor: "#3B82F6",
  },
  chipText: {
    color: "#64748B",
    fontWeight: "600",
  },
  activeChipText: {
    color: "#FFFFFF",
  },
  uploadRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 12,
  },
  uploadBtn: {
    backgroundColor: "#F1F5F9",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flex: 1,
  },
  uploadText: {
    color: "#475569",
    fontWeight: "600",
    textAlign: "center",
  },
  preview: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: "#E2E8F0",
  },
  submitBtn: {
    backgroundColor: "#3B82F6",
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  submitText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 16,
  },
  card: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  staffHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  staffName: {
    fontWeight: "800",
    fontSize: 16,
    color: "#0F172A",
  },
  typeBadge: {
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  typeBadgeText: {
    color: "#3B82F6",
    fontSize: 12,
    fontWeight: "700",
  },
  staffContact: {
    color: "#64748B",
    fontSize: 14,
    marginBottom: 12,
  },
  fileIds: {
    flexDirection: "row",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 12,
  },
  fileId: {
    fontSize: 11,
    color: "#94A3B8",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
});
