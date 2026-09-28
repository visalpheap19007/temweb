<?php

namespace App\Http\Controllers;

use App\Models\Template;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class TemplateController extends Controller
{
    public function index()
    {
        $templates = Template::with('slots')
            ->orderBy('id')
            ->get();

        return response()->json([
            'success' => true,
            'templates' => $templates,
        ]);
    }

    public function show($id)
    {
        $template = Template::with('slots')
            ->findOrFail($id);

        return response()->json([
            'success' => true,
            'template' => $template,
        ]);
    }

    /**
     * Create a new template.
     *
     * Stage 1:
     * - Upload AEP
     * - Upload preview video
     * - Create template database record
     * - Create template storage folder
     */

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'aep' => [
                'required',
                'file',
                'max:512000',
            ],
            'preview' => [
                'required',
                'file',
                'mimes:mp4,mov,webm',
                'max:512000',
            ],
        ]);

        /*
        * ---------------------------------------------------------
        * CREATE UNIQUE TEMPLATE FOLDER
        * ---------------------------------------------------------
        */

        $folderName = Str::slug($validated['name']);

        $baseFolder = "template/{$folderName}";
        $folder = $baseFolder;

        $counter = 2;

        while (
            Storage::disk('public')->exists("{$folder}/template.aep") ||
            Storage::disk('public')->exists("{$folder}/preview.mp4")
        ) {
            $folder = "{$baseFolder}-{$counter}";
            $counter++;
        }

        /*
        * ---------------------------------------------------------
        * CREATE PHYSICAL DIRECTORY
        * ---------------------------------------------------------
        */

        $absoluteFolder = storage_path(
            'app/public/' . $folder
        );

        if (!is_dir($absoluteFolder)) {
            mkdir($absoluteFolder, 0777, true);
        }

        /*
        * ---------------------------------------------------------
        * STORE AEP
        * ---------------------------------------------------------
        *
        * Use the uploaded file directly instead of relying on
        * Storage::storeAs() to move the large AEP file.
        */

        $aepFile = $request->file('aep');

        if (!$aepFile || !$aepFile->isValid()) {
            return response()->json([
                'success' => false,
                'message' => 'The AEP upload is invalid.',
            ], 422);
        }

        $aepFile->move(
            $absoluteFolder,
            'template.aep'
        );

        $aepPath = "{$folder}/template.aep";

        /*
        * ---------------------------------------------------------
        * VERIFY AEP EXISTS
        * ---------------------------------------------------------
        */

        if (!file_exists($absoluteFolder . DIRECTORY_SEPARATOR . 'template.aep')) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to save template.aep.',
            ], 500);
        }

        /*
        * ---------------------------------------------------------
        * STORE PREVIEW
        * ---------------------------------------------------------
        */

        $previewExtension =
            $request->file('preview')->getClientOriginalExtension();

        $previewPath = $request->file('preview')->storeAs(
            $folder,
            'preview.' . $previewExtension,
            'public'
        );

        if (!$previewPath || !Storage::disk('public')->exists($previewPath)) {
            // Remove AEP if preview failed
            Storage::disk('public')->delete($aepPath);

            return response()->json([
                'success' => false,
                'message' => 'Failed to save preview video.',
            ], 500);
        }

        /*
        * ---------------------------------------------------------
        * CREATE TEMPLATE DATABASE RECORD
        * ---------------------------------------------------------
        */

        $template = Template::create([
            'name' => $validated['name'],
            'template_path' => $aepPath,
            'engine' => 'after-effects',
            'description' => $validated['description'] ?? null,
            'clip_count' => 0,
            'preview_path' => $previewPath,
        ]);

        /*
        * ---------------------------------------------------------
        * CREATE ANALYSIS JOB
        * ---------------------------------------------------------
        */

        $jobId = (string) Str::uuid();

        $aeWorkerPath = env(
            'AE_WORKER_PATH',
            'C:\\Users\\visal\\OneDrive\\Documents\\ae-worker'
        );

        $jobDirectory =
            $aeWorkerPath .
            '\\analysis-jobs\\' .
            $jobId;

        if (!is_dir($jobDirectory)) {
            mkdir($jobDirectory, 0777, true);
        }

        /*
        * Exact Windows path to uploaded AEP.
        */

        $aepAbsolutePath =
            storage_path(
                'app/public/' . $aepPath
            );

        /*
        * Unique output file for this analysis.
        */

        $outputJsonPath =
            $jobDirectory .
            '\\analysis-output.json';

        /*
        * Analyzer config.
        */

        $analysisConfig = [
            'job_id' =>
                $jobId,

            'template_id' =>
                $template->id,

            'input_aep_path' =>
                str_replace(
                    '\\',
                    '/',
                    $aepAbsolutePath
                ),

            'output_json_path' =>
                str_replace(
                    '\\',
                    '/',
                    $outputJsonPath
                ),
        ];

        file_put_contents(
            $jobDirectory . '\\analysis-config.json',
            json_encode(
                $analysisConfig,
                JSON_PRETTY_PRINT |
                JSON_UNESCAPED_SLASHES
            )
        );

        /*
        * ---------------------------------------------------------
        * RETURN IMMEDIATELY
        * ---------------------------------------------------------
        */

        return response()->json([
            'success' => true,

            'message' =>
                'Template uploaded. Analysis is running.',

            'analysis_pending' =>
                true,

            'job_id' =>
                $jobId,

            'template' =>
                $template->load('slots'),
        ], 201);
    }

        public function update(Request $request, $id)
    {
        $template = Template::findOrFail($id);

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
        ]);

        $template->update([
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
        ]);

        $template->load('slots');

        return response()->json([
            'success' => true,
            'message' => 'Template updated successfully.',
            'template' => $template,
        ]);
    }
        public function uploadPreview(Request $request, $id)
    {
        $template = Template::findOrFail($id);

        $validated = $request->validate([
            'preview' => 'required|file|mimes:mp4,mov,webm|max:512000',
        ]);

        if (!$template->template_path) {
            return response()->json([
                'success' => false,
                'message' => 'Template path was not found.',
            ], 422);
        }

        $folder = dirname($template->template_path);

        // Delete old preview
        if (
            $template->preview_path &&
            Storage::disk('public')->exists($template->preview_path)
        ) {
            Storage::disk('public')->delete($template->preview_path);
        }

        $extension = $validated['preview']->getClientOriginalExtension();

        $previewPath = $validated['preview']->storeAs(
            $folder,
            'preview.' . $extension,
            'public'
        );

        $template->update([
            'preview_path' => $previewPath,
        ]);

        $template->load('slots');

        return response()->json([
            'success' => true,
            'message' => 'Preview replaced successfully.',
            'template' => $template,
        ]);
    }
        public function destroy($id)
    {
        $template = Template::findOrFail($id);

        $folder = null;

        if ($template->template_path) {
            $folder = dirname($template->template_path);
        }

        // Delete database record first
        $template->delete();

        // Delete AEP + preview folder
        if (
            $folder &&
            Storage::disk('public')->exists($folder)
        ) {
            Storage::disk('public')->deleteDirectory($folder);
        }

        return response()->json([
            'success' => true,
            'message' => 'Template deleted successfully.',
        ]);
    }
}