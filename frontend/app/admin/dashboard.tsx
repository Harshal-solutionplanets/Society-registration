import { appId, db } from '@/configs/firebaseConfig';
import { useAuth } from '@/hooks/useAuth';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  collection,
  doc,
  getDoc,
  getDocs
} from 'firebase/firestore';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

interface Wing {
  id: string;
  name: string;
  floorCount: number;
  floors: any[];
  driveFolderId?: string;
}

interface Unit {
  id: string;
  unitName: string;
  wingName: string;
  floorNumber: number;
  flatNumber: number;
  residentName: string;
  residentUsername: string;
  residentPassword: string;
  status: string;
  [key: string]: any;
}

export default function AdminDashboard() {
  const router = useRouter();
  const { user, isLoading: authLoading, signOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const [societyData, setSocietyData] = useState<any>(null);
  const [wings, setWings] = useState<Wing[]>([]);

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const societyPath = `artifacts/${appId}/public/data/societies`;
      const societyDoc = await getDoc(doc(db, societyPath, user.uid));
      
      if (societyDoc.exists()) {
        const data = societyDoc.data();
        setSocietyData(data);
        
        const wingsRef = collection(db, `${societyPath}/${user.uid}/wings`);
        const wingsSnapshot = await getDocs(wingsRef);
        const fetchedWings = wingsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Wing[];
        setWings(fetchedWings);
      } else {
        router.replace('/admin/setup');
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && user) {
        fetchData();
      } else if (!authLoading && !user) {
        router.replace('/admin/auth');
      }
    }, [user, authLoading, fetchData])
  );

  const handleWingPress = (wingIndex: number) => {
    const existingWing = wings.find(w => w.id === `wing_${wingIndex}`);
    router.push({
      pathname: '/admin/wing-setup',
      params: { 
        wingIndex, 
        wingId: existingWing?.id || `wing_${wingIndex}`,
        wingName: existingWing?.name || `Wing ${String.fromCharCode(65 + wingIndex)}`
      }
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  const wingCount = societyData?.wingCount || 0;
  const wingBlocks = Array.from({ length: wingCount }, (_, i) => i);
  
  // Calculate total units from all configured wings
  const totalCalculatedUnits = wings.reduce((total, wing) => {
    const wingFlats = wing.floors?.reduce((sum, floor) => sum + (floor.flatCount || 0), 0) || 0;
    return total + wingFlats;
  }, 0);

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="dark-content" />
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.headerCard}>
          <View style={styles.headerLeft}>
            <Text style={styles.societyName}>{societyData?.societyName || 'Admin Hub'}</Text>
            <Text style={styles.welcomeText}>Welcome Admin</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity 
              style={styles.committeeHeaderBtn} 
              onPress={() => router.push('/admin/committee-members')}
            >
              <Text style={styles.committeeHeaderText}>Committee</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.logoutBtn} onPress={signOut}>
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{wingCount}</Text>
            <Text style={styles.statLabel}>Wings/Blocks</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{totalCalculatedUnits}</Text>
            <Text style={styles.statLabel}>Total Units</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Configure Wings</Text>
        <View style={styles.wingsGrid}>
          {wingBlocks.map((index) => {
            const wingInfo = wings.find(w => w.id === `wing_${index}`);
            return (
              <TouchableOpacity 
                key={index} 
                style={[styles.wingCard, wingInfo && styles.wingCardConfigured]}
                onPress={() => handleWingPress(index)}
              >
                <View style={styles.wingCardContent}>
                  <Text style={styles.wingLetter}>
                    {wingInfo?.name ? wingInfo.name.charAt(0).toUpperCase() : String.fromCharCode(65 + index)}
                  </Text>
                  <Text style={styles.wingName}>
                    {wingInfo?.name || `Wing ${String.fromCharCode(65 + index)}`}
                  </Text>
                  <View style={[styles.badge, wingInfo ? styles.badgeSuccess : styles.badgeWarning]}>
                    <Text style={styles.badgeText}>{wingInfo ? 'Configured' : 'Pending'}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Quick Guide</Text>
          <Text style={styles.infoText}>
            • Click on a wing to set up its floors and flats.{"\n"}
            • Once configured, you can manage individual floor details.{"\n"}
            • Use the Committee button to manage society members.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  headerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
    marginBottom: 24,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  societyName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  welcomeText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  committeeHeaderBtn: {
    backgroundColor: '#F0F7FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  committeeHeaderText: {
    color: '#3B82F6',
    fontWeight: '700',
    fontSize: 13,
  },
  logoutBtn: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  logoutText: {
    color: '#EF4444',
    fontWeight: '700',
    fontSize: 13,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#3B82F6',
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 16,
    marginLeft: 4,
  },
  wingsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  wingCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
  },
  wingCardConfigured: {
    borderStyle: 'solid',
    borderLeftWidth: 6,
    borderLeftColor: '#3B82F6',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  wingCardContent: {
    alignItems: 'center',
  },
  wingLetter: {
    fontSize: 32,
    fontWeight: '800',
    color: '#CBD5E1',
  },
  wingName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#475569',
    marginTop: 4,
  },
  badge: {
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeSuccess: {
    backgroundColor: '#DCFCE7',
  },
  badgeWarning: {
    backgroundColor: '#FEF3C7',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  infoBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 8,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 10,
  },
  infoText: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 20,
  },
});
