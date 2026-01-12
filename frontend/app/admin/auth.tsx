import { appId, auth, db } from '@/configs/firebaseConfig';
import { useRouter } from 'expo-router';
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';

export default function AdminAuth() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async () => {
    if (!email || !password) {
    Toast.show({ type: 'error', text1: 'Error', text2: 'Missing fields' });
    return;
  }

  setLoading(true);
    try {
      if (isLogin) {
      // 1. SIGN IN
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;

      // 2. CHECK AUTHORIZATION (Is this user in our Firestore?)
      const societyDocRef = doc(db, `artifacts/${appId}/public/data/societies`, uid);
      const societyDoc = await getDoc(societyDocRef);

      if (!societyDoc.exists()) {
        // User exists in Firebase Auth but NOT in our Society Database
        await signOut(auth); // Kick them out
        Toast.show({
          type: 'info',
          text1: 'Not Registered',
          text2: 'Account not found. Please Sign-up first.'
        });
        setIsLogin(false); // Move them to Register tab automatically
        return;
      }
    } else {
      // REGISTRATION FLOW
      if (!email.toLowerCase().endsWith('@gmail.com')) {
         // ... existing domain check ...
         return;
      }
      await createUserWithEmailAndPassword(auth, email, password);
      // useAuth will now see no document and redirect to admin/setup correctly
    }
    } catch (error: any) {
      let msg = error.message;
      if (error.code === 'auth/invalid-email') msg = 'Invalid email address.';
      if (error.code === 'auth/user-not-found') msg = 'No user found with this email.';
      if (error.code === 'auth/wrong-password') msg = 'Incorrect password.';
      if (error.code === 'auth/email-already-in-use') msg = 'Email is already registered.';
      if (error.code === 'auth/weak-password') msg = 'Password should be at least 6 characters.';
      
      Toast.show({
        type: 'error',
        text1: 'Authentication Failed',
        text2: 'Invalid Email or Password'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    // This triggers the "App wants to access your Drive" popup
    provider.addScope('https://www.googleapis.com/auth/drive.file');

    console.log(isLogin ? "Attempting Google Login..." : "Attempting Google Registration...");
    
    try {
      const result = await signInWithPopup(auth, provider);
      
      // Extract the Access Token
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const accessToken = credential?.accessToken;

      if (!accessToken) {
        throw new Error("Failed to obtain Google Drive access token.");
      }

      // Store the token for the Setup page
      if (typeof window !== 'undefined' && window.sessionStorage) {
        sessionStorage.setItem('driveToken', accessToken);
      }

      const user = result.user;

      // Domain check
      if (user.email && !user.email.toLowerCase().endsWith('@gmail.com')) {
        await signOut(auth);
        Toast.show({ type: 'error', text1: 'Invalid Domain' , text2: 'Only @gmail.com accounts are allowed.' });
        return;
      }

      // Authorization Check
      const societyDocRef = doc(db, `artifacts/${appId}/public/data/societies`, user.uid);
      const societyDoc = await getDoc(societyDocRef);

      if (isLogin && !societyDoc.exists()) {
        await signOut(auth);
        Toast.show({
          type: 'info',
          text1: 'Society Not Found',
          text2: 'Please register your society first.'
        });
        setIsLogin(false);
        return;
      }

      Toast.show({
        type: 'success',
        text1: isLogin ? 'Welcome Back!' : 'Account Created!',
        text2: 'Redirecting...'
      });
    } catch (error: any) {
      console.error(error);
      Toast.show({
        type: 'error',
        text1: 'Login Failed',
        text2: error.message
      });
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <Text style={styles.title}>Society Admin</Text>
        <Text style={styles.subtitle}>{isLogin ? 'Login to Manage' : 'Register New Society'}</Text>

        <View style={styles.card}>
          <View style={styles.tabs}>
            <TouchableOpacity 
              style={[styles.tab, isLogin && styles.activeTab]} 
              onPress={() => setIsLogin(true)}
            >
              <Text style={[styles.tabText, isLogin && styles.activeTabText]}>Login</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.tab, !isLogin && styles.activeTab]} 
              onPress={() => setIsLogin(false)}
            >
              <Text style={[styles.tabText, !isLogin && styles.activeTabText]}>Register</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.input}
            placeholder="Email Address"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity 
            style={[styles.button, loading && styles.buttonDisabled]} 
            onPress={handleAuth}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>{isLogin ? 'Login' : 'Register'}</Text>
            )}
          </TouchableOpacity>

          <View style={styles.divider}>
          <Text style={styles.dividerText}>OR</Text>
          </View>

          <TouchableOpacity style={styles.googleButton} onPress={handleGoogleSignIn}>
          <Text style={styles.buttonText}>
            {isLogin ? 'Sign in with Google' : 'Sign up with Google'}
          </Text>
          </TouchableOpacity>
        </View>
        
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Back to Home</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#333',
  },
  subtitle: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 30,
    color: '#666',
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
  tabs: {
    flexDirection: 'row',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 16,
    color: '#888',
  },
  activeTabText: {
    color: '#007AFF',
    fontWeight: '600',
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
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#666',
    fontSize: 16,
  },
  googleButton: {
    backgroundColor: '#4285F4',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  divider: {
    alignItems: 'center',
    marginVertical: 15,
  },
  dividerText: {
    color: '#888',
    fontWeight: '500',
  },
});
