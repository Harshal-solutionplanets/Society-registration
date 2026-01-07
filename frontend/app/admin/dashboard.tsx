import { db } from '@/configs/firebaseConfig';
import { COLLECTIONS } from '@/constants/Config';
import { useAuth } from '@/hooks/useAuth';
import { collection, doc, getDoc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface Unit {
  id: string;
  unitName: string;
  residentName: string;
  residentUsername: string;
  residentPassword?: string;
  residentUID: string | null;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [societyData, setSocietyData] = useState<any>(null);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    if (!user) return;
    try {
      // Fetch Society Data
      const societyDoc = await getDoc(doc(db, COLLECTIONS.SOCIETIES, user.uid));
      if (societyDoc.exists()) {
        setSocietyData(societyDoc.data());
      }

      // Fetch Units
      const unitsRef = collection(db, `users/${user.uid}/${COLLECTIONS.UNITS}`);
      const snapshot = await getDocs(unitsRef);
      const fetchedUnits: Unit[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Unit));
      
      // If no units exist yet, we might want to initialize them based on unitCount
      // But for now, let's just show what we have or allow adding.
      // The guide says "Admin enters the Flat No. and Resident/Owner Name for each unit."
      // So we should probably have a form or a list to fill.
      
      setUnits(fetchedUnits);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const generateCredentialsAndSave = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const batch = writeBatch(db);
      const unitsRef = collection(db, `users/${user.uid}/${COLLECTIONS.UNITS}`);
      
      // For this demo, let's assume we are generating for a fixed list or the ones in state.
      // If units are empty, let's create some dummy ones or ask user.
      // Ideally, we'd have a UI to add units.
      // Let's just add a "Add Unit" feature or bulk generate.
      
      // Simplified: Just add one unit for testing if list is empty
      if (units.length === 0) {
         // This is just a fallback for the demo
         Alert.alert('Info', 'No units found. Please add units first.');
         setGenerating(false);
         return;
      }

      // In a real app, we would only update changed ones.
      // Here we just re-save everything (inefficient but simple).
      // Actually, we should only generate for those missing credentials.
      
      // Let's assume the UI allows editing `residentName` and we save it.
      
      Alert.alert('Info', 'Credentials generation not fully implemented in this view. Use "Add Unit" to create single units.');
      
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setGenerating(false);
    }
  };

  const addUnit = async (unitName: string, residentName: string) => {
    if (!user) return;
    if (!unitName || !residentName) return;

    const residentUsername = (unitName.replace(/\s/g, '') + '-' + Math.random().toString(36).substring(2, 6)).toUpperCase();
    const residentPassword = Math.random().toString(36).substring(2, 8);
    const unitId = unitName.replace(/\s/g, '-');

    const newUnit: Unit = {
        id: unitId,
        unitName,
        residentName,
        residentUsername,
        residentPassword,
        residentUID: null
    };

    try {
        await setDoc(doc(db, `users/${user.uid}/${COLLECTIONS.UNITS}`, unitId), newUnit);
        setUnits(prev => [...prev, newUnit]);
        Alert.alert('Success', `Unit added!\nUsername: ${residentUsername}\nPassword: ${residentPassword}`);
    } catch (e: any) {
        Alert.alert('Error', e.message);
    }
  };

  const [newUnitName, setNewUnitName] = useState('');
  const [newResidentName, setNewResidentName] = useState('');

  if (loading) return <ActivityIndicator style={{flex:1}} />;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{societyData?.societyName || 'Admin Dashboard'}</Text>
      <Text style={styles.subtitle}>Manage Units & Credentials</Text>

      <View style={styles.addForm}>
        <TextInput 
            style={styles.input} 
            placeholder="Unit No (e.g. 101)" 
            value={newUnitName}
            onChangeText={setNewUnitName}
        />
        <TextInput 
            style={styles.input} 
            placeholder="Resident Name" 
            value={newResidentName}
            onChangeText={setNewResidentName}
        />
        <TouchableOpacity 
            style={styles.addButton}
            onPress={() => {
                addUnit(newUnitName, newResidentName);
                setNewUnitName('');
                setNewResidentName('');
            }}
        >
            <Text style={styles.buttonText}>Add & Generate</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={units}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View>
                <Text style={styles.unitName}>Unit: {item.unitName}</Text>
                <Text style={styles.residentName}>{item.residentName}</Text>
            </View>
            <View style={styles.credentials}>
                <Text style={styles.credText}>User: {item.residentUsername}</Text>
                <Text style={styles.credText}>Pass: {item.residentPassword}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No units added yet.</Text>}
        ListFooterComponent={
            <TouchableOpacity style={styles.signOutButton} onPress={useAuth().signOut}>
                <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  addForm: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
    gap: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 10,
    borderRadius: 6,
  },
  addButton: {
    backgroundColor: '#28a745',
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  card: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  unitName: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  residentName: {
    color: '#555',
  },
  credentials: {
    alignItems: 'flex-end',
  },
  credText: {
    fontSize: 12,
    color: '#888',
    fontFamily: 'monospace',
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    marginTop: 20,
  },
  signOutButton: {
    marginTop: 30,
    padding: 15,
    backgroundColor: '#ff4444',
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  signOutText: {
    color: 'white',
    fontWeight: 'bold',
  },
});
