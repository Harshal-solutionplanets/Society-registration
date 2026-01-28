import { appId, db } from "@/configs/firebaseConfig";
import { useAuth } from "@/hooks/useAuth";
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
import { Ionicons } from "@expo/vector-icons";

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
        const boundary = "foo_bar_baz";
        const body =
            `--${boundary}\r\n` +
            `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
            JSON.stringify({ name: fileName, parents: [parentId] }) +
            `\r\n` +
            `--${boundary}\r\n` +
            `Content-Type: image/jpeg\r\n` +
            `Content-Transfer-Encoding: base64\r\n\r\n` +
            cleanBase64 +
            `\r\n--${boundary}--`;

        const res = await fetch(
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": `multipart/related; boundary=${boundary}`,
                },
                body: body,
            },
        );

        if (!res.ok) {
            const err = await res.json();
            console.error("DEBUG: uploadImageToDrive failed", err);
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
        // Search for file by name in the specific folder
        const q = `name='${fileName}' and '${folderId}' in parents and trashed=false`;
        const searchRes = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}`,
            {
                headers: { Authorization: `Bearer ${token}` },
            },
        );

        if (!searchRes.ok) return; // File might not exist, that's ok

        const searchData = await searchRes.json();
        if (searchData.files && searchData.files.length > 0) {
            const fileId = searchData.files[0].id;
            console.log(`DEBUG: Deleting existing file: ${fileName} (${fileId})`);

            // Delete the old file
            await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
        }
    } catch (error) {
        console.warn("DEBUG: deleteFileFromDrive error (non-critical):", error);
        // Don't throw - we can proceed even if deletion fails
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
            {
                headers: { Authorization: `Bearer ${token}` },
            },
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
            console.error("DEBUG: moveFolder failed", err);
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

    const handleDocumentChange = async (type: "photo" | "idCard" | "addressProof", action: "pick" | "delete") => {
        let newValue = null;

        if (action === "pick") {
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
                newValue = `data:image/jpeg;base64,${asset.base64}`;
            } else {
                return;
            }
        }

        // Update state immediately
        if (type === "photo") setPhoto(newValue);
        else if (type === "idCard") setIdCard(newValue);
        else if (type === "addressProof") setAddressProof(newValue);

        // If we are editing an existing record, sync "turant" (immediately)
        if (editingId && user) {
            const fileName = type === "photo" ? "Photo.jpg" : type === "idCard" ? "ID_Card.jpg" : "Address_Proof.jpg";

            try {
                // 1. Update Firestore
                const updateObj = { [type]: newValue || "", updatedAt: new Date().toISOString() };
                const staffPath = `artifacts/${appId}/public/data/societies/${user.uid}/Staff/${editingId}`;
                await setDoc(doc(db, staffPath), updateObj, { merge: true });

                // 2. Drive Update (if token present)
                const token = typeof window !== "undefined" ? sessionStorage.getItem("driveToken") : null;
                const existingMember = members.find(m => m.id === editingId);
                const staffFolderId = existingMember?.driveFolderId;

                if (token && staffFolderId) {
                    // Delete existing first
                    await deleteFileFromDrive(fileName, staffFolderId, token);
                    if (newValue) {
                        await uploadImageToDrive(newValue, fileName, staffFolderId, token);
                    }
                }

                Toast.show({
                    type: "success",
                    text1: "Auto-synced",
                    text2: `${type} updated in cloud.`
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
            setFormErrors(prev => ({ ...prev, phone: "Phone must be 10 digits" }));
        } else {
            setFormErrors(prev => ({ ...prev, phone: "" }));
        }
    };

    const handleEmailChange = (val: string) => {
        setEmail(val);
        if (val.length > 0) {
            if (!val.toLowerCase().endsWith("@gmail.com")) {
                setFormErrors(prev => ({ ...prev, email: "Only @gmail.com leads are allowed" }));
            } else {
                setFormErrors(prev => ({ ...prev, email: "" }));
            }
        } else {
            setFormErrors(prev => ({ ...prev, email: "" }));
        }
    };

    const handleAddOrUpdateStaff = async () => {
        if (!user) return;

        // Validation check
        if (phone.length !== 10) {
            setFormErrors(prev => ({ ...prev, phone: "Phone must be 10 digits" }));
            return;
        }
        if (email && !email.toLowerCase().endsWith("@gmail.com")) {
            setFormErrors(prev => ({ ...prev, email: "Only @gmail.com leads are allowed" }));
            return;
        }

        if (!name || !position || !phone) {
            Alert.alert("Error", "Please fill Name, Position and Phone");
            return;
        }

        if (position === "Other" && !otherPosition) {
            Alert.alert("Error", "Please specify the position.");
            return;
        }

        setSaving(true);
        try {
            const staffId = editingId || `staff_${Date.now()}`;
            const finalPosition = position === "Other" ? otherPosition : position;

            // Start Drive Logic
            let staffFolderId = "";
            // If editing and we already have a folder, keep it.
            if (editingId) {
                const existingMember = members.find((m) => m.id === editingId);
                if (existingMember?.driveFolderId) {
                    staffFolderId = existingMember.driveFolderId;
                }
            }

            const token =
                typeof window !== "undefined"
                    ? sessionStorage.getItem("driveToken")
                    : null;
            console.log("DEBUG: Drive Token present?", !!token);

            if (token) {
                try {
                    // 1. Get Society Root
                    const societyDoc = await getDoc(
                        doc(db, `artifacts/${appId}/public/data/societies`, user.uid),
                    );
                    const societyData = societyDoc.data();
                    console.log(
                        "DEBUG: Society Drive Folder ID:",
                        societyData?.driveFolderId,
                    );

                    if (societyData?.driveFolderId) {
                        // 2. Find/Create "Society_Staff"
                        const mainStaffFolderId = await findOrCreateFolder(
                            "Society_Staff",
                            societyData.driveFolderId,
                            token,
                        );
                        console.log("DEBUG: Society_Staff Folder ID:", mainStaffFolderId);

                        // 3. Find/Create Member Folder
                        if (!staffFolderId) {
                            staffFolderId = await findOrCreateFolder(
                                name,
                                mainStaffFolderId,
                                token,
                            );
                            console.log("DEBUG: New Staff Folder ID:", staffFolderId);
                        } else {
                            console.log(
                                "DEBUG: Using existing Staff Folder ID:",
                                staffFolderId,
                            );
                        }

                        // 4. Upload Files (Replace if editing)
                        if (photo) {
                            if (editingId) {
                                // Delete old photo before uploading new one
                                await deleteFileFromDrive("Photo.jpg", staffFolderId, token);
                            }
                            await uploadImageToDrive(photo, "Photo.jpg", staffFolderId, token);
                        }
                        if (idCard) {
                            if (editingId) {
                                // Delete old ID card before uploading new one
                                await deleteFileFromDrive("ID_Card.jpg", staffFolderId, token);
                            }
                            await uploadImageToDrive(
                                idCard,
                                "ID_Card.jpg",
                                staffFolderId,
                                token,
                            );
                        }
                        if (addressProof) {
                            if (editingId) {
                                // Delete old address proof before uploading new one
                                await deleteFileFromDrive(
                                    "Address_Proof.jpg",
                                    staffFolderId,
                                    token,
                                );
                            }
                            await uploadImageToDrive(
                                addressProof,
                                "Address_Proof.jpg",
                                staffFolderId,
                                token,
                            );
                        }
                    } else {
                        console.warn("DEBUG: No root driveFolderId found in society data.");
                    }
                } catch (driveErr: any) {
                    console.error("DEBUG: Drive Auth/Sync error:", driveErr);
                    Toast.show({
                        type: "info",
                        text1: "Drive Sync Failed",
                        text2: "Google Session expired. Saved to Firestore only.",
                    });
                    // We don't re-throw here so the Firestore save continues
                }
            } else {
                console.warn("DEBUG: No Drive Token in session storage.");
                Alert.alert(
                    "Notice",
                    "Google Drive not linked. Documents saved locally only.",
                );
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
            console.log("DEBUG: Starting archive process for", member.name);

            // 1. Archive to Firestore "ArchivedStaff" collection (CRITICAL - always do this)
            const archivedStaffPath = `artifacts/${appId}/public/data/societies/${user.uid}/ArchivedStaff/${member.id}`;
            const archiveData = {
                ...member,
                archivedAt: new Date().toISOString(),
                archivedBy: user.uid,
            };
            await setDoc(doc(db, archivedStaffPath), archiveData);
            console.log("DEBUG: Staff metadata archived to Firestore");

            // 2. Try to move Drive folder to "Archived Staff" folder (NON-CRITICAL)
            let driveArchived = false;
            const token =
                typeof window !== "undefined"
                    ? sessionStorage.getItem("driveToken")
                    : null;
            console.log("DEBUG: Archive Token present?", !!token);
            console.log("DEBUG: Member Folder ID:", member.driveFolderId);

            if (token && member.driveFolderId) {
                try {
                    const societyDoc = await getDoc(
                        doc(db, `artifacts/${appId}/public/data/societies`, user.uid),
                    );
                    const societyData = societyDoc.data();
                    if (societyData?.driveFolderId) {
                        const archiveFolderId = await findOrCreateFolder(
                            "Archived Staff",
                            societyData.driveFolderId,
                            token,
                        );
                        console.log("DEBUG: Archive Drive Folder ID:", archiveFolderId);
                        await moveFolder(member.driveFolderId, archiveFolderId, token);
                        console.log("DEBUG: Documents moved to Archived Staff in Drive");
                        driveArchived = true;
                    }
                } catch (driveError: any) {
                    console.warn(
                        "DEBUG: Drive archiving failed (token may be expired):",
                        driveError.message,
                    );
                    // Don't throw - continue with Firestore operations
                }
            }

            // 3. Delete from active "Staff" collection
            const staffPath = `artifacts/${appId}/public/data/societies/${user.uid}/Staff/${member.id}`;
            await deleteDoc(doc(db, staffPath));

            // 4. Update UI
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
                        <Text style={styles.label}>Full Name</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="e.g. Ramesh"
                            value={name}
                            onChangeText={setName}
                        />
                    </View>

                    <View style={[styles.row, { zIndex: 1000 }]}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.label}>Position</Text>
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
                            <Text style={styles.label}>Shift</Text>
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
                        <Text style={styles.label}>Phone Number</Text>
                        <TextInput
                            style={[styles.input, formErrors.phone ? styles.inputError : null]}
                            placeholder="e.g. 9876543210"
                            value={phone}
                            onChangeText={handlePhoneChange}
                            keyboardType="phone-pad"
                            maxLength={10}
                        />
                        {formErrors.phone ? <Text style={styles.errorText}>{formErrors.phone}</Text> : null}
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Email (Optional)</Text>
                        <TextInput
                            style={[styles.input, formErrors.email ? styles.inputError : null]}
                            placeholder="e.g. ramesh@gmail.com"
                            value={email}
                            onChangeText={handleEmailChange}
                            keyboardType="email-address"
                            autoCapitalize="none"
                        />
                        {formErrors.email ? <Text style={styles.errorText}>{formErrors.email}</Text> : null}
                    </View>

                    <View style={styles.uploadSection}>
                        <Text style={styles.label}>Required Documents (Max 500KB)</Text>
                        <View style={styles.uploadRow}>
                            {/* PHOTO */}
                            <View style={styles.uploadWrapper}>
                                <TouchableOpacity
                                    style={styles.uploadBox}
                                    onPress={() => !photo && handleDocumentChange("photo", "pick")}
                                    activeOpacity={photo ? 1 : 0.7}
                                >
                                    {photo ? (
                                        <Image source={{ uri: photo }} style={styles.previewImage} resizeMode="cover" />
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

                            {/* ID CARD */}
                            <View style={styles.uploadWrapper}>
                                <TouchableOpacity
                                    style={styles.uploadBox}
                                    onPress={() => !idCard && handleDocumentChange("idCard", "pick")}
                                    activeOpacity={idCard ? 1 : 0.7}
                                >
                                    {idCard ? (
                                        <Image source={{ uri: idCard }} style={styles.previewImage} resizeMode="cover" />
                                    ) : (
                                        <View style={styles.uploadPlaceholder}>
                                            <Text style={styles.uploadIcon}>💳</Text>
                                            <Text style={styles.uploadLabel}>Photo ID</Text>
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

                            {/* ADDRESS PROOF */}
                            <View style={styles.uploadWrapper}>
                                <TouchableOpacity
                                    style={styles.uploadBox}
                                    onPress={() => !addressProof && handleDocumentChange("addressProof", "pick")}
                                    activeOpacity={addressProof ? 1 : 0.7}
                                >
                                    {addressProof ? (
                                        <Image source={{ uri: addressProof }} style={styles.previewImage} resizeMode="cover" />
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
                                            onPress={() => handleDocumentChange("addressProof", "pick")}
                                        >
                                            <Ionicons name="create" size={16} color="white" />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.overlayBtn, styles.deleteOverlay]}
                                            onPress={() => handleDocumentChange("addressProof", "delete")}
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
                            style={[styles.primaryBtn, saving && styles.disabledBtn]}
                            onPress={handleAddOrUpdateStaff}
                            disabled={saving}
                        >
                            {saving ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.primaryBtnText}>
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
                                    setOtherPosition("");
                                    setPhoto(null);
                                    setIdCard(null);
                                    setAddressProof(null);
                                }}
                            >
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                <View style={styles.listSection}>
                    <Text style={styles.sectionTitle}>Current Staff</Text>
                    {members.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyText}>No staff members added yet.</Text>
                        </View>
                    ) : (
                        members.map((member: StaffMember) => (
                            <View key={member.id} style={styles.memberCard}>
                                <View style={styles.memberHeader}>
                                    {member.photo ? (
                                        <Image
                                            source={{ uri: member.photo }}
                                            style={styles.memberAvatar}
                                            resizeMode="cover"
                                        />
                                    ) : (
                                        <View
                                            style={[styles.memberAvatar, styles.placeholderAvatar]}
                                        >
                                            <Text style={styles.avatarText}>
                                                {member.name.charAt(0).toUpperCase()}
                                            </Text>
                                        </View>
                                    )}
                                    <View style={styles.memberInfo}>
                                        <Text style={styles.memberName}>{member.name}</Text>
                                        <Text style={styles.memberMeta}>
                                            {member.position} • {member.shift} Shift
                                        </Text>
                                        <Text style={styles.memberContact}>{member.phone}</Text>
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
                        ))
                    )}
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#F8FAFC" },
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
        borderBottomColor: "#E2E8F0",
    },
    backBtn: { marginBottom: 10 },
    backBtnText: { color: "#3B82F6", fontSize: 16, fontWeight: "600" },
    title: { fontSize: 24, fontWeight: "900", color: "#0F172A" },
    formSection: { padding: 20, backgroundColor: "#fff", marginBottom: 16 },
    sectionTitle: {
        fontSize: 18,
        fontWeight: "800",
        color: "#0F172A",
        marginBottom: 16,
    },
    inputGroup: { marginBottom: 16 },
    label: {
        fontSize: 13,
        fontWeight: "700",
        color: "#64748B",
        marginBottom: 8,
        marginLeft: 4,
    },
    input: {
        backgroundColor: "#F8FAFC",
        padding: 14,
        borderRadius: 12,
        fontSize: 16,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        color: "#0F172A",
    },
    row: { flexDirection: "row", gap: 12, marginBottom: 16 },
    dropdownButton: {
        backgroundColor: "#F8FAFC",
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    dropdownText: { fontSize: 16, color: "#0F172A" },
    dropdownListContainer: {
        position: "absolute",
        top: 80,
        left: 0,
        right: 0,
        backgroundColor: "#fff",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        maxHeight: 200,
        zIndex: 2000,
        elevation: 5,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    dropdownList: { padding: 8 },
    dropdownItem: {
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#F1F5F9",
    },
    formButtons: { gap: 12, marginTop: 12 },
    primaryBtn: {
        backgroundColor: "#0F172A",
        padding: 16,
        borderRadius: 14,
        alignItems: "center",
    },
    primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
    cancelBtn: { padding: 12, alignItems: "center" },
    cancelBtnText: { color: "#64748B", fontWeight: "600" },
    disabledBtn: { opacity: 0.7 },
    listSection: { padding: 20 },
    memberCard: {
        backgroundColor: "#fff",
        padding: 16,
        borderRadius: 20,
        marginBottom: 12,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#E2E8F0",
    },
    memberInfo: { flex: 1 },
    memberName: { fontSize: 16, fontWeight: "800", color: "#0F172A" },
    memberMeta: {
        fontSize: 14,
        color: "#3B82F6",
        fontWeight: "600",
        marginTop: 2,
    },
    memberContact: { fontSize: 12, color: "#64748B", marginTop: 4 },
    memberActions: { flexDirection: "row", gap: 12 },
    editBtn: { padding: 8 },
    editBtnText: { color: "#3B82F6", fontWeight: "700" },
    deleteBtn: { padding: 8 },
    deleteBtnText: { color: "#EF4444", fontWeight: "700" },
    emptyState: { padding: 40, alignItems: "center" },
    emptyText: { color: "#94A3B8", fontSize: 14 },
    uploadSection: { marginBottom: 20 },
    uploadRow: { flexDirection: "row", gap: 12, marginTop: 10 },
    uploadBox: {
        flex: 1,
        height: 100,
        backgroundColor: "#F8FAFC",
        borderRadius: 12,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: "#CBD5E1",
        overflow: "hidden",
        justifyContent: "center",
        alignItems: "center",
    },
    uploadPlaceholder: { alignItems: "center" },
    uploadIcon: { fontSize: 24, marginBottom: 4 },
    uploadLabel: { fontSize: 11, fontWeight: "600", color: "#64748B" },
    previewImage: { width: "100%", height: "100%" },
    memberHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        flex: 1,
    },
    memberAvatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: "#F1F5F9",
    },
    placeholderAvatar: {
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#E2E8F0",
    },
    avatarText: { fontSize: 20, fontWeight: "800", color: "#64748B" },
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
    uploadWrapper: {
        flex: 1,
        position: 'relative',
    },
    overlayControls: {
        position: 'absolute',
        top: 5,
        right: 5,
        gap: 8,
        flexDirection: 'row',
    },
    overlayBtn: {
        width: 28,
        height: 28,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        elevation: 5,
    },
    editOverlay: {
        backgroundColor: '#3B82F6',
    },
    deleteOverlay: {
        backgroundColor: '#EF4444',
    },
});
