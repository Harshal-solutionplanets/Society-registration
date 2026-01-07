import { auth } from '@/configs/firebaseConfig';
import { useAuth } from '@/hooks/useAuth';
import { linkResidentToUser, mockResidentSignIn } from '@/utils/authUtils';
import { Redirect, useRouter } from 'expo-router';
import { signInAnonymously } from 'firebase/auth';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function Index() {
  const router = useRouter();
  const { appState, isLoading, refreshUser } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleResidentLogin = async () => {
    if (!username || !password) {
      Alert.alert('Error', 'Please enter both username and password.');
      return;
    }

    setIsLoggingIn(true);
    try {
      // 1. Verify credentials against Firestore
      const { unit, adminUID } = await mockResidentSignIn(username, password);
      
      // 2. Sign in anonymously to get a UID (if not already)
      let user = auth.currentUser;
      if (!user) {
        const userCredential = await signInAnonymously(auth);
        user = userCredential.user;
      }

      // 3. Link the anonymous user to the resident profile
      await linkResidentToUser(user, unit, adminUID);

      // 4. Reload user to update local state (displayName)
      await refreshUser();
      
    } catch (error: any) {
      Alert.alert('Login Failed', error.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (isLoading || isLoggingIn) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (appState === 'admin_setup') return <Redirect href="/admin/setup" />;
  if (appState === 'admin_dashboard') return <Redirect href="/admin/dashboard" />;
  if (appState === 'resident_dashboard') return <Redirect href="/resident/dashboard" />;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Society Security</Text>
      
      <View style={styles.card}>
        <Text style={styles.subtitle}>Resident Login</Text>
        <TextInput
          style={styles.input}
          placeholder="Username (e.g. FLAT101-ABCD)"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="characters"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <TouchableOpacity style={styles.button} onPress={handleResidentLogin}>
          <Text style={styles.buttonText}>Login as Resident</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.divider}>
        <Text style={styles.dividerText}>OR</Text>
      </View>

      <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={() => router.push('/admin/auth')}>
        <Text style={[styles.buttonText, styles.secondaryButtonText]}>Register/Login as Society Admin</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 40,
    color: '#333',
  },
  card: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 20,
    color: '#444',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerText: {
    color: '#888',
    fontWeight: '500',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  secondaryButtonText: {
    color: '#007AFF',
  },
});
