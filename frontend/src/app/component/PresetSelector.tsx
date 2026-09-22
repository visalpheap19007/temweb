"use client";

import { useEffect, useState } from "react";

type Preset = {
  id: number;
  name: string;
  template_path: string;
  engine: string;
  description: string | null;
};

type PresetSelectorProps = {
  videoId?: number;
};


export default function PresetSelector({
  videoId,
}: PresetSelectorProps) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rendering, setRendering] = useState(false);
  const [renderStatus, setRenderStatus] = useState("");
  const [renderedVideoUrl, setRenderedVideoUrl] = useState<string | null>(
    null
  );
  const [jobId, setJobId] = useState<number | null>(null);
  const [renderProgress, setRenderProgress] = useState(0);

  useEffect(() => {
    const fetchPresets = async () => {
      try {
        setLoading(true);

        const response = await fetch(
          "http://localhost:8000/api/presets"
        );

        if (!response.ok) {
          throw new Error("Failed to load presets");
        }

        const data = await response.json();

        setPresets(data);
      } catch (error) {
        console.error(error);
        setError("Could not load presets.");
      } finally {
        setLoading(false);
      }
    };

    fetchPresets();
  }, []);

  const handleSelect = (preset: Preset) => {
    setSelectedPreset(preset);
    
  };

  if (loading) {
    return (
      <div className="rounded-xl border p-6">
        <p className="text-gray-500">Loading presets...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }
  const checkRenderStatus = async (jobId: number) => {
  try {
    const response = await fetch(
      `http://localhost:8000/api/render/status?job_id=${jobId}`
    );

    const data = await response.json();

    console.log("Render status:", data);

    // Update progress
    setRenderProgress(data.progress ?? 0);

    if (data.status === "completed") {
      setRendering(false);
      setRenderStatus("Render completed!");
      setRenderProgress(100);

      setRenderedVideoUrl(
        `http://localhost:8000/api/render/video/${jobId}`
      );

    } else if (data.status === "failed") {
      setRendering(false);

      setRenderStatus(
        data.error_message
          ? `Render failed: ${data.error_message}`
          : "Render failed."
      );
    } else {
      setRenderStatus("Rendering...");

      setTimeout(() => {
        checkRenderStatus(jobId);
      }, 3000);
    }

  } catch (error) {
    console.error("Status error:", error);

    setRenderStatus("Could not check render status.");

    setTimeout(() => {
      checkRenderStatus(jobId);
    }, 3000);
  }
};
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">
          Choose an Effect
        </h2>

        <p className="mt-1 text-sm text-gray-500">
          Select an After Effects preset for your video.
        </p>
      </div>

      {presets.length === 0 ? (
        <div className="rounded-xl border p-6 text-center">
          <p className="text-gray-500">
            No presets available.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {presets.map((preset) => {
            const isSelected =
              selectedPreset?.id === preset.id;

            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelect(preset)}
                className={`rounded-xl border p-5 text-left transition ${
                  isSelected
                    ? "border-black bg-gray-100 ring-2 ring-black"
                    : "border-gray-200 bg-white hover:border-gray-400 hover:shadow-sm"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">
                      {preset.name}
                    </h3>

                    <p className="mt-1 text-sm text-gray-500">
                      {preset.description ||
                        "After Effects preset"}
                    </p>
                  </div>

                  {isSelected && (
                    <span className="rounded-full bg-black px-2.5 py-1 text-xs text-white">
                      Selected
                    </span>
                  )}
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <span className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-600">
                    {preset.engine}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selectedPreset && (
        <div className="rounded-xl border bg-gray-50 p-5">
          <p className="text-sm text-gray-500">
            Selected preset
          </p>

          <p className="mt-1 font-semibold">
            {selectedPreset.name}
          </p>

          <p className="mt-1 text-sm text-gray-500">
            Preset ID: {selectedPreset.id}
          </p>

<button
  type="button"
  disabled={!videoId || rendering}
  className="mt-4 rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
  onClick={async () => {
    if (!videoId || !selectedPreset) {
      return;
    }

    try {
      console.log("Starting render...");

      const response = await fetch(
        "http://localhost:8000/api/render",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            video_id: videoId,
            preset_id: selectedPreset.id,
          }),
        }
      );

      const data = await response.json();

      console.log("Render response:", data);

      if (!response.ok) {
        throw new Error(
          data.message || "Failed to start render"
        );
      }

    setRendering(true);
    setRenderStatus("Render job created...");
    setRenderProgress(0);
    setRenderedVideoUrl(null);
    setJobId(data.job_id);
    checkRenderStatus(data.job_id);

    } catch (error) {
      console.error("Render error:", error);

      if (error instanceof Error) {
        alert(error.message);
      } else {
        alert("Something went wrong.");
      }
    }
  }}
>
  {rendering ? "Rendering..." : "Apply Effect"}
</button>
{renderStatus && (
  <div className="space-y-2">
    <p className="text-sm font-medium">
      {renderStatus}
    </p>

    {rendering && (
      <>
        <div className="h-3 w-full max-w-2xl overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-black transition-all duration-500"
            style={{
              width: `${renderProgress}%`,
            }}
          />
        </div>

        <p className="text-sm text-gray-500">
          {renderProgress}% complete
        </p>
      </>
    )}
  </div>
)}
{renderedVideoUrl && (
  <div className="mt-6 space-y-3">
    <h3 className="text-lg font-semibold">
      Rendered Video
    </h3>

    <video
      src={renderedVideoUrl}
      width={1000}
      controls
      className="w-full max-w-2xl rounded-lg"
    />
  </div>
)}
        </div>
      )}
    </div>
  );
}