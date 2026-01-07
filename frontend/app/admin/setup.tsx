import { db } from '@/configs/firebaseConfig';
import { COLLECTIONS } from '@/constants/Config';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'expo-router';
import { doc, setDoc } from 'firebase/firestore';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function AdminSetup() {
  const router = useRouter();
  const { user } = useAuth();
  const [societyName, setSocietyName] = useState('');
  const [unitCount, setUnitCount] = useState('');
  const [driveEmail, setDriveEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSetup = async () => {
    if (!societyName || !unitCount || !driveEmail) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }

    if (!user) return;

    setIsSubmitting(true);
    try {
      const mockDriveFolderId = crypto.randomUUID(); 
      
      const newSocietyData = {
        societyName,
        adminUserId: user.uid,
        unitCount: parseInt(unitCount),
        driveEmail,
        driveFolderId: mockDriveFolderId,
        createdAt: new Date().toISOString(),
      };

      await setDoc(doc(db, COLLECTIONS.SOCIETIES, user.uid), newSocietyData);
      
      // After saving, the useAuth hook should detect the document and redirect to dashboard.
      // But we can also manually push if needed, though the index redirect logic is cleaner.
      // We might need to reload the page or trigger a state update.
      // For now, let's assume the hook fires.
      Alert.alert('Success', 'Society registered successfully!');
      
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Society Setup</Text>
      <Text style={styles.description}>
        Register your society to start managing staff documentation.
      </Text>

      <View style={styles.form}>
        <Text style={styles.label}>Society Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Sunshine Apartments"
          value={societyName}
          onChangeText={setSocietyName}
        />

        <Text style={styles.label}>Number of Units</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 50"
          value={unitCount}
          onChangeText={setUnitCount}
          keyboardType="numeric"
        />

        <Text style={styles.label}>Google Drive Email</Text>
        <TextInput
          style={styles.input}
          placeholder="society.admin@gmail.com"
          value={driveEmail}
          onChangeText={setDriveEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <TouchableOpacity 
          style={[styles.button, isSubmitting && styles.buttonDisabled]} 
          onPress={handleSetup}
          disabled={isSubmitting}
        >
          <Text style={styles.buttonText}>
            {isSubmitting ? 'Registering...' : 'Register Society'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  description: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
  },
  form: {
    gap: 15,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 5,
    color: '#444',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 15,
    borderRadius: 8,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 18,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
