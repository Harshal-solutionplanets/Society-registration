import { appId, db } from '@/configs/firebaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateProfile, User } from 'firebase/auth';
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';

/**
 * Finds a society's adminUID by its name (case-insensitive)
 */
export const findSocietyByName = async (societyName: string): Promise<string | null> => {
  try {
    const societiesRef = collection(db, `artifacts/${appId}/public/data/societies`);
    const snapshot = await getDocs(societiesRef);
    
    // Case-insensitive search through all societies
    const societyDoc = snapshot.docs.find(d => 
      d.data().societyName?.toLowerCase() === societyName.toLowerCase()
    );
    
    return societyDoc ? societyDoc.id : null;
  } catch (error) {
    console.error("Error finding society:", error);
    return null;
  }
};

/**
 * Authenticates a resident using the 'Society-First' strategy
 */
export const mockResidentSignIn = async (
  societyName: string, 
  wing: string, 
  unitNumber: string, 
  username: string, 
  password: string
): Promise<{ unit: any, adminUID: string }> => {
  try {
    // 1. Find the Society first (Standard collection query)
    const adminUID = await findSocietyByName(societyName);
    if (!adminUID) throw new Error(`Society "${societyName}" not found.`);

    // 2. Search the Residents collection under this specific society
    const residentsRef = collection(db, `artifacts/${appId}/public/data/societies/${adminUID}/Residents`);
    
    const q = query(residentsRef, 
      where("wingName", "==", wing),
      where("unitName", "==", unitNumber),
      where("username", "==", username),
      where("password", "==", password)
    );

    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      const docSnap = querySnapshot.docs[0];
      const unitData = docSnap.data();
      
      const sessionData = { ...unitData, adminUID };
      await AsyncStorage.setItem('resident_session', JSON.stringify(sessionData));
      
      return { unit: unitData, adminUID };
    } else {
      throw new Error('Invalid credentials for this unit.');
    }
  } catch (error: any) {
    console.error('Resident Auth Error:', error);
    throw error;
  }
};

/**
 * Links the authenticated resident to the Firebase User profile
 */
export const linkResidentToUser = async (user: User, unit: any, adminUID: string) => {
    await updateProfile(user, { 
        displayName: 'Resident', 
        photoURL: unit.unitName || 'Resident'
    });

    const unitId = unit.id;
    const residentPath = `artifacts/${appId}/public/data/societies/${adminUID}/Residents/${unitId}`;
    const societyWingPath = `artifacts/${appId}/public/data/societies/${adminUID}/wings/${unit.wingId}/${unit.floorNumber}/${unitId}`;
    
    const updatePayload = { ...unit, residentUID: user.uid, updatedAt: new Date().toISOString() };
    
    await setDoc(doc(db, residentPath), updatePayload, { merge: true });
    await setDoc(doc(db, societyWingPath), updatePayload, { merge: true });

    await AsyncStorage.setItem('resident_session', JSON.stringify({ ...updatePayload, adminUID }));
};
