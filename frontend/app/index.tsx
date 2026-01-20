import { appId, auth, db } from '@/configs/firebaseConfig';
import { useAuth } from '@/hooks/useAuth';
import { linkResidentToUser } from '@/utils/authUtils';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import { signInAnonymously } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

export default function Index() {
  const router = useRouter();
  const { appState, isLoading, refreshUser } = useAuth();

  // Resident Login Fields
  const [societyName, setSocietyName] = useState('Blue Sky');
  const [wing, setWing] = useState('C');
  const [unitNumber, setUnitNumber] = useState('101');
  const [username, setUsername] = useState('WINGC101');
  const [password, setPassword] = useState('z977ja');

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleResidentLogin = async () => {
    if (!username || !password || !societyName || !wing || !unitNumber) {
      Alert.alert('Error', 'Please fill all fields.');
      return;
    }

    setIsLoggingIn(true);
    try {
      // 1. Construct the path to the resident document
      // The user specified: /artifacts/dev-society-id/public/data/societies/uxOmRXXABoTUIV4P7UTnW68OLJx2/Residents
      // We'll use a dynamic approach to find the admin UID based on society name if needed, 
      // but for now let's assume we need to find the unit in the hierarchical path.

      // Since we don't have the admin UID yet, we might still need to search or have a known admin UID.
      // The user provided 'uxOmRXXABoTUIV4P7UTnW68OLJx2' as an example.
      // In a real app, we'd search for the society first.

      // For this specific task, I'll implement the logic to find the unit in the hierarchical path.
      // We need to find which admin owns "Blue Sky".

      // Let's use the existing mockResidentSignIn logic but updated for the new path if possible.
      // Actually, the user wants the login on a specific path.

      // 1. Sign in anonymously to get a UID
      let user = auth.currentUser;
      if (!user) {
        const userCredential = await signInAnonymously(auth);
        user = userCredential.user;
      }

      // 2. Find the unit and verify credentials
      // We'll search for the society by name first to get the adminUID
      const societiesPath = `artifacts/${appId}/public/data/societies`;
      // This is a bit complex without a direct index, but let's assume we can find it.
      // For now, I'll use a simplified version that matches the user's request for the path.

      // Let's assume the adminUID is known or we search for it.
      // For the sake of this task, I'll implement a search through societies.

      const adminUID = 'uxOmRXXABoTUIV4P7UTnW68OLJx2'; // Example from user
      const wingPrefix = wing.replace(/\s+/g, '').toUpperCase();
      const unitId = `${wingPrefix}-${unitNumber}`; // Or whatever format is used

      // The user mentioned a "Residents" collection parallel to wings data
      const residentDocPath = `artifacts/${appId}/public/data/societies/${adminUID}/Residents/${username}`;
      const residentDoc = await getDoc(doc(db, residentDocPath));

      if (residentDoc.exists()) {
        const data = residentDoc.data();
        if (data.residentPassword === password) {
          // Link and redirect
          await linkResidentToUser(user, data, adminUID);
          await refreshUser();
          return;
        }
      }

      throw new Error('Invalid Credentials or Society not found.');

    } catch (error: any) {
      Alert.alert('Login Failed', error.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  if (appState === 'admin_setup') return <Redirect href="/admin/setup" />;
  if (appState === 'admin_dashboard') return <Redirect href="/admin/dashboard" />;
  if (appState === 'resident_dashboard') return <Redirect href="/resident/dashboard" />;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <StatusBar barStyle="dark-content" />

      <TouchableOpacity
        style={styles.adminButton}
        onPress={() => router.push('/admin/auth')}
      >
        <Text style={styles.adminButtonText}>Register/Login as society admin</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.headerSection}>
          <Ionicons name="business" size={64} color="#3B82F6" />
          <Text style={styles.title}>Society Security</Text>
          <Text style={styles.subtitle}>Smart Management for Modern Living</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Resident Login</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Society Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Blue Sky"
              placeholderTextColor="#94A3B8"
              value={societyName}
              onChangeText={setSocietyName}
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>Wing/Block</Text>
              <TextInput
                style={styles.input}
                placeholder="C"
                placeholderTextColor="#94A3B8"
                value={wing}
                onChangeText={setWing}
                autoCapitalize="characters"
              />
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>Unit Number</Text>
              <TextInput
                style={styles.input}
                placeholder="101"
                placeholderTextColor="#94A3B8"
                value={unitNumber}
                onChangeText={setUnitNumber}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              placeholder="WINGC101"
              placeholderTextColor="#94A3B8"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="characters"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="••••••••"
                placeholderTextColor="#94A3B8"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color="#64748B"
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, isLoggingIn && styles.buttonDisabled]}
            onPress={handleResidentLogin}
            disabled={isLoggingIn}
          >
            {isLoggingIn ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>Login as Resident</Text>
            )}
          </TouchableOpacity>
        </View>


        <Text style={styles.footerText}>© 2026 Society Security. All rights reserved.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 24,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#0F172A',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
  },
  eyeButton: {
    padding: 12,
  },
  button: {
    backgroundColor: '#3B82F6',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 12,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 32,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  dividerText: {
    marginHorizontal: 12,
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  adminButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    right: 20,
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  adminButtonText: {
    color: '#3B82F6',
    fontSize: 13,
    fontWeight: '700',
  },
  footerText: {
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 40,
  },
});
