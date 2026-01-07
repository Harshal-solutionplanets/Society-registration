import { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';

export default function SocietyRegisterScreen() {
  const router = useRouter();
  const [data, setData] = useState({
    societyName: '',
    type: '',
    regNumber: '',
    secretaryName: '',
    phone: '',
    email: '',
    password: '',
  });

  const handleNext = () => {
    // Save or validate here
    router.push('/society-profile');
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Society Registration</Text>
      <TextInput placeholder="Society Name" style={styles.input} onChangeText={(val) => setData({ ...data, societyName: val })} />
      <TextInput placeholder="Society Type (e.g. Residential)" style={styles.input} onChangeText={(val) => setData({ ...data, type: val })} />
      <TextInput placeholder="Registration Number" style={styles.input} onChangeText={(val) => setData({ ...data, regNumber: val })} />
      <TextInput placeholder="Secretary Name" style={styles.input} onChangeText={(val) => setData({ ...data, secretaryName: val })} />
      <TextInput placeholder="Secretary Phone" style={styles.input} keyboardType="phone-pad" onChangeText={(val) => setData({ ...data, phone: val })} />
      <TextInput placeholder="Email" style={styles.input} keyboardType="email-address" onChangeText={(val) => setData({ ...data, email: val })} />
      <TextInput placeholder="Password" secureTextEntry style={styles.input} onChangeText={(val) => setData({ ...data, password: val })} />
      <Button title="Register" onPress={handleNext} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  heading: { fontSize: 22, fontWeight: 'bold', marginBottom: 20 },
  input: { borderWidth: 1, padding: 10, borderRadius: 6, marginBottom: 12 },
});
