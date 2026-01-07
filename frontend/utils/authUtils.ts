import { db } from '@/configs/firebaseConfig';
import { COLLECTIONS } from '@/constants/Config';
import { updateProfile, User } from 'firebase/auth';
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';

export const mockResidentSignIn = async (unitUsername: string, unitPassword: string): Promise<{ unit: any, adminUID: string }> => {
  const societiesRef = collection(db, COLLECTIONS.SOCIETIES);
  const societySnapshot = await getDocs(societiesRef);

  for (const societyDoc of societySnapshot.docs) {
    const societyAdminUID = societyDoc.id; // The doc ID is the adminUserId
    const unitsRef = collection(db, `users/${societyAdminUID}/${COLLECTIONS.UNITS}`);
    
    // Query for the matching username
    const q = query(unitsRef, where('residentUsername', '==', unitUsername)); 
    const unitSnapshot = await getDocs(q);

    if (!unitSnapshot.empty) {
      const targetUnit = unitSnapshot.docs[0].data();
      if (targetUnit.residentPassword === unitPassword) { 
        return { unit: targetUnit, adminUID: societyAdminUID };
      }
    }
  }
  throw new Error('Invalid Username or Password.'); 
};

export const linkResidentToUser = async (user: User, unit: any, adminUID: string) => {
    // 1. Update the Firebase User Profile for role check
    // We use a fake email to satisfy Firebase requirements if we were using email auth, 
    // but here we are just updating the profile for our local checks.
    await updateProfile(user, { 
        displayName: 'Resident', 
        photoURL: unit.unitName // Storing unit name in photoURL for easy access if needed
    });

    // 2. Link the current user's UID to the unit document
    // Note: The path must match where we found it.
    // We found it at `users/${adminUID}/units/${unitDocId}`
    // We need to reconstruct the ID or pass it.
    // In the mockSignIn, we didn't return the ID. Let's assume unitName is the key or we can query again.
    // The guide says: `doc(unitsRef, unit.unitName.replace(/\s/g, '-'))`
    const unitDocId = unit.unitName.replace(/\s/g, '-');
    const unitDocRef = doc(db, `users/${adminUID}/${COLLECTIONS.UNITS}`, unitDocId);
    
    await setDoc(unitDocRef, { ...unit, residentUID: user.uid }, { merge: true });
};
