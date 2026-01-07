import { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

export default function SocietyProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState({
    address: '',
    city: '',
    state: '',
    pincode: '',
    landmark: '',
  });

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Society Profile</Text>
      <TextInput placeholder="Address" style={styles.input} onChangeText={(val) => setProfile({ ...profile, address: val })} />
      <TextInput placeholder="City" style={styles.input} onChangeText={(val) => setProfile({ ...profile, city: val })} />
      <TextInput placeholder="State" style={styles.input} onChangeText={(val) => setProfile({ ...profile, state: val })} />
      <TextInput placeholder="Pincode" style={styles.input} keyboardType="number-pad" onChangeText={(val) => setProfile({ ...profile, pincode: val })} />
      <TextInput placeholder="Landmark (optional)" style={styles.input} onChangeText={(val) => setProfile({ ...profile, landmark: val })} />
      <Button title="Next" onPress={() => router.push('/committee-members')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  heading: { fontSize: 22, fontWeight: 'bold', marginBottom: 20 },
  input: { borderWidth: 1, padding: 10, borderRadius: 6, marginBottom: 12 },
});
