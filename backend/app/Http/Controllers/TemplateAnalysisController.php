<?php

namespace App\Http\Controllers;

use App\Models\Template;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class TemplateAnalysisController extends Controller
{
    public function complete(Request $request)
    {
        $validated = $request->validate([
            'job_id' => ['required', 'string'],
            'template_id' => ['required', 'integer', 'exists:templates,id'],
            'success' => ['required', 'boolean'],
            'analysis' => ['required', 'array'],
        ]);

        if (!$validated['success']) {
            return response()->json([
                'success' => false,
                'message' => 'Template analysis failed.',
            ], 422);
        }

        $template = Template::findOrFail(
            $validated['template_id']
        );

        $analysis = $validated['analysis'];

        if (
            !isset($analysis['composition']) ||
            !isset($analysis['slots']) ||
            !is_array($analysis['slots'])
        ) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid template analysis result.',
            ], 422);
        }

        if (count($analysis['slots']) === 0) {
            return response()->json([
                'success' => false,
                'message' => 'No template slots were detected.',
            ], 422);
        }

        DB::transaction(function () use ($template, $analysis) {

            /*
             * Remove slots from previous analysis.
             */
            $template->slots()->delete();

            /*
             * Save every slot detected from the AEP.
             */
            foreach ($analysis['slots'] as $slot) {

                $template->slots()->create([
                    'slot_name' => $slot['slot_name'],
                    'slot_order' => (int) $slot['slot_order'],

                    // Existing fields
                    'required_frames' => (int) $slot['required_frames'],
                    'fps' => (float) $slot['fps'],
                    'width' => (int) $slot['width'],
                    'height' => (int) $slot['height'],

                    // New timing fields
                    'target_duration' => isset($slot['target_duration'])
                        ? (float) $slot['target_duration']
                        : null,

                    'target_frames' => isset($slot['target_frames'])
                        ? (int) $slot['target_frames']
                        : null,

                    'original_video_duration' => isset($slot['original_video_duration'])
                        ? (float) $slot['original_video_duration']
                        : null,

                    'original_video_frames' => isset($slot['original_video_frames'])
                        ? (int) $slot['original_video_frames']
                        : null,

                    'original_video_fps' => isset($slot['original_video_fps'])
                        ? (float) $slot['original_video_fps']
                        : null,

                    'is_precomp' => isset($slot['is_precomp'])
                        ? (bool) $slot['is_precomp']
                        : false,
                ]);
            }

            /*
             * Keep clip_count for compatibility.
             * The application should use slots.count().
             */
            $template->update([
                'clip_count' => count($analysis['slots']),
            ]);
        });

        $template->load('slots');

        return response()->json([
            'success' => true,
            'message' => 'Template analysis completed.',
            'template' => $template,
        ]);
    }
}