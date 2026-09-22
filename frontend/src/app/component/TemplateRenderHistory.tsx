"use client";

import { useCallback, useEffect, useState } from "react";

interface Template {
  id: number;
  name: string;
}

interface TemplateRenderJob {
  id: number;
  template_id: number;
  status: "queued" | "processing" | "completed" | "failed";
  error_message: string | null;
  output_path: string | null;
  created_at: string;
  updated_at: string;
  template: Template | null;
}

export default function TemplateRenderHistory() {
  const [jobs, setJobs] = useState<TemplateRenderJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    try {
      const response = await fetch(
        "http://localhost:8000/api/template-render/jobs",
        {
          headers: {
            Accept: "application/json",
          },
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Failed to load template render history."
        );
      }

      setJobs(data.jobs ?? []);
      setError(null);
    } catch (err) {
      console.error("Failed to load template render history:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to load template render history."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadJobs();

    const interval = window.setInterval(() => {
      void loadJobs();
    }, 3000);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadJobs]);

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString();
  };

  const getStatusLabel = (status: TemplateRenderJob["status"]) => {
    switch (status) {
      case "queued":
        return "Queued";
      case "processing":
        return "Rendering...";
      case "completed":
        return "Completed";
      case "failed":
        return "Failed";
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-bold text-slate-900">
          My Template Renders
        </h2>

        <p className="text-sm text-slate-500">
          Loading render history...
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            My Template Renders
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Your previous template renders
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadJobs()}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {jobs.length === 0 && !error ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
          <p className="font-medium text-slate-700">
            No template renders yet.
          </p>

          <p className="mt-1 text-sm text-slate-500">
            Render a template and it will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
            >
              <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">
                    {job.template?.name ?? `Template #${job.template_id}`}
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    Job #{job.id} • {formatDate(job.created_at)}
                  </p>
                </div>

                <span
                  className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${
                    job.status === "completed"
                      ? "bg-green-100 text-green-700"
                      : job.status === "failed"
                        ? "bg-red-100 text-red-700"
                        : job.status === "processing"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {getStatusLabel(job.status)}
                </span>
              </div>

              {job.status === "completed" && (
                <div className="p-5 ">
                  <video
                    key={job.id}
                    
                    src={`http://localhost:8000/api/template-render/jobs/${job.id}/video`}
                    controls
                    playsInline
                    preload="metadata"
                    className=" w-50 max-w-2xl rounded-xl bg-black"
                  />

                  <a
                    href={`http://localhost:8000/api/template-render/jobs/${job.id}/video`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Open / Download Result
                  </a>
                </div>
              )}

              {job.status === "queued" && (
                <div className="p-5 text-sm text-yellow-700">
                  Waiting for the render worker...
                </div>
              )}

              {job.status === "processing" && (
                <div className="p-5 text-sm text-blue-700">
                  Your video is currently being rendered by After Effects...
                </div>
              )}

              {job.status === "failed" && (
                <div className="p-5">
                  <p className="text-sm font-semibold text-red-700">
                    Render failed
                  </p>

                  {job.error_message && (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-red-600">
                      {job.error_message}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}