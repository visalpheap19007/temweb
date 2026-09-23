"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { API_BASE } from "@/lib/api";


interface TemplateSlot {
  id: number;
  slot_name: string;
  slot_order: number;
  required_frames: number;
  fps: number;
  width?: number;
  height?: number;
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

function getPreviewUrl(template: Template) {
  if (!template.preview_path) return null;

  if (
    template.preview_path.startsWith("http://") ||
    template.preview_path.startsWith("https://")
  ) {
    return template.preview_path;
  }

  return `${API_BASE.replace("/api", "")}/storage/${template.preview_path.replace(
    /^\/+/,
    ""
  )}`;
}

export default function TemplateManagement() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [aepFile, setAepFile] = useState<File | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);

  const aepInputRef = useRef<HTMLInputElement | null>(null);
  const previewInputRef = useRef<HTMLInputElement | null>(null);

  // ---------------------------------------------------------
  // LOAD TEMPLATES
  // ---------------------------------------------------------

  const loadTemplates = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(`${API_BASE}/templates`, {
        headers: {
          Accept: "application/json",
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to load templates.");
      }

      setTemplates(data.templates ?? []);
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to load templates."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTemplates();
  }, []);

  // ---------------------------------------------------------
  // WAIT FOR BACKGROUND AEP ANALYSIS
  // ---------------------------------------------------------

  const waitForTemplateAnalysis = async (templateId: number) => {
    const maxAttempts = 150; // 150 × 2 seconds = 5 minutes

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(`${API_BASE}/templates`, {
          headers: {
            Accept: "application/json",
          },
          cache: "no-store",
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Failed to refresh templates.");
        }

        const latestTemplates: Template[] = data.templates ?? [];
        setTemplates(latestTemplates);

        const latestTemplate = latestTemplates.find(
          (template) => template.id === templateId
        );

        if (latestTemplate && latestTemplate.slots.length > 0) {
          setMessage(
            `Template analyzed successfully. ${latestTemplate.slots.length} clip slots are ready.`
          );
          return true;
        }
      } catch (err) {
        console.error("Template analysis polling error:", err);
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    setMessage(
      "Template was created, but analysis is still pending. Keep the analysis worker running and refresh later."
    );

    return false;
  };

  // ---------------------------------------------------------
  // FILTER
  // ---------------------------------------------------------

  const filteredTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return templates;

    return templates.filter((template) => {
      return [
        template.name,
        template.description ?? "",
        template.engine,
        `${template.slots.length} clips`,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [templates, search]);

  // ---------------------------------------------------------
  // CREATE MODAL
  // ---------------------------------------------------------

    const openCreateModal = () => {
    console.log("New Template clicked");

    setEditingTemplate(null);
    setName("");
    setDescription("");
    setAepFile(null);
    setPreviewFile(null);
    setMessage("");
    setError("");

    // Open modal
    setShowCreateModal(true);
    };

  const closeModal = () => {
    if (saving) return;

    setShowCreateModal(false);
    setEditingTemplate(null);
    setName("");
    setDescription("");
    setAepFile(null);
    setPreviewFile(null);
    setMessage("");
    setError("");

    if (aepInputRef.current) {
      aepInputRef.current.value = "";
    }

    if (previewInputRef.current) {
      previewInputRef.current.value = "";
    }
  };

  // ---------------------------------------------------------
  // EDIT
  // ---------------------------------------------------------

  const openEditModal = (template: Template) => {
    setEditingTemplate(template);
    setName(template.name);
    setDescription(template.description ?? "");
    setAepFile(null);
    setPreviewFile(null);
    setMessage("");
    setError("");
    setShowCreateModal(true);
  };

  // ---------------------------------------------------------
  // CREATE
  // ---------------------------------------------------------

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Please enter a template name.");
      return;
    }

    if (!editingTemplate && !aepFile) {
      setError("Please select an AEP file.");
      return;
    }

    if (!editingTemplate && !previewFile) {
      setError("Please select a preview video.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setMessage("");

      if (editingTemplate) {
        // ---------------------------------------------
        // UPDATE EXISTING TEMPLATE
        // ---------------------------------------------

        const response = await fetch(
          `${API_BASE}/templates/${editingTemplate.id}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              name: name.trim(),
              description: description.trim() || null,
            }),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Failed to update template.");
        }

        // ---------------------------------------------
        // REPLACE PREVIEW IF SELECTED
        // ---------------------------------------------

        if (previewFile) {
          const previewForm = new FormData();
          previewForm.append("preview", previewFile);

          const previewResponse = await fetch(
            `${API_BASE}/templates/${editingTemplate.id}/preview`,
            {
              method: "POST",
              headers: {
                Accept: "application/json",
              },
              body: previewForm,
            }
          );

          const previewData = await previewResponse.json();

          if (!previewResponse.ok) {
            throw new Error(
              previewData.message || "Failed to replace preview."
            );
          }
        }

        setMessage("Template updated successfully.");

        await loadTemplates();

        setTimeout(() => {
          closeModal();
        }, 700);

        return;
      }

      // ---------------------------------------------
      // CREATE NEW TEMPLATE
      // ---------------------------------------------

      const formData = new FormData();

      formData.append("name", name.trim());

      if (description.trim()) {
        formData.append("description", description.trim());
      }

      formData.append("aep", aepFile!);
      formData.append("preview", previewFile!);

      const response = await fetch(`${API_BASE}/templates`, {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Failed to create template."
        );
      }

      const createdTemplate: Template | null = data.template ?? null;

      if (data.analysis_pending && createdTemplate?.id) {
        setMessage(
          "Template uploaded. After Effects is analyzing the template..."
        );

        // Close the upload modal while the background analysis runs.
        // The template card will update automatically when slots are ready.
        setShowCreateModal(false);

        await waitForTemplateAnalysis(createdTemplate.id);
      } else {
        setMessage("Template created successfully.");
        await loadTemplates();

        setTimeout(() => {
          closeModal();
        }, 700);
      }
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong."
      );
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------
  // DELETE
  // ---------------------------------------------------------

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      setSaving(true);
      setError("");

      const response = await fetch(
        `${API_BASE}/templates/${deleteTarget.id}`,
        {
          method: "DELETE",
          headers: {
            Accept: "application/json",
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Failed to delete template."
        );
      }

      setTemplates((previous) =>
        previous.filter(
          (template) => template.id !== deleteTarget.id
        )
      );

      setDeleteTarget(null);
      setMessage("Template deleted successfully.");
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to delete template."
      );
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------
  // FILE HELPERS
  // ---------------------------------------------------------

  const handleAepChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".aep")) {
      setError("Please select an After Effects .aep file.");
      event.target.value = "";
      return;
    }

    setError("");
    setAepFile(file);
  };

  const handlePreviewChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("video/")) {
      setError("Please select a video preview file.");
      event.target.value = "";
      return;
    }

    setError("");
    setPreviewFile(file);
  };

  // ---------------------------------------------------------
  // UI
  // ---------------------------------------------------------

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Background decoration */}

      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute right-0 top-40 h-96 w-96 rounded-full bg-purple-600/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-[1600px] px-5 py-8 sm:px-8">
        {/* HEADER */}

        <header className="mb-8">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
            <div>
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 text-xl shadow-lg shadow-blue-500/20">
                  ✦
                </div>

                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-400">
                    Creative Workspace
                  </p>

                  <h1 className="text-3xl font-black tracking-tight">
                    Template Management
                  </h1>
                </div>
              </div>

              <p className="max-w-xl text-sm text-slate-400">
                Manage your After Effects templates, previews and
                creative assets from one place.
              </p>
            </div>

                <button
                type="button"
                onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    openCreateModal();
                }}
                className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0"
                >
                <span className="text-xl transition-transform duration-200 group-hover:rotate-90">
                    +
                </span>

                New Template
                </button>
          </div>
        </header>

        {/* STATS */}

        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Templates
            </p>

            <p className="mt-1 text-2xl font-black">
              {templates.length}
            </p>
          </div>

          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.06] p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-400">
              Clip Slots
            </p>

            <p className="mt-1 text-2xl font-black">
              {templates.reduce(
                (total, template) =>
                  total + template.slots.length,
                0
              )}
            </p>
          </div>

          <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.06] p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-400">
              After Effects
            </p>

            <p className="mt-1 text-2xl font-black">
              {templates.filter(
                (template) => template.engine === "after-effects"
              ).length}
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              With Preview
            </p>

            <p className="mt-1 text-2xl font-black">
              {
                templates.filter(
                  (template) => Boolean(template.preview_path)
                ).length
              }
            </p>
          </div>
        </div>

        {/* TOOLBAR */}

        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
              ⌕
            </span>

            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search templates..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
            />
          </div>

          <div className="flex items-center justify-center rounded-xl bg-white/[0.05] px-4 text-sm text-slate-400">
            <span className="font-bold text-white">
              {filteredTemplates.length}
            </span>
            <span className="ml-1">
              {filteredTemplates.length === 1
                ? "template"
                : "templates"}
            </span>
          </div>
        </div>

        {/* GLOBAL MESSAGE */}

        {message && (
          <div className="mb-5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-300">
            ✓ {message}
          </div>
        )}

        {error && !showCreateModal && (
          <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-300">
            {error}
          </div>
        )}

        {/* TEMPLATE GRID */}

        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]"
              >
                <div className="aspect-[3/4] animate-pulse bg-white/[0.06]" />

                <div className="space-y-3 p-4">
                  <div className="h-4 animate-pulse rounded bg-white/[0.08]" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-white/[0.06]" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-6 py-20 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 text-3xl">
              ✦
            </div>

            <h2 className="mt-5 text-lg font-bold">
              {search
                ? "No matching templates"
                : "No templates yet"}
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              {search
                ? "Try another search."
                : "Create your first After Effects template."}
            </p>

            {!search && (
              <button
                type="button"
                onClick={openCreateModal}
                className="mt-5 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold hover:bg-blue-500"
              >
                Create Template
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {filteredTemplates.map((template) => {
              const previewUrl = getPreviewUrl(template);

              return (
                <div
                  key={template.id}
                  className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045] shadow-xl shadow-black/10 backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-blue-500/40 hover:bg-white/[0.07] hover:shadow-blue-500/10"
                >
                  {/* PREVIEW */}

                  <div className="relative aspect-[3/4] overflow-hidden bg-black">
                    {previewUrl ? (
                      <video
                        src={previewUrl}
                        muted
                        loop
                        playsInline
                        preload="metadata"
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        onMouseEnter={(event) => {
                          void event.currentTarget
                            .play()
                            .catch(() => {});
                        }}
                        onMouseLeave={(event) => {
                          event.currentTarget.pause();
                          event.currentTarget.currentTime = 0;
                        }}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-gradient-to-br from-blue-950 via-slate-950 to-violet-950">
                        <span className="text-4xl text-white/20">
                          ▶
                        </span>
                      </div>
                    )}

                    {/* gradient */}

                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/20" />

                    {/* ID */}

                    <span className="absolute left-3 top-3 rounded-lg border border-white/10 bg-black/50 px-2 py-1 text-[10px] font-bold text-white backdrop-blur">
                      #{template.id}
                    </span>

                    {/* clips */}

                    <span className="absolute right-3 top-3 rounded-full bg-blue-500/90 px-2.5 py-1 text-[10px] font-bold text-white shadow-lg">
                      {template.slots.length} clips
                    </span>

                    {/* bottom info */}

                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <p className="truncate text-sm font-black text-white">
                        {template.name}
                      </p>

                      <p className="mt-1 text-[10px] font-medium text-slate-300">
                        {template.width && template.height
                          ? `${template.width} × ${template.height}`
                          : "Composition"}
                        {template.fps
                          ? ` · ${template.fps} FPS`
                          : ""}
                      </p>
                    </div>
                  </div>

                  {/* CARD CONTENT */}

                  <div className="p-3">
                    {template.description && (
                      <p className="mb-3 line-clamp-2 text-[11px] leading-4 text-slate-500">
                        {template.description}
                      </p>
                    )}

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          openEditModal(template)
                        }
                        className="flex-1 rounded-lg border border-white/10 bg-white/[0.05] px-2 py-2 text-xs font-bold text-slate-300 transition hover:border-blue-500/30 hover:bg-blue-500/10 hover:text-blue-300"
                      >
                        Edit
                      </button>

                        <button
                        type="button"
                        onClick={() => {
                            setDeleteTarget(template);
                        }}
                        className="rounded-lg border border-red-500/10 bg-red-500/[0.04] px-3 py-2 text-xs font-bold text-red-400 transition hover:bg-red-500/10"
                        >
                        🗑
                        </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* =====================================================
          CREATE / EDIT MODAL
      ====================================================== */}
        {showCreateModal &&
  createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div
        className="relative w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              {editingTemplate ? "Edit Template" : "Create New Template"}
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              {editingTemplate
                ? "Update your template information and preview."
                : "Upload an After Effects template and preview video."}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowCreateModal(false)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-500 transition hover:bg-slate-200 hover:text-slate-900"
          >
            ×
          </button>
        </div>

        {/* Name */}
        <div className="mb-5">
          <label className="mb-2 block text-sm font-semibold text-slate-700">
            Template Name
          </label>

          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Baila Lento"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
          />
        </div>

        {/* Description */}
        <div className="mb-5">
          <label className="mb-2 block text-sm font-semibold text-slate-700">
            Description
          </label>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe this template..."
            rows={3}
            className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
          />
        </div>

        {/* Create-only files */}
        {!editingTemplate && (
          <div className="grid gap-4 sm:grid-cols-2">
            {/* AEP */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                After Effects File
              </label>

              <button
                type="button"
                onClick={() => aepInputRef.current?.click()}
                className="flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center transition hover:border-blue-400 hover:bg-blue-50"
              >
                <span className="mb-2 text-3xl">🎬</span>

                <span className="text-sm font-semibold text-slate-700">
                  {aepFile ? aepFile.name : "Choose .aep file"}
                </span>

                {!aepFile && (
                  <span className="mt-1 text-xs text-slate-400">
                    After Effects project
                  </span>
                )}
              </button>

              <input
                ref={aepInputRef}
                type="file"
                accept=".aep"
                className="hidden"
                onChange={handleAepChange}
              />
            </div>

            {/* Preview */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Preview Video
              </label>

              <button
                type="button"
                onClick={() => previewInputRef.current?.click()}
                className="flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center transition hover:border-violet-400 hover:bg-violet-50"
              >
                <span className="mb-2 text-3xl">🎥</span>

                <span className="text-sm font-semibold text-slate-700">
                  {previewFile ? previewFile.name : "Choose preview video"}
                </span>

                {!previewFile && (
                  <span className="mt-1 text-xs text-slate-400">
                    MP4 recommended
                  </span>
                )}
              </button>

              <input
                ref={previewInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handlePreviewChange}
              />
            </div>
          </div>
        )}

        {/* Edit preview replacement */}
        {editingTemplate && (
          <div className="mb-5">
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Replace Preview
            </label>

            <button
              type="button"
              onClick={() => previewInputRef.current?.click()}
              className="w-full rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center transition hover:border-violet-400 hover:bg-violet-50"
            >
              <span className="text-sm font-semibold text-slate-700">
                {previewFile
                  ? previewFile.name
                  : "Click to choose a new preview video"}
              </span>
            </button>

            <input
              ref={previewInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handlePreviewChange}
            />
          </div>
        )}

        {/* Messages */}
        {error && (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {message && (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-600">
            {message}
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setShowCreateModal(false)}
            className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleCreate}
            disabled={saving}
            className="rounded-xl bg-gradient-to-r from-blue-500 to-violet-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving
              ? "Saving..."
              : editingTemplate
                ? "Save Changes"
                : "Create Template"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )}

  {/* =====================================================
      DELETE CONFIRMATION MODAL
  ====================================================== */}
  {deleteTarget &&
    createPortal(
      <div
        className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        onClick={() => {
          if (!saving) {
            setDeleteTarget(null);
          }
        }}
      >
        <div
          className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-xl">
            🗑️
          </div>

          <h2 className="mt-5 text-xl font-black text-slate-900">
            Delete template?
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            You are about to delete{" "}
            <span className="font-bold text-slate-900">
              {deleteTarget.name}
            </span>
            . This action cannot be undone.
          </p>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              disabled={saving}
              className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-red-500/20 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Deleting..." : "Delete Template"}
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}

    </div>
  );
}