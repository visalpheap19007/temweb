<?php

namespace App\Http\Controllers;

use App\Models\Template;
use App\Models\TemplateRenderJob;
use App\Models\TemplateRenderJobVideo;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class TemplateRenderController extends Controller
{
    public function createJob(Request $request)
    {
        /*
        |--------------------------------------------------------------------------
        | Validate request
        |--------------------------------------------------------------------------
        */

        $request->validate([
            'template_id' => 'required|integer|exists:templates,id',

            'clips' => 'required|array|min:1',

            'clips.*.slot_id' => [
                'required',
                'integer',
                'exists:template_slots,id',
            ],

            'clips.*.video_id' => [
                'required',
                'integer',
                'exists:videos,id',
            ],

            'clips.*.start_frame' => [
                'required',
                'integer',
                'min:0',
            ],

            'clips.*.end_frame' => [
                'required',
                'integer',
                'min:1',
            ],

            // Crop settings
            'clips.*.crop_scale' => [
                'nullable',
                'numeric',
                'min:1',
                'max:3',
            ],

            'clips.*.crop_x' => [
                'nullable',
                'numeric',
                'min:-100',
                'max:100',
            ],

            'clips.*.crop_y' => [
                'nullable',
                'numeric',
                'min:-100',
                'max:100',
            ],
        ]);

        /*
        |--------------------------------------------------------------------------
        | Load template with slots
        |--------------------------------------------------------------------------
        */

        $template = Template::with('slots')
            ->findOrFail($request->template_id);

        /*
        |--------------------------------------------------------------------------
        | Make sure template has slots
        |--------------------------------------------------------------------------
        */

        if ($template->slots->count() === 0) {
            return response()->json([
                'success' => false,
                'message' => 'This template has no configured slots.',
            ], 422);
        }

        /*
        |--------------------------------------------------------------------------
        | Template slot IDs
        |--------------------------------------------------------------------------
        */

        $templateSlotIds = $template->slots
            ->pluck('id')
            ->toArray();

        /*
        |--------------------------------------------------------------------------
        | Check clips
        |--------------------------------------------------------------------------
        */

        foreach ($request->clips as $clip) {

            /*
            |--------------------------------------------------------------------------
            | Check slot belongs to this template
            |--------------------------------------------------------------------------
            */

            if (!in_array($clip['slot_id'], $templateSlotIds)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Invalid slot for this template.',
                    'slot_id' => $clip['slot_id'],
                ], 422);
            }

            /*
            |--------------------------------------------------------------------------
            | Check frame range
            |--------------------------------------------------------------------------
            */

            if ($clip['end_frame'] <= $clip['start_frame']) {
                return response()->json([
                    'success' => false,
                    'message' => 'End frame must be greater than start frame.',
                    'slot_id' => $clip['slot_id'],
                    'start_frame' => $clip['start_frame'],
                    'end_frame' => $clip['end_frame'],
                ], 422);
            }
        }

        /*
        |--------------------------------------------------------------------------
        | Check duplicate slots
        |--------------------------------------------------------------------------
        */

        $slotIds = collect($request->clips)
            ->pluck('slot_id')
            ->toArray();

        if (count($slotIds) !== count(array_unique($slotIds))) {
            return response()->json([
                'success' => false,
                'message' => 'A template slot can only be used once.',
            ], 422);
        }

        /*
        |--------------------------------------------------------------------------
        | Check that every required slot was uploaded
        |--------------------------------------------------------------------------
        */

        if (count($request->clips) !== $template->slots->count()) {
            return response()->json([
                'success' => false,
                'message' => 'Please upload a video for every template slot.',
                'required_clips' => $template->slots->count(),
                'received_clips' => count($request->clips),
            ], 422);
        }

        /*
        |--------------------------------------------------------------------------
        | Check every template slot exists in request
        |--------------------------------------------------------------------------
        */

        $missingSlotIds = array_diff(
            $templateSlotIds,
            $slotIds
        );

        if (!empty($missingSlotIds)) {
            return response()->json([
                'success' => false,
                'message' => 'One or more template slots are missing.',
                'missing_slot_ids' => array_values($missingSlotIds),
            ], 422);
        }

        /*
        |--------------------------------------------------------------------------
        | Check selected duration against the template VIDEO layer duration
        |--------------------------------------------------------------------------
        |
        | IMPORTANT:
        |
        | required_frames = PRECOMP / render target duration.
        | original_video_frames = fixed selection duration of the template
        | video layer inside that precomp.
        |
        | Example:
        |   precomp target       = 32 frames
        |   video layer source   = 16 frames
        |   selected range       = 16 frames
        |
        | The selected 16-frame source is later time-stretched by the AE
        | renderer to fill the 32-frame precomp.
        |
        */

        foreach ($request->clips as $clip) {

            $slot = $template->slots
                ->firstWhere('id', $clip['slot_id']);

            if (!$slot) {
                return response()->json([
                    'success' => false,
                    'message' => 'Template slot not found.',
                    'slot_id' => $clip['slot_id'],
                ], 422);
            }

            $selectedFrames =
                $clip['end_frame'] - $clip['start_frame'];

            /*
            |--------------------------------------------------------------------------
            | The frontend selection is the original template video length.
            |--------------------------------------------------------------------------
            */

            $selectionFrames =
                $slot->original_video_frames;

            // Backward compatibility for older slots that do not yet have
            // original_video_frames stored.
            if (!$selectionFrames || $selectionFrames <= 0) {
                $selectionFrames = $slot->required_frames;
            }

            if (!$selectionFrames || $selectionFrames <= 0) {
                return response()->json([
                    'success' => false,
                    'message' => 'Template slot has invalid video selection frame configuration.',
                    'slot_id' => $slot->id,
                ], 422);
            }

            /*
            |--------------------------------------------------------------------------
            | Selected duration must exactly match the fixed template-video
            | selection duration. The precomp target may be longer.
            |--------------------------------------------------------------------------
            */

            if ($selectedFrames !== (int) $selectionFrames) {
                return response()->json([
                    'success' => false,
                    'message' => 'Selected video duration does not match the template video selection duration.',
                    'slot_id' => $slot->id,
                    'selection_frames' => (int) $selectionFrames,
                    'required_frames' => $slot->required_frames,
                    'selected_frames' => $selectedFrames,
                ], 422);
            }
        }

        /*
        |--------------------------------------------------------------------------
        | Create render job
        |--------------------------------------------------------------------------
        */

        $job = DB::transaction(function () use ($request, $template) {

            /*
            |--------------------------------------------------------------------------
            | Create main render job
            |--------------------------------------------------------------------------
            */

            $job = TemplateRenderJob::create([
                'template_id' => $template->id,
                'status' => 'queued',
            ]);

            /*
            |--------------------------------------------------------------------------
            | Create video mappings
            |--------------------------------------------------------------------------
            */

            foreach ($request->clips as $clip) {

                TemplateRenderJobVideo::create([
                    'template_render_job_id' => $job->id,
                    'video_id' => $clip['video_id'],
                    'template_slot_id' => $clip['slot_id'],

                    /*
                    | Trim selection
                    */

                    'start_frame' => $clip['start_frame'],
                    'end_frame' => $clip['end_frame'],

                    // Crop settings
                    'crop_scale' => $clip['crop_scale'] ?? 1,
                    'crop_x' => $clip['crop_x'] ?? 0,
                    'crop_y' => $clip['crop_y'] ?? 0,
                ]);
            }

            return $job;
        });

        /*
        |--------------------------------------------------------------------------
        | Load relationships
        |--------------------------------------------------------------------------
        */

        $job->load([
            'template',
            'videos.video',
            'videos.slot',
        ]);

        /*
        |--------------------------------------------------------------------------
        | Return response
        |--------------------------------------------------------------------------
        */

        return response()->json([
            'success' => true,
            'message' => 'Template render job created successfully.',
            'job' => $job,
        ], 202);
    }
        public function workerJobs()
    {
        $job = TemplateRenderJob::with([
            'template',
            'videos.video',
            'videos.slot',
        ])
        ->where('status', 'queued')
        ->orderBy('id')
        ->first();

        if (!$job) {
            return response()->json([
                'success' => true,
                'job' => null,
            ]);
        }

        return response()->json([
            'success' => true,
            'job' => $job,
        ]);
    }

    public function status($id)
    {
        $job = TemplateRenderJob::with([
            'template',
            'videos.video',
            'videos.slot',
        ])->findOrFail($id);

        return response()->json([
            'success' => true,
            'job' => [
                'id' => $job->id,
                'template_id' => $job->template_id,
                'status' => $job->status,
                'error_message' => $job->error_message,
                'output_path' => $job->output_path,
                'created_at' => $job->created_at,
                'updated_at' => $job->updated_at,
            ],
        ]);
    }

    public function updateStatus(Request $request, $id)
    {
        $request->validate([
            'status' => 'required|in:queued,processing,completed,failed',
            'error_message' => 'nullable|string|max:5000',
        ]);

        $job = TemplateRenderJob::findOrFail($id);

        $job->update([
            'status' => $request->status,
            'error_message' => $request->error_message,
        ]);

        return response()->json([
            'success' => true,
            'job_id' => $job->id,
            'status' => $job->status,
            'error_message' => $job->error_message,
        ]);
    }
    public function video($id)
    {
        $job = TemplateRenderJob::findOrFail($id);

        if ($job->status !== 'completed') {
            return response()->json([
                'success' => false,
                'message' => 'Video is not ready yet.',
            ], 404);
        }

        $workerPath = env(
            'AE_WORKER_PATH',
            'C:\\Users\\visal\\OneDrive\\Documents\\ae-worker'
        );

        $videoPath = $workerPath
            . DIRECTORY_SEPARATOR
            . 'template-jobs'
            . DIRECTORY_SEPARATOR
            . 'job_' . $job->id
            . DIRECTORY_SEPARATOR
            . 'rendered.mp4';

        if (!is_file($videoPath) || !is_readable($videoPath)) {
            return response()->json([
                'success' => false,
                'message' => 'Rendered video file was not found.',
            ], 404);
        }

        return response()->file($videoPath, [
            'Content-Type' => 'video/mp4',
            'Content-Disposition' => 'inline; filename="rendered.mp4"',
            'Accept-Ranges' => 'bytes',
            'Cache-Control' => 'public, max-age=3600',
        ]);
    }

    public function index()
    {
        $jobs = TemplateRenderJob::with('template')
            ->orderByDesc('id')
            ->get();

        return response()->json([
            'success' => true,
            'jobs' => $jobs,
        ]);
    }
}
