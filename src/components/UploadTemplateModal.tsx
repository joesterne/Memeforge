import React, { useState } from "react";
import { X, Upload, Loader2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../lib/firebase";
import { collection, doc, setDoc } from "firebase/firestore";
import { toast } from "sonner";
import imageCompression from "browser-image-compression";

interface UploadTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (template: any) => void;
}

export default function UploadTemplateModal({
  isOpen,
  onClose,
  onUploadSuccess,
}: UploadTemplateModalProps) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      if (selected.size > 5 * 1024 * 1024) {
        toast.error("File size must be less than 5MB");
        return;
      }
      setFile(selected);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(selected);
    }
  };

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
      
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64data = reader.result as string;
        
        // Get image dimensions
        const img = new Image();
        img.onload = async () => {
          const width = img.width;
          const height = img.height;
          
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
        };
        img.src = base64data;
      };
      reader.readAsDataURL(compressedFile);
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to upload template.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-white/10 p-6 rounded-2xl w-full max-w-md shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-semibold text-white mb-6">Upload Template</h2>
        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              Template Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-zinc-950 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"
              placeholder="e.g. Distracted Boyfriend"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              Image
            </label>
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-white/10 border-dashed rounded-lg hover:border-indigo-500/50 transition-colors bg-zinc-950/50">
              <div className="space-y-1 text-center">
                {preview ? (
                  <div className="mb-4">
                    <img
                      src={preview}
                      alt="Preview"
                      className="mx-auto max-h-48 rounded object-contain"
                    />
                  </div>
                ) : (
                  <Upload className="mx-auto h-12 w-12 text-zinc-500" />
                )}
                <div className="flex text-sm text-zinc-400 justify-center">
                  <label
                    htmlFor="file-upload"
                    className="relative cursor-pointer rounded-md font-medium text-indigo-400 hover:text-indigo-300 focus-within:outline-none"
                  >
                    <span>Upload a file</span>
                    <input
                      id="file-upload"
                      name="file-upload"
                      type="file"
                      className="sr-only"
                      accept="image/*"
                      onChange={handleFileChange}
                    />
                  </label>
                </div>
                <p className="text-xs text-zinc-500">PNG, JPG up to 5MB</p>
              </div>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> Uploading...
              </>
            ) : (
              "Upload Template"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
