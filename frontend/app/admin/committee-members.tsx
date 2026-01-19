import { appId, db } from '@/configs/firebaseConfig';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'expo-router';
import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import Toast from 'react-native-toast-message';

interface Wing {
  id: string;
  name: string;
}

interface CommitteeMember {
  id: string;
  name: string;
  post: string;
  phone: string;
  email: string;
  flatNo: string;
  level: string; // 'society' or wingId
}

export default function CommitteeMembers() {
  const router = useRouter();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [wings, setWings] = useState<Wing[]>([]);
  const [selectedLevel, setSelectedLevel] = useState('society');
  const [members, setMembers] = useState<CommitteeMember[]>([]);
  
  // Form state
  const [name, setName] = useState('');
  const [post, setPost] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [flatNo, setFlatNo] = useState('');

  useEffect(() => {
    if (user) {
      fetchInitialData();
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchMembers();
    }
  }, [user, selectedLevel]);

  const fetchInitialData = async () => {
    if (!user) return;
    try {
      const societyPath = `artifacts/${appId}/public/data/societies/${user.uid}`;
      const wingsRef = collection(db, `${societyPath}/wings`);
      const wingsSnapshot = await getDocs(wingsRef);
      const fetchedWings = wingsSnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name
      })) as Wing[];
      setWings(fetchedWings);
    } catch (error) {
      console.error("Error fetching wings:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMembers = async () => {
    if (!user) return;
    try {
      const membersRef = collection(db, `artifacts/${appId}/public/data/societies/${user.uid}/committee_members`);
      const q = query(membersRef, where("level", "==", selectedLevel));
      const snapshot = await getDocs(q);
      const fetchedMembers = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as CommitteeMember[];
      setMembers(fetchedMembers);
    } catch (error) {
      console.error("Error fetching members:", error);
    }
  };

  const handleAddMember = async () => {
    if (!user) return;
    if (!name || !post || !phone || !email || !flatNo) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }

    setSaving(true);
    try {
      const memberId = Date.now().toString();
      const memberData: CommitteeMember = {
        id: memberId,
        name,
        post,
        phone,
        email,
        flatNo,
        level: selectedLevel
      };

      await setDoc(doc(db, `artifacts/${appId}/public/data/societies/${user.uid}/committee_members`, memberId), memberData);
      
      setMembers(prev => [...prev, memberData]);
      
      // Reset form
      setName('');
      setPost('');
      setPhone('');
      setEmail('');
      setFlatNo('');

      Toast.show({
        type: 'success',
        text1: 'Member Added',
        text2: `${name} has been added to the committee.`
      });
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMember = async (id: string) => {
    if (!user) return;
    Alert.alert(
      "Delete Member",
      "Are you sure you want to remove this committee member?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDoc(doc(db, `artifacts/${appId}/public/data/societies/${user.uid}/committee_members`, id));
              setMembers(prev => prev.filter(m => m.id !== id));
              Toast.show({
                type: 'info',
                text1: 'Member Removed'
              });
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Committee Members</Text>
        </View>

        <View style={styles.levelSelector}>
          <Text style={styles.sectionLabel}>Select Level</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollSelector}>
            <TouchableOpacity 
              style={[styles.levelBtn, selectedLevel === 'society' && styles.levelBtnActive]}
              onPress={() => setSelectedLevel('society')}
            >
              <Text style={[styles.levelBtnText, selectedLevel === 'society' && styles.levelBtnTextActive]}>
                Complete Society
              </Text>
            </TouchableOpacity>
            {wings.map(wing => (
              <TouchableOpacity 
                key={wing.id}
                style={[styles.levelBtn, selectedLevel === wing.id && styles.levelBtnActive]}
                onPress={() => setSelectedLevel(wing.id)}
              >
                <Text style={[styles.levelBtnText, selectedLevel === wing.id && styles.levelBtnTextActive]}>
                  {wing.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>Add New Member</Text>
          <TextInput
            style={styles.input}
            placeholder="Name"
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={styles.input}
            placeholder="Post (e.g. Chairman, Secretary)"
            value={post}
            onChangeText={setPost}
          />
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Phone"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Flat No."
              value={flatNo}
              onChangeText={setFlatNo}
            />
          </View>
          <TextInput
            style={styles.input}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TouchableOpacity 
            style={[styles.addBtn, saving && styles.disabledBtn]} 
            onPress={handleAddMember}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.addBtnText}>Add Member</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.listSection}>
          <Text style={styles.sectionTitle}>
            {selectedLevel === 'society' ? 'Society' : 'Wing'} Committee
          </Text>
          {members.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No members added yet for this level.</Text>
            </View>
          ) : (
            members.map(member => (
              <View key={member.id} style={styles.memberCard}>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{member.name}</Text>
                  <Text style={styles.memberPost}>{member.post} • Flat {member.flatNo}</Text>
                  <Text style={styles.memberContact}>{member.phone} • {member.email}</Text>
                </View>
                <TouchableOpacity 
                  style={styles.deleteBtn} 
                  onPress={() => handleDeleteMember(member.id)}
                >
                  <Text style={styles.deleteBtnText}>Remove</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  backBtn: {
    marginBottom: 10,
  },
  backBtnText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  levelSelector: {
    padding: 20,
    backgroundColor: '#fff',
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
  },
  scrollSelector: {
    flexDirection: 'row',
  },
  levelBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F1F3F5',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  levelBtnActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  levelBtnText: {
    color: '#495057',
    fontWeight: '600',
  },
  levelBtnTextActive: {
    color: '#fff',
  },
  formSection: {
    padding: 20,
    backgroundColor: '#fff',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  input: {
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#DEE2E6',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  addBtn: {
    backgroundColor: '#34C759',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 5,
  },
  addBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  disabledBtn: {
    opacity: 0.7,
  },
  listSection: {
    padding: 20,
  },
  memberCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  memberPost: {
    fontSize: 14,
    color: '#007AFF',
    marginTop: 2,
    fontWeight: '500',
  },
  memberContact: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  deleteBtn: {
    padding: 8,
  },
  deleteBtnText: {
    color: '#FF3B30',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#999',
    fontSize: 14,
  },
});
