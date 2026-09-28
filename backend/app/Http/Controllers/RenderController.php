<?php

namespace App\Http\Controllers;

use App\Models\Preset;
use App\Models\RenderJob;
use App\Models\Video;
use Illuminate\Http\Request;
use Symfony\Component\Process\Process;
class RenderController extends Controller
{
    public function index()
{
    $jobs = RenderJob::with([
        'video',
        'preset',
    ])
    ->latest()
    ->get();

    return response()->json([
        'success' => true,
        'jobs' => $jobs,
    ]);
}
   public function render(Request $request)
{
    $request->validate([
        'video_id' => 'required|integer|exists:videos,id',
        'preset_id' => 'required|integer|exists:presets,id',
    ]);

    $video = Video::findOrFail($request->video_id);
    $preset = Preset::findOrFail($request->preset_id);

    // ==========================================
    // CHECK VIDEO
    // ==========================================

    $videoPath = storage_path(
        'app/public/' . $video->storage_path
    );

    if (!file_exists($videoPath)) {
        return response()->json([
            'success' => false,
            'message' => 'Video file not found.',
        ], 404);
    }


    // ==========================================
    // WORKER FOLDER
    // ==========================================

$workerPath = env(
    'AE_WORKER_PATH',
    'C:/Users/visal/OneDrive/Documents/ae-worker'
);


    // ==========================================
    // CREATE RENDER JOB
    // ==========================================

    $job = RenderJob::create([
        'video_id' => $video->id,
        'preset_id' => $preset->id,
        'status' => 'queued',
    ]);


    // ==========================================
    // CREATE UNIQUE JOB FOLDER
    // ==========================================

    $jobPath =
        $workerPath . '/jobs/job_' . $job->id;

    if (!is_dir($jobPath)) {
        mkdir($jobPath, 0777, true);
    }


    // ==========================================
    // TEMPLATE PATH
    // ==========================================

    $templatePath =
        $workerPath . '/' . $preset->template_path;

    if (!file_exists($templatePath)) {

        $job->update([
            'status' => 'failed',
        ]);

        return response()->json([
            'success' => false,
            'message' => 'After Effects template not found.',
            'template_path' => $templatePath,
        ], 404);
    }


    // ==========================================
    // OUTPUT FILES
    // ==========================================

    $outputProjectPath =
        $jobPath . '/generated.aep';

    $outputVideoPath =
        $jobPath . '/rendered.mp4';


    // ==========================================
    // CREATE CONFIG
    // ==========================================

    $configPath =
        $jobPath . '/render-config.txt';

    $config = implode(PHP_EOL, [
        $videoPath,
        $templatePath,
        $outputProjectPath,
        $outputVideoPath,
    ]);

    file_put_contents(
        $configPath,
        $config
    );


    // ==========================================
    // UPDATE JOB
    // ==========================================

    $job->update([
        'status' => 'queued',
        'job_path' => $jobPath,
        'output_path' => $outputVideoPath,
    ]);


    // ==========================================
    // UPDATE VIDEO
    // ==========================================

    $video->update([
        'status' => 'processing',
    ]);


    // ==========================================
    // RESPONSE
    // ==========================================

    return response()->json([
        'success' => true,
        'message' => 'Render job created successfully.',
        'job_id' => $job->id,
        'video_id' => $video->id,
        'preset_id' => $preset->id,
        'status' => $job->status,
        'job_path' => $job->job_path,
        'output_path' => $job->output_path,
    ], 202);
}

public function status(Request $request)
{
    $request->validate([
        'job_id' => 'required|integer|exists:render_jobs,id',
    ]);

    $job = RenderJob::with([
        'video',
        'preset',
    ])->findOrFail($request->job_id);

    return response()->json([
        'success' => true,
        'job_id' => $job->id,
        'video_id' => $job->video_id,
        'preset_id' => $job->preset_id,
        'status' => $job->status,
        'error_message' => $job->error_message,
    ]);
}


    public function video($id)
    {
        $job = RenderJob::findOrFail($id);

        $outputVideoPath = $job->output_path;

        if (!$outputVideoPath || !file_exists($outputVideoPath)) {
            return response()->json([
                'success' => false,
                'message' => 'Rendered video not found.',
            ], 404);
        }

        return response()->file($outputVideoPath);
    }

    public function updateStatus(Request $request, $id)
{
    $request->validate([
        'status' => 'required|in:queued,processing,completed,failed',
        'error_message' => 'nullable|string|max:5000',
    ]);

    $job = RenderJob::findOrFail($id);

    $status = $request->status;

    $job->update([
        'status' => $status,
        'error_message' => $request->error_message,
    ]);

    // Keep the related video status synchronized
    if ($status === 'completed') {
        $job->video->update([
            'status' => 'completed',
        ]);
    } elseif ($status === 'failed') {
        $job->video->update([
            'status' => 'failed',
        ]);
    } elseif (
        $status === 'processing' ||
        $status === 'queued'
    ) {
        $job->video->update([
            'status' => 'processing',
        ]);
    }

    return response()->json([
        'success' => true,
        'job_id' => $job->id,
        'video_id' => $job->video_id,
        'status' => $job->status,
        'error_message' => $job->error_message,
    ]);
}


    public function download($id)
    {
        $job = RenderJob::findOrFail($id);

        $outputVideoPath = $job->output_path;

        if (
            !$outputVideoPath ||
            !file_exists($outputVideoPath)
        ) {
            return response()->json([
                'success' => false,
                'message' => 'Rendered video not found.',
            ], 404);
        }

        $fileName = 'rendered-job-' . $job->id . '.mp4';

        return response()->download(
            $outputVideoPath,
            $fileName
        );
    }
      public function destroy($id)
{
    $job = RenderJob::findOrFail($id);

    // Delete the entire job folder and everything inside it
    if ($job->job_path && is_dir($job->job_path)) {
        $files = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator(
                $job->job_path,
                \FilesystemIterator::SKIP_DOTS
            ),
            \RecursiveIteratorIterator::CHILD_FIRST
        );

        foreach ($files as $file) {
            if ($file->isDir()) {
                rmdir($file->getRealPath());
            } else {
                unlink($file->getRealPath());
            }
        }

        rmdir($job->job_path);
    }

    // Delete database record
    $job->delete();

    return response()->json([
        'success' => true,
        'message' => 'Render job deleted successfully.',
        'job_id' => $id,
    ]);
}
    public function updateProgress(Request $request, $id)
    {
        $request->validate([
            'progress' => 'required|integer|min:0|max:100',
        ]);

        $job = RenderJob::findOrFail($id);

        $job->update([
            'progress' => $request->progress,
        ]);

        return response()->json([
            'success' => true,
            'job_id' => $job->id,
            'progress' => $job->progress,
        ]);
    }
}
