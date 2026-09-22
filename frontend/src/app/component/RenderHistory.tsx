"use client";

import { useEffect, useState } from "react";

type Video = {
  id: number;
  original_name: string;
  storage_path: string;
};

type Preset = {
  id: number;
  name: string;
};

type RenderJob = {
  id: number;
  video_id: number;
  preset_id: number;
  status: string;
  job_path: string;
  output_path: string;
  video: Video;
  preset: Preset;
};

export default function RenderHistory() {
const [jobs, setJobs] = useState<RenderJob[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState("");
const [deletingJobId, setDeletingJobId] = useState<number | null>(null);
  const deleteJob = async (jobId: number) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this render?"
    );

    if (!confirmed) return;

    try {
      setDeletingJobId(jobId);

      const response = await fetch(
        `http://localhost:8000/api/render-jobs/${jobId}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Failed to delete render"
        );
      }

      // Remove the deleted job from the current UI
      setJobs((currentJobs) =>
        currentJobs.filter((job) => job.id !== jobId)
      );
    } catch (error) {
      console.error("Delete error:", error);

      if (error instanceof Error) {
        alert(error.message);
      } else {
        alert("Failed to delete render.");
      }
    } finally {
      setDeletingJobId(null);
    }
  };

    useEffect(() => {
    const fetchJobs = async () => {
        try {
        const response = await fetch(
            "http://localhost:8000/api/render-jobs"
        );

        const data = await response.json();

        console.log("Render jobs:", data);

        if (!response.ok) {
            throw new Error(
            data.message || "Failed to load render history"
            );
        }

        setJobs(data.jobs);
        setError("");

        } catch (error) {
        console.error(error);

        if (error instanceof Error) {
            setError(error.message);
        } else {
            setError("Could not load render history.");
        }

        } finally {
        setLoading(false);
        }
    };

    // Load immediately
    fetchJobs();

    // Refresh every 5 seconds
    const interval = setInterval(() => {
        fetchJobs();
    }, 5000);

    return () => {
        clearInterval(interval);
    };
    }, []);

  if (loading) {
    return (
      <div className="rounded-xl border p-6">
        <p className="text-gray-500">
          Loading render history...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <p className="text-red-600">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      <div>
        <h2 className="text-xl font-semibold">
          Render History
        </h2>

        <p className="mt-1 text-sm text-gray-500">
          View your previous rendered videos.
        </p>
      </div>


      {jobs.length === 0 ? (
        <div className="rounded-xl border p-6 text-center">
          <p className="text-gray-500">
            No render jobs yet.
          </p>
        </div>
      ) : (
        <div className="space-y-4">

          {jobs.map((job) => {

            const isCompleted =
              job.status === "completed";

            const isProcessing =
              job.status === "processing";

            const isQueued =
              job.status === "queued";

            return (
              <div
                key={job.id}
                className="rounded-xl border bg-white p-5 shadow-sm"
              >

                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

                  <div>
                    <h3 className="font-semibold">
                      {job.preset.name}
                    </h3>

                    <p className="mt-1 text-sm text-gray-500">
                      Video: {job.video.original_name}
                    </p>

                    <p className="mt-1 text-sm text-gray-500">
                      Job ID: {job.id}
                    </p>
                  </div>


                  <div>

                    {isCompleted && (
                      <span className="rounded-full bg-green-100 px-3 py-1 text-sm text-green-700">
                        Completed
                      </span>
                    )}

                    <button
                      onClick={() => deleteJob(job.id)}
                      disabled={deletingJobId === job.id}
                      className="mt-2 rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {deletingJobId === job.id
                        ? "Deleting..."
                        : "Delete"}
                    </button>

                    {isProcessing && (
                      <span className="rounded-full bg-yellow-100 px-3 py-1 text-sm text-yellow-700">
                        Processing
                      </span>
                    )}

                    {isQueued && (
                      <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
                        Queued
                      </span>
                    )}

                    {!isCompleted &&
                      !isProcessing &&
                      !isQueued && (
                        <span className="rounded-full bg-red-100 px-3 py-1 text-sm text-red-700">
                          {job.status}
                        </span>
                    )}

                  </div>

                </div>


              {isCompleted && (
                <div className="mt-5 space-y-3">
                  <video
                    src={`http://localhost:8000/api/render/video/${job.id}`}
                    controls
                    className="w-full max-w-2xl rounded-lg"
                  />

                  <a
                    href={`http://localhost:8000/api/render/download/${job.id}`}
                    className="inline-block rounded-lg bg-black px-5 py-2 text-white hover:opacity-80"
                  >
                    Download Video
                  </a>
                </div>
              )}

              </div>
            );
          })}

        </div>
      )}

    </div>
  );
}