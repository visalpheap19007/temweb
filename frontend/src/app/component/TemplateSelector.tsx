"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";

interface TemplateSlot {
  id: number;
  template_id: number;
  slot_name: string;
  slot_order: number;
  required_frames: number;
  fps: number;
  width?: number;
  height?: number;
  target_duration?: number;
  target_frames?: number;
  original_video_duration?: number;
  original_video_frames?: number;
  original_video_fps?: number;
  is_precomp?: boolean;
}

interface Template {
  id: number;
  name: string;
  template_path: string;
  engine: string;
  description: string | null;
  preview_path?: string | null;
  width?: number;
  height?: number;
  fps?: number;
  slots: TemplateSlot[];
}

interface UploadedClip {
  slotId: number;
  slotName: string;
  videoId: number;
  fileName: string;
  fileUrl: string;
  duration: number;
  startFrame: number;
  endFrame: number;
  selected: boolean;
  sourceStartSeconds?: number;
  sourceEndSeconds?: number;
  cropScale: number;
  cropX: number;
  cropY: number;
}

function framesToSeconds(frames: number, fps: number) {
  return frames / fps;
}

function formatTimecode(frames: number, fps: number) {
  if (!Number.isFinite(frames) || !Number.isFinite(fps) || fps <= 0) return "0:00:00:0";
  const totalFrames = Math.max(0, Math.round(frames));
  const wholeSeconds = Math.floor(totalFrames / fps);
  const frame = totalFrames % Math.round(fps);
  const seconds = wholeSeconds % 60;
  const minutes = Math.floor(wholeSeconds / 60) % 60;
  const hours = Math.floor(wholeSeconds / 3600);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}:${frame}`;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "0.00s";
  return `${seconds.toFixed(3)}s`;
}

function formatFrames(frames: number) {
  return `${frames} frame${frames === 1 ? "" : "s"}`;
}

function getTemplatePreviewUrl(template: Template) {
  if (!template.preview_path) return null;

  if (
    template.preview_path.startsWith("http://") ||
    template.preview_path.startsWith("https://")
  ) {
    return template.preview_path;
  }

  const cleanPath = template.preview_path.replace(/^\/+/, "");
  return `http://localhost:8000/storage/${cleanPath}`;
}

function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);

    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = video.duration;
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read video duration."));
    };
    video.src = url;
  });
}

export default function TemplateSelector() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateSearch, setTemplateSearch] = useState("");

  // Composition dimensions are expected to come from the AEP/AE worker API.
  // No fixed 9:16/16:9 size is used here.
  const [selectedTemplate, setSelectedTemplate] =
    useState<Template | null>(null);

  const [uploadedClips, setUploadedClips] = useState<UploadedClip[]>([]);
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);
  const [creatingJob, setCreatingJob] = useState(false);
  const [jobMessage, setJobMessage] = useState("");
  const [jobId, setJobId] = useState<number | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [jobOutputPath, setJobOutputPath] = useState<string | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);

  const [previewSlotId, setPreviewSlotId] = useState<number | null>(null);
  const [activeSlotId, setActiveSlotId] = useState<number | null>(null);
  const [trimDragEdge, setTrimDragEdge] = useState<"start" | "end" | null>(null);
  const [videoDimensions, setVideoDimensions] = useState<
    Record<number, { width: number; height: number }>
  >({});
  const videoRefs = useRef<Record<number, HTMLVideoElement | null>>({});
  const previewEndTimes = useRef<Record<number, number>>({});
  const previewStartTimes = useRef<Record<number, number>>({});
  const previewRequestIds = useRef<Record<number, number>>({});

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const response = await fetch(
          `${API_BASE}/templates`
        );

        if (!response.ok) {
          throw new Error("Failed to load templates.");
        }

        const data = await response.json();
        setTemplates(data.templates ?? []);
      } catch (error) {
        console.error("Failed to load templates:", error);
      }
    };

    loadTemplates();
  }, []);

  // Revoke local preview URLs only when this component unmounts.
  // Do not put uploadedClips in this dependency array, otherwise
  // React would revoke URLs every time the trim position changes.
  useEffect(() => {
    return () => {
      uploadedClips.forEach((clip) => {
        URL.revokeObjectURL(clip.fileUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredTemplates = useMemo(() => {
    const query = templateSearch.trim().toLowerCase();

    if (!query) return templates;

    return templates.filter((template) => {
      const searchable = [
        template.name,
        template.description ?? "",
        `${template.slots.length} clips`,
        template.width ? `${template.width}` : "",
        template.height ? `${template.height}` : "",
      ].join(" ").toLowerCase();

      return searchable.includes(query);
    });
  }, [templates, templateSearch]);

  const handleTemplateSelect = (template: Template) => {
    uploadedClips.forEach((clip) => {
      URL.revokeObjectURL(clip.fileUrl);
    });

    setSelectedTemplate(template);
    setUploadedClips([]);
    setPreviewSlotId(null);
    setActiveSlotId(template.slots[0]?.id ?? null);
    setJobMessage("");
    setJobId(null);
    setJobStatus(null);
    setJobOutputPath(null);
    setJobError(null);
  };

  const replaceClip = (
    slotId: number,
    changes: Partial<UploadedClip>
  ) => {
    setUploadedClips((previous) =>
      previous.map((clip) =>
        clip.slotId === slotId
          ? { ...clip, ...changes }
          : clip
      )
    );
  };

  const handleUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    slot: TemplateSlot
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
      setUploadingSlot(slot.id);

      const duration = await getVideoDuration(file);
      const requiredSourceFrames = getTargetSelectionFrames(slot);
      const requiredSourceFps = getSourceSelectionFps(slot);
      const targetDuration = framesToSeconds(requiredSourceFrames, requiredSourceFps);

      // The uploaded video only needs to contain the original template
      // source duration for this slot. The source can be shorter than the
      // template target because AE will slow it down inside a precomp.
      const originalTemplateDuration =
        slot.original_video_duration &&
        slot.original_video_duration > 0
          ? slot.original_video_duration
          : targetDuration;

      const uploadedFrames = Math.floor(duration * requiredSourceFps + 0.0001);

      if (uploadedFrames < requiredSourceFrames) {
        alert(
          `${slot.slot_name} is too short.\n\n` +
            `Template source requires: ${formatTimecode(requiredSourceFrames, requiredSourceFps)} (${formatFrames(requiredSourceFrames)})\n` +
            `Uploaded: ${formatTimecode(uploadedFrames, requiredSourceFps)} (${formatFrames(uploadedFrames)})`
        );
        return;
      }

      const formData = new FormData();
      formData.append("video", file);

      const response = await fetch(
        `${API_BASE}/videos`,
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Upload failed.");
      }

      // Keep the File URL alive while this component is open.
      const fileUrl = URL.createObjectURL(file);

      setUploadedClips((previous) => {
        const oldClip = previous.find(
          (clip) => clip.slotId === slot.id
        );

        // The old preview URL can be revoked after the new clip is stored.
        if (oldClip) {
          setTimeout(() => {
            URL.revokeObjectURL(oldClip.fileUrl);
          }, 0);
        }

        const filtered = previous.filter(
          (clip) => clip.slotId !== slot.id
        );

        return [
          ...filtered,
          {
            slotId: slot.id,
            slotName: slot.slot_name,
            videoId: data.video.id,
            fileName: file.name,
            fileUrl,
            duration,
            startFrame: 0,
            endFrame: Math.min(
              getTargetSelectionFrames(slot),
              Math.max(1, Math.floor(duration * getSourceSelectionFps(slot) + 0.0001))
            ),
            selected: false,
            sourceStartSeconds: 0,
            sourceEndSeconds: Math.min(
              duration,
              getTargetSelectionFrames(slot) / getSourceSelectionFps(slot)
            ),
            cropScale: 1,
            cropX: 0,
            cropY: 0,
          },
        ];
      });

      setPreviewSlotId(null);
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "Upload failed."
      );
    } finally {
      setUploadingSlot(null);
      event.target.value = "";
    }
  };

  const updateCrop = (
    slotId: number,
    changes: Partial<Pick<UploadedClip, "cropScale" | "cropX" | "cropY">>
  ) => {
    replaceClip(slotId, changes);
  };

  const resetCrop = (slotId: number) => {
    replaceClip(slotId, { cropScale: 1, cropX: 0, cropY: 0 });
  };

  const getTotalFrames = (
    clip: UploadedClip,
    slot: TemplateSlot
  ) => {
    return Math.max(
      1,
      Math.floor(clip.duration * getSourceSelectionFps(slot) + 0.0001)
    );
  };

  // Frame ranges are AEP/template-timeline frames. Use the AEP FPS.
  // The uploaded file's native FPS is handled by the AE renderer.
  const getSourceSelectionFps = (slot: TemplateSlot) => slot.fps;

  const getTargetSelectionFrames = (slot: TemplateSlot) => {
    const sourceFrames =
      slot.original_video_frames ??
      slot.target_frames ??
      slot.required_frames ??
      Math.max(1, Math.round((slot.target_duration ?? 0) * getSourceSelectionFps(slot)));

    return Math.max(1, Math.round(sourceFrames));
  };

  const getMaxStartFrame = (
    clip: UploadedClip,
    slot: TemplateSlot
  ) => {
    const totalFrames = getTotalFrames(clip, slot);
    const selectedFrames = Math.min(
      getTargetSelectionFrames(slot),
      totalFrames
    );

    return Math.max(0, totalFrames - selectedFrames);
  };

  const handleTrimPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    clip: UploadedClip,
    slot: TemplateSlot
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const totalFrames = getTotalFrames(clip, slot);
    const selectedFrames = Math.min(getTargetSelectionFrames(slot), totalFrames);
    const frame = Math.round(
      Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * totalFrames
    );
    const distanceToStart = Math.abs(frame - clip.startFrame);
    const distanceToEnd = Math.abs(frame - clip.endFrame);
    setTrimDragEdge(distanceToStart <= distanceToEnd ? "start" : "end");
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleTrimPointerMove = (
    event: React.PointerEvent<HTMLDivElement>,
    clip: UploadedClip,
    slot: TemplateSlot
  ) => {
    if (!trimDragEdge) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const totalFrames = getTotalFrames(clip, slot);
    const frame = Math.round(
      Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * totalFrames
    );

    if (trimDragEdge === "start") {
      handleStartFrameChange(clip, slot, frame);
    } else {
      handleEndFrameChange(clip, slot, frame);
    }
  };

  const handleTrimPointerUp = () => {
    setTrimDragEdge(null);
  };

  const moveSelection = (
    clip: UploadedClip,
    slot: TemplateSlot,
    direction: "left" | "right"
  ) => {
    const totalFrames = getTotalFrames(clip, slot);
    const selectedFrames = Math.min(
      getTargetSelectionFrames(slot),
      totalFrames
    );
    const maxStartFrame = Math.max(0, totalFrames - selectedFrames);

    const nextStart =
      direction === "right"
        ? Math.min(maxStartFrame, clip.startFrame + 1)
        : Math.max(0, clip.startFrame - 1);
    const nextEnd = Math.min(totalFrames, nextStart + selectedFrames);

    replaceClip(slot.id, {
      startFrame: nextStart,
      endFrame: nextEnd,
      selected: false,
      sourceStartSeconds: nextStart / getSourceSelectionFps(slot),
      sourceEndSeconds: nextEnd / getSourceSelectionFps(slot),
    });
    previewStartTimes.current[slot.id] = nextStart / getSourceSelectionFps(slot);
    previewEndTimes.current[slot.id] = nextEnd / getSourceSelectionFps(slot);
    previewRequestIds.current[slot.id] = (previewRequestIds.current[slot.id] ?? 0) + 1;
    setPreviewSlotId(null);
  };

  const handleStartFrameChange = (
    clip: UploadedClip,
    slot: TemplateSlot,
    value: number
  ) => {
    const totalFrames = getTotalFrames(clip, slot);
    const selectedFrames = Math.min(
      getTargetSelectionFrames(slot),
      totalFrames
    );
    const maxStartFrame = Math.max(0, totalFrames - selectedFrames);
    const safeStartFrame = Math.min(
      Math.max(0, Math.round(value)),
      maxStartFrame
    );
    const nextEnd = safeStartFrame + selectedFrames;
    const startTime = safeStartFrame / getSourceSelectionFps(slot);
    const endTime = nextEnd / getSourceSelectionFps(slot);

    replaceClip(slot.id, {
      startFrame: safeStartFrame,
      endFrame: nextEnd,
      selected: false,
      sourceStartSeconds: startTime,
      sourceEndSeconds: endTime,
    });
    previewStartTimes.current[slot.id] = startTime;
    previewEndTimes.current[slot.id] = endTime;
    previewRequestIds.current[slot.id] = (previewRequestIds.current[slot.id] ?? 0) + 1;
    setPreviewSlotId(null);
  };

  const handleEndFrameChange = (
    clip: UploadedClip,
    slot: TemplateSlot,
    value: number
  ) => {
    const totalFrames = getTotalFrames(clip, slot);
    const selectedFrames = Math.min(
      getTargetSelectionFrames(slot),
      totalFrames
    );
    const requestedEnd = Math.min(
      Math.max(Math.round(value), selectedFrames),
      totalFrames
    );
    const nextStart = Math.max(0, requestedEnd - selectedFrames);
    const nextEnd = Math.min(totalFrames, nextStart + selectedFrames);
    const startTime = nextStart / getSourceSelectionFps(slot);
    const endTime = nextEnd / getSourceSelectionFps(slot);

    replaceClip(slot.id, {
      startFrame: nextStart,
      endFrame: nextEnd,
      selected: false,
      sourceStartSeconds: startTime,
      sourceEndSeconds: endTime,
    });
    previewStartTimes.current[slot.id] = startTime;
    previewEndTimes.current[slot.id] = endTime;
    previewRequestIds.current[slot.id] = (previewRequestIds.current[slot.id] ?? 0) + 1;
    setPreviewSlotId(null);
  };

  const previewSelection = async (
    clip: UploadedClip,
    slot: TemplateSlot
  ) => {
    const video = videoRefs.current[slot.id];
    if (!video) {
      console.warn("Preview video element is not mounted yet.");
      return;
    }

    const startTime = clip.sourceStartSeconds ?? clip.startFrame / getSourceSelectionFps(slot);
    const endTime = clip.sourceEndSeconds ?? clip.endFrame / getSourceSelectionFps(slot);
    const requestId = (previewRequestIds.current[slot.id] ?? 0) + 1;

    previewRequestIds.current[slot.id] = requestId;
    previewStartTimes.current[slot.id] = startTime;
    previewEndTimes.current[slot.id] = endTime;

    try {
      if (video.readyState < 1) {
        await new Promise<void>((resolve, reject) => {
          const onLoadedMetadata = () => { cleanup(); resolve(); };
          const onError = () => { cleanup(); reject(new Error("Could not load video metadata.")); };
          const cleanup = () => {
            video.removeEventListener("loadedmetadata", onLoadedMetadata);
            video.removeEventListener("error", onError);
          };
          video.addEventListener("loadedmetadata", onLoadedMetadata);
          video.addEventListener("error", onError);
        });
      }
      if (previewRequestIds.current[slot.id] !== requestId) return;

      const safeStart = Math.max(0, Math.min(startTime, Math.max(0, video.duration - 0.001)));
      const safeEnd = Math.max(safeStart, Math.min(endTime, video.duration));
      previewStartTimes.current[slot.id] = safeStart;
      previewEndTimes.current[slot.id] = safeEnd;
      video.pause();

      let reachedStart = false;
      for (let attempt = 0; attempt < 3 && !reachedStart; attempt++) {
        if (previewRequestIds.current[slot.id] !== requestId) return;
        video.currentTime = safeStart;
        await new Promise<void>((resolve) => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            video.removeEventListener("seeked", finish);
            resolve();
          };
          video.addEventListener("seeked", finish, { once: true });
          window.setTimeout(finish, 250);
        });
        reachedStart = Math.abs(video.currentTime - safeStart) < 0.05;
      }

      if (!reachedStart || previewRequestIds.current[slot.id] !== requestId) return;
      await video.play();
      if (previewRequestIds.current[slot.id] === requestId) setPreviewSlotId(slot.id);
    } catch (error) {
      if (previewRequestIds.current[slot.id] === requestId) setPreviewSlotId(null);
      console.error("Preview playback failed:", error);
      alert("The selected section could not be previewed.");
    }
  };

  const toggleSelection = (
    clip: UploadedClip,
    slot: TemplateSlot
  ) => {
    const video = videoRefs.current[slot.id];

    if (!video) return;

    if (previewSlotId === slot.id && !video.paused) {
      video.pause();
      return;
    }

    void previewSelection(clip, slot);
  };

  const allReady = useMemo(() => {
    if (!selectedTemplate) return false;

    return selectedTemplate.slots.every((slot) => {
      const clip = uploadedClips.find(
        (item) => item.slotId === slot.id
      );

      return Boolean(clip);
    });
  }, [selectedTemplate, uploadedClips]);

  const pollTemplateJob = async (id: number) => {
  try {
    const response = await fetch(
      `${API_BASE}/template-render/jobs/${id}`,
      {
        headers: {
          Accept: "application/json",
        },
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success || !data.job) {
      throw new Error(
        data.message || "Failed to check render job status."
      );
    }

    const job = data.job;

    setJobStatus(job.status);
    setJobOutputPath(job.output_path ?? null);
    setJobError(job.error_message ?? null);

    console.log("Template job status:", job);

    if (job.status === "completed") {
      setCreatingJob(false);
      setJobMessage(
        `Template render job #${id} completed successfully.`
      );
      return;
    }

    if (job.status === "failed") {
      setCreatingJob(false);
      setJobMessage(
        `Template render job #${id} failed.`
      );
      return;
    }

    window.setTimeout(() => {
      void pollTemplateJob(id);
    }, 2000);
  } catch (error) {
    console.error("Failed to check template job:", error);

    setCreatingJob(false);
    setJobError(
      error instanceof Error
        ? error.message
        : "Failed to check render job status."
    );
  }
};

  const handleApplyTemplate = async () => {
  if (!selectedTemplate) return;

  if (!allReady) {
    alert(
      `Please upload all ${selectedTemplate.slots.length} clips.`
    );
    return;
  }

  try {
    setCreatingJob(true);
    setJobMessage("");
    setJobId(null);
    setJobStatus(null);
    setJobOutputPath(null);
    setJobError(null);

    const response = await fetch(
      `${API_BASE}/template-render`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          template_id: selectedTemplate.id,

          clips: uploadedClips.map((clip) => ({
            slot_id: clip.slotId,
            video_id: clip.videoId,
            start_frame: clip.startFrame,
            end_frame: clip.endFrame,
            crop_scale: clip.cropScale,
            crop_x: clip.cropX,
            crop_y: clip.cropY,
          })),
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message || "Failed to create render job."
      );
    }

    const createdJobId = Number(data.job.id);

    setJobId(createdJobId);
    setJobStatus(data.job.status ?? "queued");

    setJobMessage(
      `Template render job #${createdJobId} created successfully.`
    );

    console.log("Template render job created:", data.job);

    // Start checking the job.
    void pollTemplateJob(createdJobId);
  } catch (error) {
    console.error(error);

    setCreatingJob(false);

    setJobMessage(
      error instanceof Error
        ? error.message
        : "Failed to create render job."
    );
  }
};
  const activeSlot =
    selectedTemplate?.slots.find((slot) => slot.id === activeSlotId) ??
    selectedTemplate?.slots[0] ??
    null;

  const activeClip = activeSlot
    ? uploadedClips.find((clip) => clip.slotId === activeSlot.id) ?? null
    : null;

  // Dynamic crop frame dimensions.
  // Prefer the actual slot dimensions returned from the AEP.
  // Fall back to template composition dimensions.
  const cropWidth =
    activeSlot?.width ??
    selectedTemplate?.width ??
    1;

  const cropHeight =
    activeSlot?.height ??
    selectedTemplate?.height ??
    1;

  const cropAspectRatio = cropWidth / cropHeight;

  const selectSlot = (slot: TemplateSlot) => {
    setActiveSlotId(slot.id);
    setPreviewSlotId(null);
  };


  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white">
              ✦
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                Template Studio
              </h1>
              <p className="text-xs text-slate-500">
                Create your video from template clips
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleApplyTemplate}
            disabled={creatingJob || !allReady}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {creatingJob ? "Creating..." : "Render Template →"}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-6 py-6">
        {!selectedTemplate ? (
          <section>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-slate-900">
                Choose a template
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Select a template to start editing.
              </p>
            </div>

            {templates.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
                <div className="text-4xl">🎬</div>
                <p className="mt-3 font-semibold text-slate-800">
                  No templates found
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Make sure your Laravel API is running.
                </p>
              </div>
            ) : (
              <>
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="relative w-full sm:max-w-md">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg text-slate-400">
                      ⌕
                    </span>
                    <input
                      type="search"
                      value={templateSearch}
                      onChange={(event) => setTemplateSearch(event.target.value)}
                      placeholder="Search templates..."
                      className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <p className="text-sm text-slate-500">
                    {filteredTemplates.length}{" "}
                    {filteredTemplates.length === 1 ? "template" : "templates"}
                  </p>
                </div>

                {filteredTemplates.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
                    <div className="text-3xl">🔎</div>
                    <p className="mt-3 font-semibold text-slate-800">
                      No matching templates
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Try another search term.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                    {filteredTemplates.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => {
                          handleTemplateSelect(template);
                          setActiveSlotId(template.slots[0]?.id ?? null);
                        }}
                        className="group overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg"
                      >
                        <div
                          className="relative aspect-[2/3] overflow-hidden bg-slate-950"
                        >
                          {(() => {
                            const previewUrl = getTemplatePreviewUrl(template);

                            return previewUrl ? (
                              <video
                                src={previewUrl}
                                muted
                                loop
                                playsInline
                                preload="metadata"
                                className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                                onMouseEnter={(event) => {
                                  void event.currentTarget.play().catch(() => {});
                                }}
                                onMouseLeave={(event) => {
                                  event.currentTarget.pause();
                                  event.currentTarget.currentTime = 0;
                                }}
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-blue-50">
                                <span className="text-5xl text-blue-500/50">▶</span>
                              </div>
                            );
                          })()}

                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />

                          <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
                            {template.slots.length} clips
                          </span>
                        </div>

                        <div className="p-4">
                          <h3 className="truncate font-bold text-slate-900">
                            {template.name}
                          </h3>

                          <div className="mt-2 flex flex-wrap gap-2">
                            {template.width && template.height && (
                              <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                                {template.width} × {template.height}
                              </span>
                            )}

                            {template.fps && (
                              <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                                {template.fps} FPS
                              </span>
                            )}
                          </div>

                          {template.description && (
                            <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-400">
                              {template.description}
                            </p>
                          )}

                          <div className="mt-4 flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-400">
                              {template.slots.length} clip{" "}
                              {template.slots.length === 1 ? "slot" : "slots"}
                            </span>

                            <span className="text-xs font-bold text-blue-600 transition group-hover:translate-x-0.5">
                              Use template →
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTemplate(null);
                    setUploadedClips([]);
                    setActiveSlotId(null);
                    setPreviewSlotId(null);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  ← Templates
                </button>
                <div>
                  <h2 className="font-bold text-slate-900">
                    {selectedTemplate.name}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {selectedTemplate.slots.length} clip slots
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-600">
                  {uploadedClips.length}/{selectedTemplate.slots.length} ready
                </span>
                {allReady && (
                  <span className="rounded-full bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700">
                    ✓ Ready
                  </span>
                )}
              </div>
            </div>

            <div className="grid min-h-[650px] lg:grid-cols-[270px_minmax(0,1fr)]">
              <aside className="border-b border-slate-200 bg-slate-50/70 p-4 lg:border-b-0 lg:border-r">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Templates
                </p>

                <div className="mt-3">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                      ⌕
                    </span>
                    <input
                      type="search"
                      value={templateSearch}
                      onChange={(event) => setTemplateSearch(event.target.value)}
                      placeholder="Search templates"
                      className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {filteredTemplates.map((template) => {
                    const isActive = template.id === selectedTemplate.id;

                    return (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => {
                          handleTemplateSelect(template);
                          setActiveSlotId(template.slots[0]?.id ?? null);
                        }}
                        className={`w-full overflow-hidden rounded-xl border text-left transition ${
                          isActive
                            ? "border-blue-500 bg-blue-50 ring-1 ring-blue-200"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                        }`}
                      >
                        <div className="relative h-24 overflow-hidden bg-slate-950">
                          {(() => {
                            const previewUrl = getTemplatePreviewUrl(template);

                            return previewUrl ? (
                              <video
                                src={previewUrl}
                                muted
                                loop
                                playsInline
                                preload="metadata"
                                className="h-full w-full object-cover"
                                onMouseEnter={(event) => {
                                  void event.currentTarget.play().catch(() => {});
                                }}
                                onMouseLeave={(event) => {
                                  event.currentTarget.pause();
                                  event.currentTarget.currentTime = 0;
                                }}
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-100 to-blue-50">
                                <span className="text-3xl text-blue-500/50">▶</span>
                              </div>
                            );
                          })()}
                        </div>
                        <div className="p-3">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {template.name}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {template.slots.length} clips
                            {template.width && template.height
                              ? ` · ${template.width}×${template.height}`
                              : ""}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </aside>

              <section className="min-w-0 p-5 lg:p-7">
                {!activeSlot ? (
                  <div className="flex min-h-[550px] items-center justify-center text-slate-400">
                    Select a clip below.
                  </div>
                ) : (
                  <div className="mx-auto max-w-5xl">
                    <div className="mb-4 flex items-end justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">
                            SLOT {activeSlot.slot_order + 1}
                          </span>
                          <h3 className="text-xl font-bold text-slate-900">
                            {activeSlot.slot_name}
                          </h3>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">
                          {getTargetSelectionFrames(activeSlot)} frames · {activeSlot.fps} FPS ·{" "}
                          {formatTimecode(
                            getTargetSelectionFrames(activeSlot),
                            activeSlot.fps
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="overflow-hidden rounded-2xl bg-slate-950 shadow-md">
                      <div className="relative flex min-h-[390px] items-center justify-center p-6">
                        {activeClip ? (
                          <>
                            {/* Fixed crop frame. Its aspect ratio comes from the AEP dimensions. */}
                            <div
                              className="relative w-full max-w-[720px] overflow-hidden rounded-lg bg-black shadow-2xl ring-1 ring-white/20"
                              style={{
                                aspectRatio: cropAspectRatio,
                              }}
                            >
                              <video
                              ref={(element) => {
                                videoRefs.current[activeSlot.id] = element;
                              }}
                              src={activeClip.fileUrl}
                              className="absolute cursor-pointer"
                              style={(() => {
                                const dims = videoDimensions[activeSlot.id];
                                const videoRatio =
                                  dims && dims.width > 0 && dims.height > 0
                                    ? dims.width / dims.height
                                    : cropAspectRatio;

                                // Size the video to COVER the fixed AEP frame.
                                // Then calculate exactly how much extra content
                                // exists on each axis. The position sliders move
                                // only inside that available overflow, so there
                                // can never be an empty gap in the crop frame.
                                const frameRatio = cropAspectRatio;

                                let coverWidth = 100;
                                let coverHeight = 100;

                                if (videoRatio > frameRatio) {
                                  coverWidth = (videoRatio / frameRatio) * 100;
                                } else if (videoRatio < frameRatio) {
                                  coverHeight = (frameRatio / videoRatio) * 100;
                                }

                                coverWidth *= activeClip.cropScale;
                                coverHeight *= activeClip.cropScale;

                                const maxPanX = Math.max(
                                  0,
                                  (coverWidth - 100) / 2
                                );
                                const maxPanY = Math.max(
                                  0,
                                  (coverHeight - 100) / 2
                                );

                                const panX =
                                  (activeClip.cropX / 100) * maxPanX;
                                const panY =
                                  (activeClip.cropY / 100) * maxPanY;

                                return {
                                  width: `${coverWidth}%`,
                                  height: `${coverHeight}%`,
                                  maxWidth: "none",
                                  maxHeight: "none",
                                  left: `calc(50% + ${panX}%)`,
                                  top: `calc(50% + ${panY}%)`,
                                  transform: "translate(-50%, -50%)",
                                  transformOrigin: "center center",
                                };
                              })()}
                              playsInline
                              preload="metadata"
                              controls={false}
                              onClick={() => toggleSelection(activeClip, activeSlot)}
                              title={
                                previewSlotId === activeSlot.id
                                  ? "Click to pause preview"
                                  : "Click to preview selected section"
                              }
                              onLoadedMetadata={(event) => {
                                const video = event.currentTarget;

                                setVideoDimensions((previous) => ({
                                  ...previous,
                                  [activeSlot.id]: {
                                    width: video.videoWidth,
                                    height: video.videoHeight,
                                  },
                                }));
                              }}
                              onError={(event) => {
                                console.error(
                                  "Video element error:",
                                  event.currentTarget.error
                                );
                              }}
                            onTimeUpdate={(event) => {
                              const video = event.currentTarget;
                              const endTime = previewEndTimes.current[activeSlot.id];

                              if (
                                previewSlotId === activeSlot.id &&
                                Number.isFinite(endTime) &&
                                video.currentTime >= endTime - 0.02
                              ) {
                                video.pause();
                                setPreviewSlotId(null);

                                const startTime =
                                  previewStartTimes.current[activeSlot.id] ??
                                  activeClip.startFrame / getSourceSelectionFps(activeSlot);

                                window.requestAnimationFrame(() => {
                                  video.currentTime = Math.min(
                                    Math.max(0, startTime),
                                    Math.max(0, video.duration - 0.001)
                                  );
                                });
                              }
                            }}
                            onEnded={(event) => {
                              const video = event.currentTarget;
                              const startTime =
                                previewStartTimes.current[activeSlot.id] ??
                                activeClip.startFrame / getSourceSelectionFps(activeSlot);
                              video.pause();
                              video.currentTime = Math.min(
                                Math.max(0, startTime),
                                Math.max(0, video.duration - 0.001)
                              );
                              setPreviewSlotId(null);
                            }}
                              />
                              <div className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-white/80" />
                            </div>
                            <div className="absolute left-4 top-4 max-w-[70%] truncate rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">
                              {activeClip.fileName}
                            </div>
                            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                              <div className="rounded-full bg-black/50 px-4 py-2 text-xs font-semibold text-white opacity-0 transition-opacity hover:opacity-100">
                                {previewSlotId === activeSlot.id
                                  ? "Click to pause"
                                  : "Click video to preview"}
                              </div>
                            </div>
                          </>
                        ) : (
                          <label className="group flex cursor-pointer flex-col items-center justify-center px-6 py-20 text-center">
                            <input
                              type="file"
                              accept="video/*"
                              className="hidden"
                              disabled={uploadingSlot === activeSlot.id}
                              onChange={(event) =>
                                handleUpload(event, activeSlot)
                              }
                            />
                            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-3xl text-white group-hover:bg-white/15">
                              +
                            </div>
                            <p className="mt-4 font-semibold text-white">
                              {uploadingSlot === activeSlot.id
                                ? "Uploading..."
                                : "Upload your clip"}
                            </p>
                            <p className="mt-1 text-sm text-slate-400">
                              MP4, MOV or WebM
                            </p>
                          </label>
                        )}
                      </div>
                    </div>

                    {activeClip && (
                      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
                        <div className="mb-4 flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-bold text-slate-900">
                              Crop / Position
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              The AEP composition frame is fixed. Move the video left/right/up/down and zoom it inside the frame.
                            </p>
                            <p className="mt-1 text-[11px] font-medium text-slate-400">
                              Frame: {cropWidth} × {cropHeight}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => resetCrop(activeSlot.id)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                          >
                            Reset
                          </button>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-3">
                          {[
                            ["Zoom", activeClip.cropScale, 1, 3, 0.01, (v: number) => updateCrop(activeSlot.id, { cropScale: v })],
                            ["Horizontal", activeClip.cropX, -100, 100, 1, (v: number) => updateCrop(activeSlot.id, { cropX: v })],
                            ["Vertical", activeClip.cropY, -100, 100, 1, (v: number) => updateCrop(activeSlot.id, { cropY: v })],
                          ].map(([label, value, min, max, step, onChange]) => (
                            <label key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-600">
                                <span>{String(label)}</span>
                                <span>
                                {String(label) === "Zoom"
                                  ? `${Math.round(Number(value) * 100)}%`
                                  : Number(value) < 0
                                    ? `${Math.round(Number(value))}% Left`
                                    : Number(value) > 0
                                      ? `+${Math.round(Number(value))}% Right`
                                      : "Center"}
                              </span>
                              </div>
                              <input
                                type="range"
                                min={Number(min)}
                                max={Number(max)}
                                step={Number(step)}
                                value={Number(value)}
                                onChange={(event) => (onChange as (v: number) => void)(Number(event.target.value))}
                                className="w-full"
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {activeClip && (
                      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                        <div className="mb-4 flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-bold text-slate-900">
                              Trim selection
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              Choose the source section to replace the template video. The template target stays fixed; video inside a precomp is automatically time-stretched to that target.
                            </p>
                          </div>
                          <div className="flex flex-wrap justify-end gap-2">
                            <span className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">
                              Target:{" "}
                              {formatTimecode(
                                getTargetSelectionFrames(activeSlot),
                                activeSlot.fps
                              )}
                            </span>
                            <span className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700">
                              Selected:{" "}
                              {formatTimecode(
                                activeClip.endFrame - activeClip.startFrame,
                                activeSlot.fps
                              )}
                            </span>
                          </div>
                        </div>

                        <div className="relative">
                          <div className="flex h-20 gap-1 overflow-hidden rounded-xl border border-slate-200 bg-white p-2">
                            {Array.from({ length: 32 }).map((_, index) => (
                              <div
                                key={index}
                                className="relative min-w-[24px] flex-1 rounded-md bg-gradient-to-b from-slate-200 via-slate-300 to-slate-200"
                              >
                                <div className="absolute inset-y-0 left-1/2 w-px bg-white/80" />
                                <div className="absolute bottom-1 left-1 right-1 h-1 rounded-full bg-slate-400/50" />
                              </div>
                            ))}
                          </div>

                          {(() => {
                            const totalFrames = getTotalFrames(
                              activeClip,
                              activeSlot
                            );
                            const leftPercent =
                              (activeClip.startFrame / totalFrames) * 100;
                            const widthPercent =
                              ((activeClip.endFrame - activeClip.startFrame) /
                                totalFrames) *
                              100;

                            return (
                              <div
                                className="pointer-events-none absolute top-2 h-20 rounded-lg border-2 border-blue-600 bg-blue-500/20 shadow-[0_0_0_2px_rgba(255,255,255,0.85)]"
                                style={{
                                  left: `calc(${leftPercent}% * (100% - 16px) / 100 + 8px)`,
                                  width: `calc(${widthPercent}% * (100% - 16px) / 100)`,
                                }}
                              >
                                <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-blue-600 px-2 py-1 text-[10px] font-bold text-white">
                                  {activeClip.startFrame}–{activeClip.endFrame}f
                                </span>
                              </div>
                            );
                          })()}

                          <div
                            className="absolute inset-x-2 top-2 h-20 w-[calc(100%-16px)] cursor-ew-resize"
                            onPointerDown={(event) =>
                              handleTrimPointerDown(event, activeClip, activeSlot)
                            }
                            onPointerMove={(event) =>
                              handleTrimPointerMove(event, activeClip, activeSlot)
                            }
                            onPointerUp={handleTrimPointerUp}
                            onPointerCancel={handleTrimPointerUp}
                            onPointerLeave={(event) => {
                              if (trimDragEdge) {
                                handleTrimPointerMove(event, activeClip, activeSlot);
                              }
                            }}
                            aria-label={`Trim selection for ${activeSlot.slot_name}`}
                          />
                        </div>

                        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                          <button
                            type="button"
                            disabled={activeClip.startFrame <= 0}
                            onClick={() =>
                              moveSelection(activeClip, activeSlot, "left")
                            }
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            ← Previous
                          </button>

                          <button
                            type="button"
                            disabled={
                              activeClip.startFrame >=
                              getMaxStartFrame(activeClip, activeSlot)
                            }
                            onClick={() =>
                              moveSelection(activeClip, activeSlot, "right")
                            }
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Next →
                          </button>
                        </div>

                        <div className="mt-4 grid grid-cols-3 gap-3">
                          <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Start
                            </p>
                            <p className="mt-1 text-sm font-bold text-slate-900">
                              {activeClip.startFrame}f
                            </p>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              End
                            </p>
                            <p className="mt-1 text-sm font-bold text-slate-900">
                              {activeClip.endFrame}f
                            </p>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Selected Duration
                            </p>
                            <p className="mt-1 text-sm font-bold text-blue-600">
                              {formatTime(
                                framesToSeconds(
                                  activeClip.endFrame - activeClip.startFrame,
                                  activeSlot.fps
                                )
                              )}
                            </p>
                          </div>
                        </div>

                        {(() => {
                          // Render target is still the PRECOMP duration.
                          // UI Target/Selected above are the fixed AEP VIDEO
                          // layer duration used for replacement.
                          const renderTargetDuration =
                            activeSlot.target_duration ??
                            framesToSeconds(
                              activeSlot.required_frames,
                              activeSlot.fps
                            );

                          const selectedDuration = framesToSeconds(
                            activeClip.endFrame - activeClip.startFrame,
                            activeSlot.fps
                          );

                          const expectedStretch =
                            selectedDuration > 0
                              ? (renderTargetDuration / selectedDuration) * 100
                              : 0;

                          return (
                            <p className="mt-4 text-center text-[11px] text-slate-400">
                              Render target: {formatTime(renderTargetDuration)}
                              {" · "}
                              Source selected: {formatTime(selectedDuration)}
                              {" · "}
                              {activeSlot.is_precomp
                                ? `Expected Time Stretch: ${expectedStretch.toFixed(1)}%`
                                : "Direct video layer: 100%"}
                            </p>
                          );
                        })()}
                      </div>
                    )}

                    {activeClip && (
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-400">
                            SELECTED VIDEO
                          </p>
                          <p className="truncate text-sm font-semibold text-slate-800">
                            {activeClip.fileName}
                          </p>
                        </div>

                        <label className="cursor-pointer rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                          <input
                            type="file"
                            accept="video/*"
                            className="hidden"
                            disabled={uploadingSlot === activeSlot.id}
                            onChange={(event) =>
                              handleUpload(event, activeSlot)
                            }
                          />
                          Replace
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>

            <div className="border-t border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Clips
                </p>
                <p className="text-xs text-slate-400">
                  Click a clip to edit it
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
                {selectedTemplate.slots.map((slot) => {
                  const clip = uploadedClips.find(
                    (item) => item.slotId === slot.id
                  );
                  const isActive = activeSlot?.id === slot.id;

                  return (
                    <button
                      key={slot.id}
                      type="button"
                      onClick={() => selectSlot(slot)}
                      className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                        isActive
                          ? "border-blue-500 bg-blue-50 ring-1 ring-blue-200"
                          : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"
                      }`}
                    >
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                          clip
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-200 text-slate-500"
                        }`}
                      >
                        {clip ? "✓" : `0${slot.slot_order + 1}`}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-slate-900">
                          {slot.slot_name}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-slate-500">
                          {clip ? clip.fileName : "Upload clip"}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

            {jobMessage && (
              <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800">
                {jobMessage}
              </div>
            )}

            {jobStatus && (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Render Job
                    </p>

                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      Job #{jobId}
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                      jobStatus === "completed"
                        ? "bg-emerald-100 text-emerald-700"
                        : jobStatus === "failed"
                          ? "bg-red-100 text-red-700"
                          : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {jobStatus}
                  </span>
                </div>

                {jobStatus === "failed" && jobError && (
                  <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                    {jobError}
                  </div>
                )}

                {jobStatus === "completed" && jobId !== null && (
                  <div className="mt-5">
                    <p className="mb-3 text-sm font-semibold text-slate-700">
                      Your video is ready
                    </p>

                    <video
                      src={`${API_BASE}/template-render/jobs/${jobId}/video`}
                      controls
                      playsInline
                      className="w-full max-w-2xl rounded-xl bg-black"
                    />

                    <a
                      href={`${API_BASE}/template-render/jobs/${jobId}/video`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 inline-flex rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      Open / Download Result
                    </a>
                  </div>
                )}
              </div>
            )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
