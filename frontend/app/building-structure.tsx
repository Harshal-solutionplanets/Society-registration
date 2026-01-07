import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

export default function Structure() {
  const router = useRouter();
  const [structure, setStructure] = useState({ flats: '', shops: '', offices: '' });

  const handleNext = () => {
    router.push({ pathname: '/units', params: { flats: structure.flats } });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Structure Details</Text>
      <TextInput placeholder="Number of Flats" keyboardType="number-pad" style={styles.input}
        onChangeText={(text) => setStructure({ ...structure, flats: text })} />
      <TextInput placeholder="Shops" keyboardType="number-pad" style={styles.input}
        onChangeText={(text) => setStructure({ ...structure, shops: text })} />
      <TextInput placeholder="Offices" keyboardType="number-pad" style={styles.input}
        onChangeText={(text) => setStructure({ ...structure, offices: text })} />
      <Button title="Next" onPress={handleNext} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  heading: { fontSize: 22, fontWeight: 'bold', marginBottom: 20 },
  input: { borderWidth: 1, marginBottom: 12, borderRadius: 6, padding: 10 },
});
