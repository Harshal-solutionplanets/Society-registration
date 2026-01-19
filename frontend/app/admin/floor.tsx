import { appId, db } from '@/configs/firebaseConfig';
import { useAuth } from '@/hooks/useAuth';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import Toast from 'react-native-toast-message';

interface FlatData {
  flatNumber: number;
  unitName: string;
  hasCredentials: boolean;
  residenceType: string;
  residentName: string;
  residentMobile: string;
  status: 'VACANT' | 'OCCUPIED';
  familyMembers: string;
  username?: string;
  password?: string;
  driveFolderId?: string;
}

const RESIDENCE_TYPES = [
  'Residence',
  'Shop',
  'Godown',
  'Office',
  'Warehouse',
  'Studio',
  'Penthouse'
];

export default function FloorDetail() {
  const { wingId, wingName, floorNumber, flatCount } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  
  const [flats, setFlats] = useState<FlatData[]>(() => {
    // Generate flat numbers based on flatCount
    const numFlats = parseInt(flatCount as string) || 0;
    const floor = parseInt(floorNumber as string);
    const generatedFlats: FlatData[] = [];
    
    for (let i = 1; i <= numFlats; i++) {
      const flatNum = floor * 100 + i;
      generatedFlats.push({
        flatNumber: flatNum,
        unitName: flatNum.toString(),
        hasCredentials: false,
        residenceType: 'Residence',
        residentName: '',
        residentMobile: '',
        status: 'VACANT',
        familyMembers: ''
      });
    }
    
    return generatedFlats;
  });
  
  const [selectedFlat, setSelectedFlat] = useState<FlatData | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [generating, setGenerating] = useState<number | null>(null);
  
  // Edit modal states
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingFlat, setEditingFlat] = useState<FlatData | null>(null);
  const [editUnitName, setEditUnitName] = useState('');
  const [editResidenceType, setEditResidenceType] = useState('');
  const [editResidentName, setEditResidentName] = useState('');
  const [editResidentMobile, setEditResidentMobile] = useState('');
  const [editStatus, setEditStatus] = useState<'VACANT' | 'OCCUPIED'>('VACANT');
  const [editFamilyMembers, setEditFamilyMembers] = useState('');
  const [showResidenceDropdown, setShowResidenceDropdown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [floorFolderId, setFloorFolderId] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchFlats(), fetchFloorFolderId()]);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFloorFolderId = async () => {
    if (!user) return;
    try {
      const wingPath = `artifacts/${appId}/public/data/societies/${user.uid}/wings/${wingId}`;
      const wingDoc = await getDoc(doc(db, wingPath));
      if (wingDoc.exists()) {
        const data = wingDoc.data();
        const floor = data.floors?.find((f: any) => f.floorNumber === parseInt(floorNumber as string));
        if (floor?.driveFolderId) {
          setFloorFolderId(floor.driveFolderId);
        }
      }
    } catch (error) {
      console.error("Error fetching floor folder ID:", error);
    }
  };

  const fetchFlats = async () => {
    if (!user) return;
    try {
      const societyPath = `artifacts/${appId}/public/data/societies/${user.uid}/wings/${wingId}/${floorNumber}`;
      const querySnapshot = await getDocs(collection(db, societyPath));
      
      const dbFlatsMap: Record<number, any> = {};
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // Extract flat number from ID (e.g., WINGA-1-101 -> 101)
        const parts = data.id.split('-');
        const flatNum = parseInt(parts[parts.length - 1]);
        if (!isNaN(flatNum)) {
          dbFlatsMap[flatNum] = data;
        }
      });

      setFlats(prev => prev.map(flat => {
        const dbFlat = dbFlatsMap[flat.flatNumber];
        if (dbFlat) {
          return {
            ...flat,
            unitName: dbFlat.unitName || flat.unitName,
            residenceType: dbFlat.residenceType || flat.residenceType,
            residentName: dbFlat.residentName || '',
            residentMobile: dbFlat.residentMobile || '',
            status: dbFlat.status || 'VACANT',
            familyMembers: dbFlat.familyMembers || '',
            hasCredentials: !!dbFlat.residentUsername,
            username: dbFlat.residentUsername,
            password: dbFlat.residentPassword,
            driveFolderId: dbFlat.driveFolderId || ''
          };
        }
        return flat;
      }));
    } catch (error) {
      console.error("Error fetching flats:", error);
    } finally {
      setLoading(false);
    }
  };

  const generatePassword = (length: number): string => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };

  const handleGenerateCredentials = async (flatNumber: number) => {
    if (!user) return;
    
    setGenerating(flatNumber);
    
    try {
      const wingPrefix = (wingName as string).replace(/\s+/g, '').toUpperCase();
      const username = `${wingPrefix}${flatNumber}`.toUpperCase();
      const password = generatePassword(6);
      
      // Create unit ID
      const floor = parseInt(floorNumber as string);
      const unitId = `${wingPrefix}-${floor}-${flatNumber}`;
      
      // Get the flat data to access residence type
      const flatData = flats.find(f => f.flatNumber === flatNumber);
      const unitName = flatData?.unitName || flatNumber.toString();

      // 0. Ensure Flat Folder exists in Drive if not already set
      let flatFolderId = flatData?.driveFolderId;
      const token = typeof window !== 'undefined' ? sessionStorage.getItem('driveToken') : null;
      
      if (!flatFolderId && floorFolderId && token) {
        try {
          const response = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: unitName,
              mimeType: 'application/vnd.google-apps.folder',
              parents: [floorFolderId],
            }),
          });
          if (response.ok) {
            const data = await response.json();
            flatFolderId = data.id;
          }
        } catch (err) {
          console.error("Error creating flat folder on demand:", err);
        }
      }
      
      // Save to Firestore (Stable Hierarchical Path using unitId)
      // Using unitId as the document ID ensures we overwrite the same record even if unitName changes
      const societyPath = `artifacts/${appId}/public/data/societies/${user.uid}/wings/${wingId}/${floorNumber}/${unitId}`;
      
      const flatPayload = {
        id: unitId,
        unitName: unitName, // Combined field
        displayName: `${wingName} - ${unitName}`,
        wingId: wingId,
        wingName: wingName,
        floorNumber: floor,
        residenceType: flatData?.residenceType || 'Residence',
        residentName: flatData?.residentName || '',
        residentMobile: flatData?.residentMobile || '',
        status: flatData?.status || 'VACANT',
        familyMembers: flatData?.familyMembers || '',
        residentUsername: username,
        residentPassword: password,
        driveFolderId: flatFolderId || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Save to both locations for compatibility
      const unitPath = `artifacts/${appId}/users/${user.uid}/units/${unitId}`;
      await setDoc(doc(db, unitPath), flatPayload, { merge: true });
      await setDoc(doc(db, societyPath), flatPayload, { merge: true });
      
      // Update local state
      setFlats(prev => prev.map(flat => 
        flat.flatNumber === flatNumber 
          ? { ...flat, hasCredentials: true, username, password }
          : flat
      ));
      
      Toast.show({
        type: 'success',
        text1: 'Credentials Generated',
        text2: `Unit ${flatNumber} credentials created`
      });
    } catch (error: any) {
      console.error('Error generating credentials:', error);
      Alert.alert('Error', error.message || 'Failed to generate credentials');
    } finally {
      setGenerating(null);
    }
  };

  const handleViewCredentials = (flat: FlatData) => {
    setSelectedFlat(flat);
    setModalVisible(true);
  };

  const handleCopyCredentials = () => {
    if (!selectedFlat) return;
    
    const credentialsText = `Society Name: Blue Sky\nWing/Block: ${wingName}\nUnit Number/Name: ${selectedFlat.unitName}\nUsername: ${selectedFlat.username}\nPassword: ${selectedFlat.password}`;
    
    Clipboard.setString(credentialsText);
    
    Toast.show({
      type: 'success',
      text1: 'Copied!',
      text2: 'Credentials copied to clipboard'
    });
  };

  const handleEditFlat = (flat: FlatData) => {
    setEditingFlat(flat);
    setEditUnitName(flat.unitName);
    setEditResidenceType(flat.residenceType);
    setEditResidentName(flat.residentName);
    setEditResidentMobile(flat.residentMobile);
    setEditStatus(flat.status);
    setEditFamilyMembers(flat.familyMembers);
    setEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!editingFlat || !user) return;
    
    // Update local state
    setFlats(prev => prev.map(flat =>
      flat.flatNumber === editingFlat.flatNumber
        ? { 
            ...flat, 
            unitName: editUnitName, 
            residenceType: editResidenceType, 
            residentName: editResidentName, 
            residentMobile: editResidentMobile,
            status: editStatus,
            familyMembers: editFamilyMembers
          }
        : flat
    ));
    
    // Update Firestore
    try {
      const wingPrefix = (wingName as string).replace(/\s+/g, '').toUpperCase();
      const floor = parseInt(floorNumber as string);
      const unitId = `${wingPrefix}-${floor}-${editingFlat.flatNumber}`;
      
      const updatePayload = {
        unitName: editUnitName,
        displayName: `${wingName} - ${editUnitName}`,
        residenceType: editResidenceType,
        residentName: editResidentName,
        residentMobile: editResidentMobile,
        status: editStatus,
        familyMembers: editFamilyMembers,
        driveFolderId: editingFlat.driveFolderId || '',
        updatedAt: new Date().toISOString()
      };

      // Update both locations (using unitId as stable doc ID)
      const unitPath = `artifacts/${appId}/users/${user.uid}/units/${unitId}`;
      const societyPath = `artifacts/${appId}/public/data/societies/${user.uid}/wings/${wingId}/${floorNumber}/${unitId}`;
      
      await setDoc(doc(db, unitPath), updatePayload, { merge: true });
      await setDoc(doc(db, societyPath), updatePayload, { merge: true });
      
      Toast.show({
        type: 'success',
        text1: 'Updated',
        text2: 'Unit details updated successfully'
      });
    } catch (error) {
      console.error('Error updating unit:', error);
      Alert.alert('Error', 'Failed to update unit details');
    }
    
    setEditModalVisible(false);
    setEditingFlat(null);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{wingName} - Floor {floorNumber}</Text>
        <Text style={styles.subtitle}>{flatCount} Flats</Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading flats...</Text>
        </View>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={styles.flatsGrid}>
            {flats.map((flat) => (
              <View key={flat.flatNumber} style={styles.flatPanel}>
                <View style={styles.flatHeader}>
                  <Text style={styles.flatNumber}>{flat.unitName}</Text>
                  <View style={styles.headerRight}>
                    <TouchableOpacity 
                      style={styles.editIconBtn}
                      onPress={() => handleEditFlat(flat)}
                    >
                      <Text style={styles.editIcon}>✏️</Text>
                    </TouchableOpacity>
                    <View style={[
                      styles.statusBadge, 
                      flat.hasCredentials ? styles.statusGenerated : styles.statusPending
                    ]}>
                      <Text style={styles.statusText}>
                        {flat.hasCredentials ? 'READY' : 'PENDING'}
                      </Text>
                    </View>
                  </View>
                </View>
                
                <View style={styles.residenceTypeContainer}>
                  <Text style={styles.residenceTypeLabel}>Type:</Text>
                  <Text style={styles.residenceTypeValue}>{flat.residenceType}</Text>
                  <View style={[
                    styles.statusIndicator, 
                    flat.status === 'OCCUPIED' ? styles.statusOccupied : styles.statusVacant
                  ]}>
                    <Text style={styles.statusIndicatorText}>{flat.status}</Text>
                  </View>
                </View>

                <View style={styles.residentInfoMini}>
                  <Text style={styles.residentNameMini}>{flat.residentName || 'No Name Set'}</Text>
                  <Text style={styles.residentMobileMini}>{flat.residentMobile || 'No Mobile Set'}</Text>
                  {flat.familyMembers ? (
                    <Text style={styles.familyMini}>👨‍👩‍👧‍👦 {flat.familyMembers} members</Text>
                  ) : null}
                </View>
                
                {flat.hasCredentials ? (
                  <>
                    <View style={styles.credInfo}>
                      <Text style={styles.credLabel}>Username:</Text>
                      <Text style={styles.credValue}>{flat.username}</Text>
                    </View>
                    <TouchableOpacity 
                      style={styles.viewBtn}
                      onPress={() => handleViewCredentials(flat)}
                    >
                      <Text style={styles.viewBtnText}>View Details</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity 
                    style={[styles.generateBtn, generating === flat.flatNumber && styles.disabledBtn]}
                    onPress={() => handleGenerateCredentials(flat.flatNumber)}
                    disabled={generating === flat.flatNumber}
                  >
                    {generating === flat.flatNumber ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.generateBtnText}>Generate Credentials</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {/* Credentials Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Unit Credentials</Text>
            
            {selectedFlat && (
              <View style={styles.credentialsContainer}>
                <View style={styles.credentialRow}>
                  <Text style={styles.credentialLabel}>Unit Number</Text>
                  <Text style={styles.credentialValue}>{selectedFlat.unitName}</Text>
                </View>
                
                <View style={styles.credentialRow}>
                  <Text style={styles.credentialLabel}>Residence Type</Text>
                  <Text style={styles.credentialValue}>{selectedFlat.residenceType}</Text>
                </View>

                <View style={styles.credentialRow}>
                  <Text style={styles.credentialLabel}>Resident Name</Text>
                  <Text style={styles.credentialValue}>{selectedFlat.residentName || 'Not Set'}</Text>
                </View>

                <View style={styles.credentialRow}>
                  <Text style={styles.credentialLabel}>Resident Mobile</Text>
                  <Text style={styles.credentialValue}>{selectedFlat.residentMobile || 'Not Set'}</Text>
                </View>

                <View style={styles.credentialRow}>
                  <Text style={styles.credentialLabel}>Residence Status</Text>
                  <Text style={[
                    styles.credentialValue, 
                    { color: selectedFlat.status === 'OCCUPIED' ? '#34C759' : '#FF9500' }
                  ]}>
                    {selectedFlat.status}
                  </Text>
                </View>

                <View style={styles.credentialRow}>
                  <Text style={styles.credentialLabel}>Family Members</Text>
                  <Text style={styles.credentialValue}>{selectedFlat.familyMembers || '0'}</Text>
                </View>
                
                <View style={styles.credentialRow}>
                  <Text style={styles.credentialLabel}>Username</Text>
                  <View style={styles.credentialValueBox}>
                    <Text style={styles.credentialValue}>{selectedFlat.username}</Text>
                  </View>
                </View>
                
                <View style={styles.credentialRow}>
                  <Text style={styles.credentialLabel}>Password</Text>
                  <View style={styles.credentialValueBox}>
                    <Text style={styles.credentialValue}>{selectedFlat.password}</Text>
                  </View>
                </View>
              </View>
            )}
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={styles.copyBtn} 
                onPress={handleCopyCredentials}
              >
                <Text style={styles.copyBtnText}>📋 Copy Credentials</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.closeBtn} 
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.closeBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Flat Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={editModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Unit Details</Text>
            
            <View style={styles.editForm}>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Unit Number / Name</Text>
                <TextInput
                  style={styles.formInput}
                  value={editUnitName}
                  onChangeText={setEditUnitName}
                  placeholder="e.g. 101, A1, Shop-1"
                />
              </View>
              
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Residence Type</Text>
                <TouchableOpacity
                  style={styles.dropdownButton}
                  onPress={() => setShowResidenceDropdown(!showResidenceDropdown)}
                >
                  <Text style={styles.dropdownButtonText}>{editResidenceType}</Text>
                  <Text style={styles.dropdownArrow}>{showResidenceDropdown ? '▲' : '▼'}</Text>
                </TouchableOpacity>
                
                 {showResidenceDropdown && (
                  <ScrollView style={styles.dropdownList} nestedScrollEnabled={true}>
                    {RESIDENCE_TYPES.map((type) => (
                      <TouchableOpacity
                        key={type}
                        style={[
                          styles.dropdownItem,
                          editResidenceType === type && styles.dropdownItemSelected
                        ]}
                        onPress={() => {
                          setEditResidenceType(type);
                          setShowResidenceDropdown(false);
                        }}
                      >
                        <Text style={[
                          styles.dropdownItemText,
                          editResidenceType === type && styles.dropdownItemTextSelected
                        ]}>
                          {type}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Resident Name</Text>
                <TextInput
                  style={styles.formInput}
                  value={editResidentName}
                  onChangeText={setEditResidentName}
                  placeholder="Enter Name of Flat owner"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Resident Mobile No.</Text>
                <TextInput
                  style={styles.formInput}
                  value={editResidentMobile}
                  onChangeText={setEditResidentMobile}
                  placeholder="Enter Mobile Number"
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Residence Status</Text>
                <View style={styles.statusToggleRow}>
                  <TouchableOpacity 
                    style={[
                      styles.statusToggleBtn, 
                      editStatus === 'VACANT' && styles.statusToggleBtnActive
                    ]}
                    onPress={() => setEditStatus('VACANT')}
                  >
                    <Text style={[
                      styles.statusToggleText,
                      editStatus === 'VACANT' && styles.statusToggleTextActive
                    ]}>Vacant</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[
                      styles.statusToggleBtn, 
                      editStatus === 'OCCUPIED' && styles.statusToggleBtnActive
                    ]}
                    onPress={() => setEditStatus('OCCUPIED')}
                  >
                    <Text style={[
                      styles.statusToggleText,
                      editStatus === 'OCCUPIED' && styles.statusToggleTextActive
                    ]}>Occupied</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Number of Family Members (Including Yourself)</Text>
                <TextInput
                  style={styles.formInput}
                  value={editFamilyMembers}
                  onChangeText={setEditFamilyMembers}
                  placeholder="e.g. 4"
                  keyboardType="numeric"
                />
              </View>
            </View>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={styles.closeBtn} 
                onPress={() => {
                  setEditModalVisible(false);
                  setShowResidenceDropdown(false);
                }}
              >
                <Text style={styles.closeBtnText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.copyBtn} 
                onPress={handleSaveEdit}
              >
                <Text style={styles.copyBtnText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F2F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F0F2F5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
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
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  flatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 10,
  },
  flatPanel: {
    width: '47%',
    backgroundColor: '#fff',
    margin: '1.5%',
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  flatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editIconBtn: {
    padding: 4,
  },
  editIcon: {
    fontSize: 16,
  },
  flatNumber: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  residenceTypeContainer: {
    backgroundColor: '#F8F9FA',
    padding: 8,
    borderRadius: 6,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  residenceTypeLabel: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
    marginRight: 6,
  },
  residenceTypeValue: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '600',
  },
  residentInfoMini: {
    marginBottom: 10,
    padding: 8,
    backgroundColor: '#F0F7FF',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#007AFF',
  },
  residentNameMini: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#333',
  },
  residentMobileMini: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusPending: {
    backgroundColor: '#FFE5B4',
  },
  statusGenerated: {
    backgroundColor: '#D1F2EB',
  },
  statusText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#333',
  },
  credInfo: {
    marginBottom: 10,
  },
  credLabel: {
    fontSize: 11,
    color: '#666',
    marginBottom: 2,
  },
  credValue: {
    fontSize: 13,
    color: '#333',
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  generateBtn: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 5,
  },
  generateBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  viewBtn: {
    backgroundColor: '#34C759',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  viewBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  disabledBtn: {
    opacity: 0.6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    width: '100%',
    maxWidth: 400,
    padding: 25,
    borderRadius: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  credentialsContainer: {
    marginBottom: 25,
  },
  credentialRow: {
    marginBottom: 15,
  },
  credentialLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 5,
    fontWeight: '600',
  },
  credentialValue: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  credentialValueBox: {
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DEE2E6',
  },
  modalButtons: {
    gap: 12,
  },
  copyBtn: {
    backgroundColor: '#34C759',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  copyBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  closeBtn: {
    backgroundColor: '#F1F3F5',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#495057',
    fontSize: 16,
    fontWeight: 'bold',
  },
  editForm: {
    marginBottom: 20,
  },
  formGroup: {
    marginBottom: 15,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  formInput: {
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#DEE2E6',
  },
  dropdownButton: {
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DEE2E6',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownButtonText: {
    fontSize: 16,
    color: '#333',
  },
  dropdownArrow: {
    fontSize: 12,
    color: '#666',
  },
  dropdownList: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DEE2E6',
    marginTop: 5,
    maxHeight: 200,
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F3F5',
  },
  dropdownItemSelected: {
    backgroundColor: '#E7F3FF',
  },
  dropdownItemText: {
    fontSize: 14,
    color: '#333',
  },
  dropdownItemTextSelected: {
    color: '#007AFF',
    fontWeight: '600',
  },
  statusIndicator: {
    marginLeft: 'auto',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusOccupied: {
    backgroundColor: '#34C75920',
    borderWidth: 1,
    borderColor: '#34C759',
  },
  statusVacant: {
    backgroundColor: '#FF950020',
    borderWidth: 1,
    borderColor: '#FF9500',
  },
  statusIndicatorText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#333',
  },
  familyMini: {
    fontSize: 11,
    color: '#007AFF',
    marginTop: 4,
    fontWeight: '500',
  },
  statusToggleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statusToggleBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DEE2E6',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  statusToggleBtnActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  statusToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  statusToggleTextActive: {
    color: '#fff',
  },
});
