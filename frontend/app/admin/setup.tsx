import { appId, db } from '@/configs/firebaseConfig';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'expo-router';
import { doc, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';

export default function AdminSetup() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    societyName: '',
    societyAddress: '',
    registrationNo: '',
    unitCount: '',
    wingCount: '',
    adminName: '',
    adminContact: ''
  });

  useEffect(() => {
    const token = typeof window !== 'undefined' ? sessionStorage.getItem('driveToken') : null;
    if (!token && user) {
      Toast.show({
        type: 'error',
        text1: 'Session Expired',
        text2: 'Please log in again to link Google Drive.'
      });
      handleBackToLogin();
    }
  }, [user]);

  const handleBackToLogin = async () => {
    await signOut();
    router.replace('/admin/auth');
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSetup = async () => {
    const { societyName, unitCount, wingCount, adminName } = formData;
    
    // Validation for essential fields
    if (!societyName || !unitCount || !wingCount || !adminName) {
      Toast.show({ 
        type: 'error', 
        text1: 'Required Fields', 
        text2: 'Please fill in all essential fields.' 
      });
      return;
    }

    if (!user || !user.email) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'User authentication failed. Please log in again.'
      });
      return;
    }

    const token = typeof window !== 'undefined' ? sessionStorage.getItem('driveToken') : null;
    if (!token) {
      Toast.show({ 
        type: 'error', 
        text1: 'Session Expired', 
        text2: 'Please log in again to link Google Drive.' 
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Create the physical folder in Google Drive
      const driveResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: `${societyName.toUpperCase()}-DRIVE`,
          mimeType: 'application/vnd.google-apps.folder',
        }),
      });

      if (!driveResponse.ok) {
        const errorData = await driveResponse.json();
        throw new Error(errorData.error?.message || "Failed to create Google Drive folder");
      }

      const driveData = await driveResponse.json();
      const realFolderId = driveData.id;

      // 2. Save everything to Firestore
      const newSocietyData = {
        ...formData,
        unitCount: parseInt(unitCount),
        wingCount: parseInt(wingCount),
        adminUserId: user.uid,
        adminEmail: user.email,
        driveEmail: user.email,
        driveFolderId: realFolderId,
        role: 'ADMIN',
        createdAt: new Date().toISOString(),
      };

      await setDoc(doc(db, `artifacts/${appId}/public/data/societies`, user.uid), newSocietyData);
      
      Toast.show({ 
        type: 'success', 
        text1: 'Setup Successful', 
        text2: 'Society and Drive folder created!' 
      });
      router.replace('/admin/dashboard');
    } catch (error: any) {
      console.error("Setup error:", error);
      Toast.show({ 
        type: 'error', 
        text1: 'Setup Error', 
        text2: error.message || 'Could not save society data.' 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Society Setup</Text>
        <Text style={styles.description}>
          Register your society to start managing staff documentation.
        </Text>

        <View style={styles.form}>
          <Text style={styles.label}>Society Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Blue Ridge Society"
            value={formData.societyName}
            onChangeText={(val) => handleInputChange('societyName', val)}
          />

          <Text style={styles.label}>Society Address</Text>
          <TextInput
            style={[styles.input, { height: 80 }]}
            placeholder="e.g. 123 Street, Pune, India"
            value={formData.societyAddress}
            onChangeText={(val) => handleInputChange('societyAddress', val)}
            multiline
          />

          <Text style={styles.label}>Society Registration No.</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. SR/12345/2026"
            value={formData.registrationNo}
            onChangeText={(val) => handleInputChange('registrationNo', val)}
          />

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Total Units *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 100"
                value={formData.unitCount}
                onChangeText={(val) => handleInputChange('unitCount', val)}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Wings/Blocks *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 3"
                value={formData.wingCount}
                onChangeText={(val) => handleInputChange('wingCount', val)}
                keyboardType="numeric"
              />
            </View>
          </View>

          <Text style={styles.label}>Admin Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Harshal Patil"
            value={formData.adminName}
            onChangeText={(val) => handleInputChange('adminName', val)}
          />

          <Text style={styles.label}>Admin Contact</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 9876543210"
            value={formData.adminContact}
            onChangeText={(val) => handleInputChange('adminContact', val)}
            keyboardType="phone-pad"
          />

          <TouchableOpacity 
            style={[styles.button, isSubmitting && styles.buttonDisabled]} 
            onPress={handleSetup}
            disabled={isSubmitting}
          >
            <Text style={styles.buttonText}>
              {isSubmitting ? 'Registering...' : 'Complete Setup'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.backButton} 
            onPress={handleBackToLogin}
            disabled={isSubmitting}
          >
            <Text style={styles.backButtonText}>Back to Login</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
    textAlign: 'center',
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
  backButton: {
    marginTop: 15,
    padding: 15,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#666',
    fontSize: 16,
    textDecorationLine: 'underline',
  },
});
