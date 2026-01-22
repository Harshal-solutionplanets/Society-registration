import { appId, db } from "@/configs/firebaseConfig";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "expo-router";
import {
    collection,
    deleteDoc,
    doc,
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
import * as ImagePicker from 'expo-image-picker';
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
                `artifacts/${appId}/public/data/societies/${user.uid}/Staff`
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

    const handlePickImage = async (type: 'photo' | 'idCard' | 'addressProof') => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            quality: 0.5,
            base64: true,
        });

        if (!result.canceled) {
            const asset = result.assets[0];

            // Checking size (rough estimate from base64)
            // 500KB = ~682666 characters in base64.
            if (asset.base64 && asset.base64.length > 682666) {
                Alert.alert("Error", "File size too large. Maximum limit is 500KB.");
                return;
            }

            const base64Image = `data:image/jpeg;base64,${asset.base64}`;
            if (type === 'photo') setPhoto(base64Image);
            else if (type === 'idCard') setIdCard(base64Image);
            else if (type === 'addressProof') setAddressProof(base64Image);
        }
    };

    const handleAddOrUpdateStaff = async () => {
        if (!user) return;
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
            const staffData: StaffMember = {
                id: staffId,
                name,
                position: finalPosition,
                phone,
                email,
                shift,
                joinedDate: new Date().toISOString().split('T')[0],
                photo: photo || "",
                idCard: idCard || "",
                addressProof: addressProof || "",
            };

            const staffPath = `artifacts/${appId}/public/data/societies/${user.uid}/Staff/${staffId}`;
            await setDoc(doc(db, staffPath), staffData, { merge: true });

            if (editingId) {
                setMembers((prev: StaffMember[]) => prev.map((m: StaffMember) => m.id === editingId ? staffData : m));
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
            Alert.alert("Error", error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteStaff = async (member: StaffMember) => {
        if (!user) return;
        Alert.alert(
            "Delete Staff",
            `Are you sure you want to remove ${member.name}?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            const staffPath = `artifacts/${appId}/public/data/societies/${user.uid}/Staff/${member.id}`;
                            await deleteDoc(doc(db, staffPath));
                            setMembers((prev: StaffMember[]) => prev.filter((m: StaffMember) => m.id !== member.id));
                            Toast.show({ type: "info", text1: "Staff Removed" });
                        } catch (error: any) {
                            Alert.alert("Error", error.message);
                        }
                    },
                },
            ],
        );
    };

    const handleEditStaff = (member: StaffMember) => {
        setEditingId(member.id);
        setName(member.name);

        const isOther = !STAFF_POSITIONS.includes(member.position) && member.position !== "Other";
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
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Text style={styles.backBtnText}>← Back</Text>
                    </TouchableOpacity>
                    <Text style={styles.title}>Society Staff</Text>
                </View>

                <View style={styles.formSection}>
                    <Text style={styles.sectionTitle}>{editingId ? "Edit Staff Member" : "Add New Staff"}</Text>

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
                                <Text style={[styles.dropdownText, !position && { color: "#94A3B8" }]}>
                                    {position || "Select Position"}
                                </Text>
                                <Text>▼</Text>
                            </TouchableOpacity>
                            {showPositionDropdown && (
                                <View style={styles.dropdownListContainer}>
                                    <ScrollView style={styles.dropdownList} nestedScrollEnabled={true}>
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
                            <TouchableOpacity style={styles.uploadBox} onPress={() => handlePickImage('photo')}>
                                {photo ? (
                                    <Image source={{ uri: photo }} style={styles.previewImage} />
                                ) : (
                                    <View style={styles.uploadPlaceholder}>
                                        <Text style={styles.uploadIcon}>👤</Text>
                                        <Text style={styles.uploadLabel}>Photo</Text>
                                    </View>
                                )}
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.uploadBox} onPress={() => handlePickImage('idCard')}>
                                {idCard ? (
                                    <Image source={{ uri: idCard }} style={styles.previewImage} />
                                ) : (
                                    <View style={styles.uploadPlaceholder}>
                                        <Text style={styles.uploadIcon}>💳</Text>
                                        <Text style={styles.uploadLabel}>Photo ID card</Text>
                                    </View>
                                )}
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.uploadBox} onPress={() => handlePickImage('addressProof')}>
                                {addressProof ? (
                                    <Image source={{ uri: addressProof }} style={styles.previewImage} />
                                ) : (
                                    <View style={styles.uploadPlaceholder}>
                                        <Text style={styles.uploadIcon}>🏠</Text>
                                        <Text style={styles.uploadLabel}>Address Proof</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
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
                                <Text style={styles.primaryBtnText}>{editingId ? "Update Staff" : "Add Staff Member"}</Text>
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
                                        <Image source={{ uri: member.photo }} style={styles.memberAvatar} />
                                    ) : (
                                        <View style={[styles.memberAvatar, styles.placeholderAvatar]}>
                                            <Text style={styles.avatarText}>{member.name.charAt(0).toUpperCase()}</Text>
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
                                    <TouchableOpacity onPress={() => handleEditStaff(member)} style={styles.editBtn}>
                                        <Text style={styles.editBtnText}>Edit</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => handleDeleteStaff(member)} style={styles.deleteBtn}>
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
    loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
    header: { padding: 20, paddingTop: 60, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" },
    backBtn: { marginBottom: 10 },
    backBtnText: { color: "#3B82F6", fontSize: 16, fontWeight: "600" },
    title: { fontSize: 24, fontWeight: "900", color: "#0F172A" },
    formSection: { padding: 20, backgroundColor: "#fff", marginBottom: 16 },
    sectionTitle: { fontSize: 18, fontWeight: "800", color: "#0F172A", marginBottom: 16 },
    inputGroup: { marginBottom: 16 },
    label: { fontSize: 13, fontWeight: "700", color: "#64748B", marginBottom: 8, marginLeft: 4 },
    input: { backgroundColor: "#F8FAFC", padding: 14, borderRadius: 12, fontSize: 16, borderWidth: 1, borderColor: "#E2E8F0", color: "#0F172A" },
    row: { flexDirection: "row", gap: 12, marginBottom: 16 },
    dropdownButton: { backgroundColor: "#F8FAFC", padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    dropdownText: { fontSize: 16, color: "#0F172A" },
    dropdownListContainer: { position: "absolute", top: 80, left: 0, right: 0, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", maxHeight: 200, zIndex: 2000, elevation: 5 },
    dropdownList: { padding: 8 },
    dropdownItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
    formButtons: { gap: 12, marginTop: 12 },
    primaryBtn: { backgroundColor: "#0F172A", padding: 16, borderRadius: 14, alignItems: "center" },
    primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
    cancelBtn: { padding: 12, alignItems: "center" },
    cancelBtnText: { color: "#64748B", fontWeight: "600" },
    disabledBtn: { opacity: 0.7 },
    listSection: { padding: 20 },
    memberCard: { backgroundColor: "#fff", padding: 16, borderRadius: 20, marginBottom: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderColor: "#E2E8F0" },
    memberInfo: { flex: 1 },
    memberName: { fontSize: 16, fontWeight: "800", color: "#0F172A" },
    memberMeta: { fontSize: 14, color: "#3B82F6", fontWeight: "600", marginTop: 2 },
    memberContact: { fontSize: 12, color: "#64748B", marginTop: 4 },
    memberActions: { flexDirection: "row", gap: 12 },
    editBtn: { padding: 8 },
    editBtnText: { color: "#3B82F6", fontWeight: "700" },
    deleteBtn: { padding: 8 },
    deleteBtnText: { color: "#EF4444", fontWeight: "700" },
    emptyState: { padding: 40, alignItems: "center" },
    emptyText: { color: "#94A3B8", fontSize: 14 },
    uploadSection: { marginBottom: 20 },
    uploadRow: { flexDirection: 'row', gap: 12, marginTop: 10 },
    uploadBox: {
        flex: 1,
        height: 100,
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: '#CBD5E1',
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
    },
    uploadPlaceholder: { alignItems: 'center' },
    uploadIcon: { fontSize: 24, marginBottom: 4 },
    uploadLabel: { fontSize: 11, fontWeight: '600', color: '#64748B' },
    previewImage: { width: '100%', height: '100%', resizeMode: 'cover' },
    memberHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    memberAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#F1F5F9' },
    placeholderAvatar: { justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
    avatarText: { fontSize: 20, fontWeight: '800', color: '#64748B' },
});
