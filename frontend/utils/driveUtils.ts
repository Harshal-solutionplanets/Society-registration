export const setFolderPublic = async (folderId: string, token: string) => {
  try {
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${folderId}/permissions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role: "reader",
          type: "anyone",
        }),
      },
    );
  } catch (e) {
    console.warn("Could not set folder permissions:", e);
  }
};

export const findOrCreateFolder = async (
  name: string,
  parentId: string,
  token: string,
  forceCreate: boolean = false,
) => {
  try {
    if (!forceCreate) {
      const q = `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and trashed=false`;
      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.files && searchData.files.length > 0) {
          return searchData.files[0].id;
        }
      }
    }

    // Create if not found or forceCreate is true
    const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.json();
      throw new Error(
        "Drive Create Failed: " + (err.error?.message || "Unknown"),
      );
    }

    const createData = await createRes.json();
    const folderId = createData.id;
    await setFolderPublic(folderId, token);
    return folderId;
  } catch (error) {
    console.error(`Error in findOrCreateFolder for ${name}:`, error);
    throw error;
  }
};

export const checkDriveItemExists = async (itemId: string, token: string) => {
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${itemId}?fields=id,trashed`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return false;
    const data = await res.json();
    return !data.trashed;
  } catch (e) {
    return false;
  }
};

export const uploadImageToDrive = async (
  base64String: string,
  fileName: string,
  parentId: string,
  token: string,
) => {
  try {
    const mimeMatch = base64String.match(/^data:(.*);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const cleanBase64 = base64String.replace(/^data:(.*);base64,/, "");

    const boundary = "foo_bar_baz";
    const metadata = { name: fileName, parents: [parentId] };
    const url =
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";

    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) +
      `\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n` +
      `Content-Transfer-Encoding: base64\r\n\r\n` +
      cleanBase64 +
      `\r\n--${boundary}--`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: body,
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error("Upload Failed: " + (err.error?.message || "Unknown"));
    }

    const data = await res.json();
    return data.id;
  } catch (error) {
    console.error("DEBUG: uploadImageToDrive error", error);
    throw error;
  }
};

export const deleteFileFromDrive = async (
  fileName: string,
  folderId: string,
  token: string,
) => {
  try {
    const q = `name = '${fileName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed = false`;
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!searchRes.ok) return;
    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
      for (const file of searchData.files) {
        await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    }
  } catch (error) {
    console.warn("DEBUG: deleteFileFromDrive error (non-critical):", error);
  }
};

export const listFilesInFolder = async (folderId: string, token: string) => {
  try {
    const q = `'${folderId}' in parents and trashed = false`;
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.files || [];
  } catch (e) {
    console.error("DEBUG: listFilesInFolder error", e);
    return [];
  }
};
