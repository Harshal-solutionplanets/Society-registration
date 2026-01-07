// screens/family-members.tsx
import React, { useState } from 'react';
import { View, Text, TextInput, Button, ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';

const FamilyMembers = () => {
  const [count, setCount] = useState('');
  const [members, setMembers] = useState<any[]>([]);
  const navigation = useNavigation();

  const generateFields = () => {
    const n = parseInt(count);
    if (isNaN(n) || n <= 0) return;
    setMembers(Array.from({ length: n }, () => ({ name: '', age: '', relation: '' })));
  };

  const handleChange = (index: number, key: string, value: string) => {
    const updated = [...members];
    updated[index][key] = value;
    setMembers(updated);
  };

  const handleNext = () => {
    navigation.navigate('staff-details', { familyMembers: members });
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.label}>Enter Number of Family Members:</Text>
      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        value={count}
        onChangeText={setCount}
      />
      <Button title="Generate Fields" onPress={generateFields} />

      {members.map((member, index) => (
        <View key={index} style={styles.block}>
          <Text style={styles.label}>Member {index + 1}</Text>
          <TextInput
            placeholder="Name"
            style={styles.input}
            value={member.name}
            onChangeText={(text) => handleChange(index, 'name', text)}
          />
          <TextInput
            placeholder="Age"
            style={styles.input}
            keyboardType="number-pad"
            value={member.age}
            onChangeText={(text) => handleChange(index, 'age', text)}
          />
          <TextInput
            placeholder="Relation"
            style={styles.input}
            value={member.relation}
            onChangeText={(text) => handleChange(index, 'relation', text)}
          />
        </View>
      ))}

      {members.length > 0 && (
        <Button title="Next: Add Staff Details" onPress={handleNext} />
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: 20 },
  label: { fontSize: 16, marginVertical: 6 },
  input: {
    borderWidth: 1, borderColor: '#ccc', padding: 10, borderRadius: 6, marginBottom: 10
  },
  block: {
    borderWidth: 1, borderColor: '#ddd', padding: 15, marginVertical: 10, borderRadius: 8
  },
});

export default FamilyMembers;
