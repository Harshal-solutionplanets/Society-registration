import { db } from '@/configs/firebaseConfig';
import { COLLECTIONS } from '@/constants/Config';
import { useAuth } from '@/hooks/useAuth';
import { uploadFileToGoogleDrive } from '@/utils/driveUtils';
import * as ImagePicker from 'expo-image-picker';
import { addDoc, collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function ResidentDashboard() {
  const { user } = useAuth();
  const [staffName, setStaffName] = useState('');
  const [staffType, setStaffType] = useState('Maid');
  const [contact, setContact] = useState('');

  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [idCard, setIdCard] = useState<ImagePicker.ImagePickerAsset | null>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [staffList, setStaffList] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, `users/${user.uid}/${COLLECTIONS.STAFF}`),
      orderBy('uploadedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setStaffList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
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
      Alert.alert('Error', 'Please fill all fields and upload both Photo and ID Card.');
      return;
    }

    if (!user) return;

    setIsUploading(true);
    try {
      // Mock Uploads
      // In a real app, we would fetch the Society's Drive Folder ID first.
      // For now, we just mock it.
      const photoUploadResult = await uploadFileToGoogleDrive(
        { name: 'photo.jpg', uri: photo.uri },
        { type: 'photo', parentFolderId: 'MOCK_FOLDER_ID' }
      );

      const idCardUploadResult = await uploadFileToGoogleDrive(
        { name: 'id_card.jpg', uri: idCard.uri },
        { type: 'id_card', parentFolderId: 'MOCK_FOLDER_ID' }
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

      Alert.alert('Success', 'Staff registered successfully!');
      setStaffName('');
      setContact('');
      setPhoto(null);
      setIdCard(null);

    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>My Unit Staff</Text>

      <View style={styles.form}>
        <Text style={styles.sectionTitle}>Add New Staff</Text>

        <TextInput
          style={styles.input}
          placeholder="Staff Name"
          value={staffName}
          onChangeText={setStaffName}
        />

        <View style={styles.row}>
          {['Maid', 'Driver', 'Cook', 'Other'].map(type => (
            <TouchableOpacity
              key={type}
              style={[styles.typeChip, staffType === type && styles.activeChip]}
              onPress={() => setStaffType(type)}
            >
              <Text style={[styles.chipText, staffType === type && styles.activeChipText]}>{type}</Text>
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
          <TouchableOpacity style={styles.uploadBtn} onPress={() => pickImage(setPhoto)}>
            <Text style={styles.uploadText}>{photo ? 'Change Photo' : 'Upload Photo'}</Text>
          </TouchableOpacity>
          {photo && <Image source={{ uri: photo.uri }} style={styles.preview} />}
        </View>

        <View style={styles.uploadRow}>
          <TouchableOpacity style={styles.uploadBtn} onPress={() => pickImage(setIdCard)}>
            <Text style={styles.uploadText}>{idCard ? 'Change ID' : 'Upload ID Card'}</Text>
          </TouchableOpacity>
          {idCard && <Image source={{ uri: idCard.uri }} style={styles.preview} />}
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, isUploading && styles.disabledBtn]}
          onPress={handleSubmit}
          disabled={isUploading}
        >
          <Text style={styles.submitText}>{isUploading ? 'Uploading...' : 'Register Staff'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Registered Staff</Text>
      {staffList.map(staff => (
        <View key={staff.id} style={styles.card}>
          <Text style={styles.staffName}>{staff.staffName} ({staff.staffType})</Text>
          <Text>Contact: {staff.contact}</Text>
          <Text style={styles.fileId}>Photo ID: {staff.photoFileId}</Text>
          <Text style={styles.fileId}>Doc ID: {staff.idCardFileId}</Text>
        </View>
      ))}

      <TouchableOpacity style={styles.signOutButton} onPress={useAuth().signOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#f5f5f5',
    flexGrow: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
    marginTop: 10,
  },
  form: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 15,
  },
  typeChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#eee',
  },
  activeChip: {
    backgroundColor: '#007AFF',
  },
  chipText: {
    color: '#333',
  },
  activeChipText: {
    color: 'white',
  },
  uploadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    gap: 10,
  },
  uploadBtn: {
    backgroundColor: '#e1e1e1',
    padding: 10,
    borderRadius: 6,
  },
  uploadText: {
    color: '#333',
  },
  preview: {
    width: 40,
    height: 40,
    borderRadius: 4,
  },
  submitBtn: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  disabledBtn: {
    opacity: 0.7,
  },
  submitText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  card: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
  },
  staffName: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  fileId: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  signOutButton: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#ff4444',
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  signOutText: {
    color: 'white',
    fontWeight: 'bold',
  },
});
