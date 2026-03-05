import { appId, db } from "@/configs/firebaseConfig";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { Platform } from "react-native";
import {
  checkDriveItemExists,
  findOrCreateFolder,
  listFilesInFolder,
} from "./driveUtils";

/**
 * Ensures a resident's flat folder structure exists on Google Drive.
 * Society -> Wing -> Floor -> Flat
 */
export const ensureUnitDriveStructure = async (residentData: any) => {
  if (!residentData?.adminUID || !residentData?.id) return null;

  try {
    const {
      adminUID,
      wingId,
      floorNumber,
      unitName,
      wingName,
      floorName,
      driveFolderId,
    } = residentData;

    // 1. Get Admin/Society Drive Metadata & Token
    const societyDoc = await getDoc(
      doc(db, `artifacts/${appId}/public/data/societies`, adminUID),
    );
    if (!societyDoc.exists()) return null;

    const societyData = societyDoc.data();
    let token = societyData?.driveAccessToken;
    const rootFolderId = societyData?.driveFolderId;

    if (!rootFolderId) return null;

    // Proactive token refresh if needed
    if (!token) {
      token = await refreshDriveToken(adminUID);
    }

    if (!token) return null;

    // 2. Verify current flat folder
    let currentFlatFolderId = driveFolderId;
    let isFlatValid = false;
    if (currentFlatFolderId) {
      isFlatValid = await checkDriveItemExists(currentFlatFolderId, token);
    }

    if (isFlatValid) return currentFlatFolderId;

    console.log(
      `[DriveHealth] Unit folder ${unitName} missing or invalid. Restoring structure...`,
    );

    // 3. Drill Down and Restore
    // A. Wing Folder
    const wingDoc = await getDoc(
      doc(
        db,
        `artifacts/${appId}/public/data/societies/${adminUID}/wings`,
        wingId,
      ),
    );
    let wingFolderId = wingDoc.data()?.driveFolderId;

    if (!wingFolderId || !(await checkDriveItemExists(wingFolderId, token))) {
      wingFolderId = await findOrCreateFolder(wingName, rootFolderId, token);
      await updateDoc(
        doc(
          db,
          `artifacts/${appId}/public/data/societies/${adminUID}/wings`,
          wingId,
        ),
        { driveFolderId: wingFolderId },
      );
    }

    // B. Floor Folder
    // Floors are usually inside the wings doc as an array, but also have subcollections for units
    // We need to update the wing document's floor array as well
    const floors = wingDoc.data()?.floors || [];
    const floorIdx = floors.findIndex(
      (f: any) => f.floorNumber === floorNumber,
    );
    let floorFolderId = floorIdx !== -1 ? floors[floorIdx].driveFolderId : null;

    if (!floorFolderId || !(await checkDriveItemExists(floorFolderId, token))) {
      floorFolderId = await findOrCreateFolder(
        floorName || `Floor ${floorNumber}`,
        wingFolderId,
        token,
      );
      if (floorIdx !== -1) {
        floors[floorIdx].driveFolderId = floorFolderId;
        await updateDoc(
          doc(
            db,
            `artifacts/${appId}/public/data/societies/${adminUID}/wings`,
            wingId,
          ),
          { floors },
        );
      }
    }

    // C. Flat Folder
    const newFlatFolderId = await findOrCreateFolder(
      unitName,
      floorFolderId,
      token,
    );

    // 4. Update Firestore for this Unit
    const batch = writeBatch(db);
    const unitLocPath = `artifacts/${appId}/public/data/societies/${adminUID}/wings/${wingId}/${floorNumber}/${residentData.id}`;
    const residentProfilePath = `artifacts/${appId}/public/data/societies/${adminUID}/Residents/${residentData.id}`;

    batch.update(doc(db, unitLocPath), { driveFolderId: newFlatFolderId });
    batch.update(doc(db, residentProfilePath), {
      driveFolderId: newFlatFolderId,
    });

    await batch.commit();
    console.log(
      `[DriveHealth] Unit folder ${unitName} restored: ${newFlatFolderId}`,
    );

    return newFlatFolderId;
  } catch (error) {
    console.error("[DriveHealth] Error ensuring unit structure:", error);
    return null;
  }
};

/**
 * Checks if staff folder exists. If not, deletes Firestore records and related audit data.
 */
export const syncStaffWithDrive = async (adminUID: string, token: string) => {
  try {
    let deletedStaffNames = [];

    // 1. Sync Society Staff
    const societyStaffRef = collection(
      db,
      `artifacts/${appId}/public/data/societies/${adminUID}/Staff`,
    );
    const societyStaffSnap = await getDocs(societyStaffRef);
    for (const sDoc of societyStaffSnap.docs) {
      const data = sDoc.data();
      if (
        data.driveFolderId &&
        !(await checkDriveItemExists(data.driveFolderId, token))
      ) {
        console.log(
          `[DriveHealth] Society Staff '${data.name}' folder missing. Deleting...`,
        );
        await cleanupStaffFirestoreData(adminUID, sDoc.id, data, false);
        deletedStaffNames.push(data.name);
      }
    }

    // 2. Sync Resident Staff Registry
    const regStaffRef = collection(
      db,
      `artifacts/${appId}/public/data/societies/${adminUID}/Resident_Staff`,
    );
    const regStaffSnap = await getDocs(regStaffRef);
    for (const rDoc of regStaffSnap.docs) {
      const data = rDoc.data();
      if (
        data.driveFolderId &&
        !(await checkDriveItemExists(data.driveFolderId, token))
      ) {
        console.log(
          `[DriveHealth] Resident Staff '${data.staffName}' folder missing. Deleting...`,
        );
        await cleanupStaffFirestoreData(adminUID, rDoc.id, data, true);
        deletedStaffNames.push(data.staffName);
      }
    }

    return deletedStaffNames;
  } catch (error) {
    console.error("[DriveHealth] Error syncing staff:", error);
    return [];
  }
};

/**
 * Checks if specific staff documents (photo, idCard, addressProof) still exist on Drive.
 * If deleted manually, clears the fields in Firestore.
 */
export const syncStaffDocsWithDrive = async (
  adminUID: string,
  unitId: string,
  staffList: any[],
  token: string,
) => {
  try {
    const batch = writeBatch(db);
    let changeDetected = false;
    let notifications = [];

    for (const staff of staffList) {
      if (!staff.driveFolderId) continue;

      const files = await listFilesInFolder(staff.driveFolderId, token);
      const fileNames = files.map((f: any) => f.name.toLowerCase());

      const docTypes: ("photo" | "idCard" | "addressProof")[] = [
        "photo",
        "idCard",
        "addressProof",
      ];
      let staffChanges = [];

      for (const type of docTypes) {
        if (staff[type]) {
          const baseName =
            type === "photo"
              ? "photo."
              : type === "idCard"
                ? "id_card."
                : "address_proof.";
          const exists = fileNames.some((n: string) => n.startsWith(baseName));

          if (!exists) {
            staffChanges.push(type);
            changeDetected = true;

            const unitStaffRef = doc(
              db,
              `artifacts/${appId}/public/data/societies/${adminUID}/Residents/${unitId}/StaffMembers/${staff.id}`,
            );
            batch.update(unitStaffRef, { [type]: "" });

            if (staff.sourceRegistryId) {
              const registryRef = doc(
                db,
                `artifacts/${appId}/public/data/societies/${adminUID}/Resident_Staff/${staff.sourceRegistryId}`,
              );
              batch.update(registryRef, { [type]: "" });
            }
          }
        }
      }

      if (staffChanges.length > 0) {
        notifications.push({
          type: "DOC_DELETED",
          title: "Document Missing",
          message: `The admin has manually deleted ${staffChanges.join(" and ")} from ${staff.staffName}'s Drive folder. This document is no longer available.`,
        });
      }
    }

    if (changeDetected) {
      await batch.commit();
    }
    return notifications;
  } catch (error) {
    console.warn("[DriveHealth] Error syncing staff docs:", error);
    return [];
  }
};

/**
 * Checks if staff folders still exist for a specific resident.
 * Returns notifications for deleted staff.
 */
export const syncResidentStaffWithDrive = async (
  adminUID: string,
  unitId: string,
  staffList: any[],
  token: string,
) => {
  try {
    let notifications = [];
    for (const staff of staffList) {
      if (staff.driveFolderId) {
        const exists = await checkDriveItemExists(staff.driveFolderId, token);
        if (!exists) {
          console.log(
            `[DriveHealth] Resident Staff '${staff.staffName}' folder missing. Cleaning up...`,
          );
          await cleanupStaffFirestoreData(
            adminUID,
            staff.id,
            staff,
            !!staff.sourceRegistryId,
          );
          notifications.push({
            type: "STAFF_DELETED",
            title: "Profile Removed",
            message: `The admin has manually deleted the Drive folder for ${staff.staffName}. Their profile and related data have been cleared.`,
          });
        }
      }
    }
    return notifications;
  } catch (err) {
    console.error("[DriveHealth] Resident staff sync fail:", err);
    return [];
  }
};

/**
 * Verifies if a registry folder exists.
 */
export const verifyRegistryFolder = async (folderId: string, token: string) => {
  return await checkDriveItemExists(folderId, token);
};

const cleanupStaffFirestoreData = async (
  adminUID: string,
  staffId: string,
  staffData: any,
  isResidentRegistry: boolean,
) => {
  const batch = writeBatch(db);

  if (isResidentRegistry) {
    // 1. Delete from Resident_Staff registry
    batch.delete(
      doc(
        db,
        `artifacts/${appId}/public/data/societies/${adminUID}/Resident_Staff`,
        staffId,
      ),
    );

    // 2. Delete Resident Staff Audit Logs
    const auditLogsRef = collection(
      db,
      `artifacts/${appId}/public/data/societies/${adminUID}/Resident_Staff_Audit/${staffId}/Logs`,
    );
    const logs = await getDocs(auditLogsRef);
    logs.forEach((l) => batch.delete(l.ref));

    // 3. Find and delete this staff member from ANY unit they were linked to
    const residentsRef = collection(
      db,
      `artifacts/${appId}/public/data/societies/${adminUID}/Residents`,
    );
    const residentsSnap = await getDocs(residentsRef);

    for (const resDoc of residentsSnap.docs) {
      const staffMembersColl = collection(
        db,
        resDoc.ref.path + "/StaffMembers",
      );
      const linkedQuery = query(
        staffMembersColl,
        where("sourceRegistryId", "==", staffId),
      );
      const linkedSnap = await getDocs(linkedQuery);

      if (!linkedSnap.empty) {
        linkedSnap.forEach((l) => batch.delete(l.ref));

        // Decrement count in Resident document
        batch.update(resDoc.ref, { staffMembers: increment(-1) });

        // Decrement count in Wing Unit document
        const rData = resDoc.data();
        if (rData.wingId && rData.floorNumber !== undefined) {
          const wingUnitRef = doc(
            db,
            `artifacts/${appId}/public/data/societies/${adminUID}/wings/${rData.wingId}/${rData.floorNumber}/${resDoc.id}`,
          );
          batch.update(wingUnitRef, { staffMembers: increment(-1) });
        }
      }
    }
  } else {
    // 1. Delete Society Staff (Watchman, etc)
    batch.delete(
      doc(
        db,
        `artifacts/${appId}/public/data/societies/${adminUID}/Staff`,
        staffId,
      ),
    );
  }

  await batch.commit();
};

export const refreshDriveToken = async (adminUID: string) => {
  try {
    const isWeb = Platform.OS === "web";
    const backendUrl = isWeb
      ? typeof window !== "undefined"
        ? window.location.origin + "/api"
        : ""
      : process.env.EXPO_PUBLIC_BACKEND_URL ||
        "https://asia-south1-zonect-8d847.cloudfunctions.net/api";

    const res = await fetch(
      `${backendUrl}/auth/google/refresh?adminUID=${adminUID}&appId=${appId}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.accessToken;
  } catch (e) {
    return null;
  }
};
