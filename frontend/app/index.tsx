import { appId, auth, db } from '@/configs/firebaseConfig';
import { useAuth } from '@/hooks/useAuth';
import { linkResidentToUser, mockResidentSignIn } from '@/utils/authUtils';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import { COLLECTIONS } from '@/constants/Config';
import { signInAnonymously, updateProfile, User } from 'firebase/auth';
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { useState } from 'react';
import {
  ActivityIndicator,
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
import Toast from 'react-native-toast-message';

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
    // Validation with Toast pop-ups
    if (!societyName) {
      Toast.show({ type: 'error', text1: 'Missing Field', text2: 'Please enter the Society Name' });
      return;
    }
    if (!wing) {
      Toast.show({ type: 'error', text1: 'Missing Field', text2: 'Please enter the Wing/Block' });
      return;
    }
    if (!unitNumber) {
      Toast.show({ type: 'error', text1: 'Missing Field', text2: 'Please enter the Unit Number' });
      return;
    }
    if (!username) {
      Toast.show({ type: 'error', text1: 'Missing Field', text2: 'Please enter your Username' });
      return;
    }
    if (!password) {
      Toast.show({ type: 'error', text1: 'Missing Field', text2: 'Please enter your Password' });
      return;
    }

    setIsLoggingIn(true);
    try {
      // 1. Sign in anonymously to get a UID
      let user = auth.currentUser;
      if (!user) {
        const userCredential = await signInAnonymously(auth);
        user = userCredential.user;
      }

      // 2. Find the Society Admin UID dynamically
      const societiesRef = collection(db, `artifacts/${appId}/public/data/societies`);
      const qSociety = query(societiesRef, where("societyName", "==", societyName));
      const societySnapshot = await getDocs(qSociety);

      if (societySnapshot.empty) {
        throw new Error(`Society '${societyName}' not found. Please check the spelling.`);
      }

      const adminUID = societySnapshot.docs[0].id;

      // 3. Find the unit and verify credentials
      // Use a query on the Residents collection to find the unit by username
      const residentsRef = collection(db, `artifacts/${appId}/public/data/societies/${adminUID}/Residents`);
      const qResident = query(residentsRef, where("username", "==", username));
      const residentSnapshot = await getDocs(qResident);

      if (!residentSnapshot.empty) {
        const residentDoc = residentSnapshot.docs[0];
        const data = residentDoc.data();
        if (data.password === password) {
          // Link and redirect
          await linkResidentToUser(user, data, adminUID);
          await refreshUser();

          Toast.show({
            type: 'success',
            text1: 'Login Successful',
            text2: `Welcome ${data.residentName || username}`
          });
          return;
        }
      }

      throw new Error('Invalid Username or Password for this society.');

    } catch (error: any) {
      console.error('Login Error:', error);
      Toast.show({
        type: 'error',
        text1: 'Login Failed',
        text2: error.message || 'Invalid credentials or connection issue'
      });
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
