// screens/staff-details.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  ScrollView,
  StyleSheet,
  Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useRoute } from "@react-navigation/native";

const StaffDetails = () => {
  const [count, setCount] = useState("");
  const [staffList, setStaffList] = useState<any[]>([]);
  const route = useRoute();
  const { familyMembers } = route.params || {};

  const generateFields = () => {
    const n = parseInt(count);
    if (isNaN(n) || n <= 0) return;
    setStaffList(
      Array.from({ length: n }, () => ({
        name: "",
        role: "",
        contact: "",
        address: "",
        native: "",
        comments: "",
        idProof: null,
      }))
    );
  };

  const handleChange = (index: number, field: string, value: string) => {
    const updated = [...staffList];
    updated[index][field] = value;
    setStaffList(updated);
  };

  const pickImage = async (index: number) => {
    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      alert("Permission is required to access camera roll!");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [4, 3],
      base64: false,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      const updated = [...staffList];
      updated[index].idProof = result.assets[0].uri;
      setStaffList(updated);
    }
  };

  const handleSubmit = () => {
    const allData = {
      familyMembers: familyMembers || [],
      staff: staffList,
    };
    console.log("Final Submission Data:", allData);
    alert("Data saved successfully!");
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.label}>Enter Number of Maids/Cooks/Staff:</Text>
      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        value={count}
        onChangeText={setCount}
      />
      <Button title="Generate Fields" onPress={generateFields} />

      {staffList.map((staff, index) => (
        <View key={index} style={styles.block}>
          <Text style={styles.label}>Staff {index + 1}</Text>
          <TextInput
            placeholder="Name"
            style={styles.input}
            value={staff.name}
            onChangeText={(text) => handleChange(index, "name", text)}
          />
          <TextInput
            placeholder="Role (e.g. Maid, Cook)"
            style={styles.input}
            value={staff.role}
            onChangeText={(text) => handleChange(index, "role", text)}
          />
          <TextInput
            placeholder="Contact"
            style={styles.input}
            value={staff.contact}
            onChangeText={(text) => handleChange(index, "contact", text)}
          />
          <TextInput
            placeholder="Address"
            style={styles.input}
            value={staff.address}
            onChangeText={(text) => handleChange(index, "address", text)}
          />
          <TextInput
            placeholder="Native"
            style={styles.input}
            value={staff.native}
            onChangeText={(text) => handleChange(index, "native", text)}
          />
          <TextInput
            placeholder="Commmets"
            style={styles.input}
            value={staff.comments}
            onChangeText={(text) => handleChange(index, "comments", text)}
          />
          <Button title="Upload ID Proof" onPress={() => pickImage(index)} />
          {staff.idProof && (
            <Image source={{ uri: staff.idProof }} style={styles.image} />
          )}
        </View>
      ))}

      {staffList.length > 0 && <Button title="Submit" onPress={handleSubmit} />}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: 20 },
  label: { fontSize: 16, marginVertical: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    borderRadius: 6,
    marginBottom: 10,
  },
  block: {
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 15,
    marginVertical: 10,
    borderRadius: 8,
  },
  image: { width: 100, height: 100, marginTop: 10 },
});

export default StaffDetails;
