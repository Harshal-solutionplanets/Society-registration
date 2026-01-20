import { appId, db } from "@/configs/firebaseConfig";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { updateProfile, User } from "firebase/auth";
import {
  collection,
  collectionGroup,
  doc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";

/**
 * Finds a society's adminUID by its name (case-insensitive)
 */
export const findSocietyByName = async (
  societyName: string,
): Promise<string | null> => {
  try {
    const societiesRef = collection(
      db,
      `artifacts/${appId}/public/data/societies`,
    );
    const snapshot = await getDocs(societiesRef);

    // Case-insensitive search through all societies
    const societyDoc = snapshot.docs.find(
      (d) => d.data().societyName?.toLowerCase() === societyName.toLowerCase(),
    );

    return societyDoc ? societyDoc.id : null;
  } catch (error) {
    console.error("Error finding society:", error);
    return null;
  }
};

/**
 * Authenticates a resident using only Username and Password across all societies
 */
export const mockResidentSignIn = async (
  username: string,
  password: string,
): Promise<{ unit: any; adminUID: string }> => {
  try {
    // Search across all 'Residents' subcollections using collectionGroup
    // This requires a Firestore index for 'username' and 'password'
    const residentsRef = collectionGroup(db, "Residents");

    const q = query(
      residentsRef,
      where("username", "==", username),
      where("password", "==", password),
    );

    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      const docSnap = querySnapshot.docs[0];
      const unitData = docSnap.data() as any;

      // Extract adminUID from the path: artifacts/{appId}/public/data/societies/{adminUID}/Residents/{unitId}
      const pathSegments = docSnap.ref.path.split("/");
      const adminUID = pathSegments[5]; // The 6th segment is the adminUID

      const sessionData = { ...unitData, adminUID };
      await AsyncStorage.setItem(
        "resident_session",
        JSON.stringify(sessionData),
      );

      return { unit: unitData, adminUID };
    } else {
      throw new Error("Invalid username or password.");
    }
  } catch (error: any) {
    console.error("Resident Auth Error:", error);
    // If it's a permission error, it's likely because collectionGroup requires an index or specific rules
    if (error.code === "permission-denied") {
      throw new Error(
        "Login service temporarily unavailable. Please try again later.",
      );
    }
    throw error;
  }
};

/**
 * Links the authenticated resident to the Firebase User profile
 */
export const linkResidentToUser = async (
  user: User,
  unit: any,
  adminUID: string,
) => {
  // 1. Update Auth Profile (Critical for appState logic)
  await updateProfile(user, {
    displayName: "Resident",
    photoURL: unit.unitName || "Resident",
  });

  // 2. Update AsyncStorage (Critical for Dashboard data)
  const updatePayload = {
    ...unit,
    residentUID: user.uid,
    updatedAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(
    "resident_session",
    JSON.stringify({ ...updatePayload, adminUID }),
  );

  // 3. Update Firestore (Linking - Best effort)
  try {
    const unitId = unit.id;
    const residentPath = `artifacts/${appId}/public/data/societies/${adminUID}/Residents/${unitId}`;
    const societyWingPath = `artifacts/${appId}/public/data/societies/${adminUID}/wings/${unit.wingId}/${unit.floorNumber}/${unitId}`;

    await setDoc(doc(db, residentPath), updatePayload, { merge: true });
    await setDoc(doc(db, societyWingPath), updatePayload, { merge: true });
  } catch (error) {
    console.warn(
      "Firestore linking failed (likely permissions), but local session is active:",
      error,
    );
    // We don't throw here to allow the user to proceed to the dashboard
  }
};
