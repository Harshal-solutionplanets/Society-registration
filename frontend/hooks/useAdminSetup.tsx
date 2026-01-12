// Path: /artifacts/{appId}/public/data/societies/{adminUserId}
import { doc, setDoc } from "firebase/firestore";
import { appId, db } from "../configs/firebaseConfig";

interface SocietyData {
  societyName: string;
  adminUserId: string;
  unitCount: number;
  driveEmail: string;
  driveFolderId: string;
  createdAt: string;
}

export const registerSociety = async (uid: string, societyData: SocietyData) => {
  try {
    const societyRef = doc(db, `artifacts/${appId}/public/data/societies`, uid);
    await setDoc(societyRef, {
      ...societyData,
      createdAt: new Date().toISOString(),
      role: 'ADMIN'
    });
    return { success: true };
  } catch (error) {
    console.error("Setup Error:", error);
    return { success: false, error };
  }
};