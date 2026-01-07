import { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';

export default function CommitteeMembersScreen() {
  const router = useRouter();
  const [members, setMembers] = useState([
    { post: '', name: '', phone: '', email: '' },
  ]);

  const addMember = () => {
    setMembers([...members, { post: '', name: '', phone: '', email: '' }]);
  };

  const updateMember = (index: number, field: string, value: string) => {
    const updated = [...members];
    updated[index][field] = value;
    setMembers(updated);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Committee Members</Text>
      {members.map((member, index) => (
        <View key={index} style={styles.card}>
          <Text style={styles.subheading}>Member {index + 1}</Text>
          <TextInput placeholder="Post (e.g. Chairman)" style={styles.input} onChangeText={(val) => updateMember(index, 'post', val)} />
          <TextInput placeholder="Name" style={styles.input} onChangeText={(val) => updateMember(index, 'name', val)} />
          <TextInput placeholder="Phone" style={styles.input} keyboardType="phone-pad" onChangeText={(val) => updateMember(index, 'phone', val)} />
          <TextInput placeholder="Email" style={styles.input} keyboardType="email-address" onChangeText={(val) => updateMember(index, 'email', val)} />
        </View>
      ))}
      <Button title="➕ Add Member" onPress={addMember} />
      <View style={{ marginTop: 20 }}>
        <Button title="Next" onPress={() => router.push('/building-structure')} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  heading: { fontSize: 22, fontWeight: 'bold', marginBottom: 20 },
  subheading: { fontSize: 16, fontWeight: '600', marginBottom: 10 },
  card: {
    marginBottom: 20,
    padding: 15,
    borderWidth: 1,
    borderRadius: 8,
    borderColor: '#ccc',
  },
  input: {
    borderWidth: 1,
    padding: 10,
    borderRadius: 6,
    marginBottom: 10,
  },
});
