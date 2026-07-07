#!/bin/bash
cat << 'INNER_EOF' > /tmp/new_handleUpload.ts
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast.error("You must be logged in to upload templates.");
      return;
    }

    if (!file || !name) {
      toast.error("Please provide a name and an image.");
      return;
    }

    setLoading(true);

    try {
      // Compress image aggressively to fit in Firestore (target ~90KB)
      const options = {
        maxSizeMB: 0.08, // 80KB
        maxWidthOrHeight: 800,
        useWebWorker: true,
      };
      const compressedFile = await imageCompression(file, options);
      
      const base64data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(compressedFile);
      });
      
      const { width, height } = await new Promise<{width: number, height: number}>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = reject;
        img.src = base64data;
      });

      const newTemplate = {
        userId: user.uid,
        userName: user.displayName || "Anonymous",
        name,
        url: base64data,
        width,
        height,
        box_count: 2,
        createdAt: new Date().toISOString(),
      };
      
      const newDocRef = doc(collection(db, "templates"));
      await setDoc(newDocRef, newTemplate);
      
      toast.success("Template uploaded successfully!");
      onUploadSuccess({ id: newDocRef.id, ...newTemplate });
      onClose();
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, "templates");
    } finally {
      setLoading(false);
    }
  };
INNER_EOF
sed -i -e '/const handleUpload = async (e: React.FormEvent) => {/,/  };/c\' -e "$(cat /tmp/new_handleUpload.ts | sed 's/$/\\/g')" src/components/UploadTemplateModal.tsx
sed -i 's/\\$//' src/components/UploadTemplateModal.tsx
