"use client";

import { useState } from "react";

type VideoUploadProps = {
  onUpload?: (videoId: number) => void;
};

export default function VideoUpload({
  onUpload,
}: VideoUploadProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSelectVideo = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    setSelectedFile(file);

    const url = URL.createObjectURL(file);
    setVideoUrl(url);

    setMessage("");
  };

  const uploadToServer = async () => {
    if (!selectedFile) {
      setMessage("Please select a video first.");
      return;
    }

    try {
      setUploading(true);
      setMessage("Uploading...");

      const formData = new FormData();

      formData.append("video", selectedFile);

      const response = await fetch(
        "http://localhost:8000/api/videos",
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();

      console.log("Status:", response.status);

      console.log(
        "Laravel response:",
        JSON.stringify(data, null, 2)
      );

      if (!response.ok) {
        throw new Error(
          data.message || "Upload failed"
        );
      }

      // Send the database video ID to the parent component
      onUpload?.(data.video.id);

      setMessage(
        `Video uploaded successfully! Video ID: ${data.video.id}`
      );

    } catch (error) {
      console.error("Upload error:", error);

      if (error instanceof Error) {
        setMessage(error.message);
      } else {
        setMessage(
          "Something went wrong while uploading."
        );
      }

    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">

      {/* Select video */}
      <input
        type="file"
        accept="video/*"
        onChange={handleSelectVideo}
      />

      {/* Video preview */}
      {videoUrl && (
        <video
          src={videoUrl}
          controls
          width={1000}
          className="w-full max-w-2xl rounded-lg"
        />
      )}

      {/* File information */}
      {selectedFile && (
        <div>
          <p>File: {selectedFile.name}</p>

          <p>
            Size:{" "}
            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
          </p>
        </div>
      )}

      {/* Upload button */}
      {selectedFile && (
        <button
          onClick={uploadToServer}
          disabled={uploading}
          className="rounded-lg bg-black px-5 py-2 text-white disabled:opacity-50"
        >
          {uploading
            ? "Uploading..."
            : "Upload Video"}
        </button>
      )}

      {/* Message */}
      {message && <p>{message}</p>}

    </div>
  );
}