import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Button,
  StyleSheet,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";

export default function Units() {
  const router = useRouter();
  const { flats } = useLocalSearchParams();
  const numFlats = parseInt(flats as string);
  const [units, setUnits] = useState(
    Array(numFlats)
      .fill(null)
      .map(() => ({ flatNo: "", owner: "", phone: "", email: "" }))
  );

  const handleChange = (i: number, key: string, value: string) => {
    const newUnits = [...units];
    newUnits[i][key] = value;
    setUnits(newUnits);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Flat Details</Text>
      {units.map((unit, i) => (
        <View key={i} style={styles.card}>
          <Text style={styles.subheading}>Flat #{i + 1}</Text>
          <TextInput
            placeholder="Flat No"
            style={styles.input}
            onChangeText={(val) => handleChange(i, "flatNo", val)}
          />
          <TextInput
            placeholder="Owner Name"
            style={styles.input}
            onChangeText={(val) => handleChange(i, "owner", val)}
          />
          <TextInput
            placeholder="Phone"
            style={styles.input}
            onChangeText={(val) => handleChange(i, "phone", val)}
          />
          <TextInput
            placeholder="Email"
            style={styles.input}
            onChangeText={(val) => handleChange(i, "email", val)}
          />
          <Button
            title="Add Family / Staff"
            onPress={() => router.push("/family-members")}
          />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  heading: { fontSize: 22, fontWeight: "bold", marginBottom: 20 },
  card: { marginBottom: 20, borderWidth: 1, padding: 15, borderRadius: 8 },
  input: { borderWidth: 1, padding: 10, marginBottom: 10, borderRadius: 6 },
  subheading: { fontWeight: "bold", marginBottom: 10 },
});
