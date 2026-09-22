<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TemplateRenderJobVideo extends Model
{
    protected $fillable = [
        'template_render_job_id',
        'video_id',
        'template_slot_id',
        'start_frame',
        'end_frame',
        'crop_scale',
        'crop_x',
        'crop_y',
    ];

    protected $casts = [
        'template_render_job_id' => 'integer',
        'video_id' => 'integer',
        'template_slot_id' => 'integer',
        'start_frame' => 'integer',
        'end_frame' => 'integer',
        'crop_scale' => 'float',
        'crop_x' => 'float',
        'crop_y' => 'float',
    ];

    public function renderJob()
    {
        return $this->belongsTo(
            TemplateRenderJob::class,
            'template_render_job_id'
        );
    }

    public function video()
    {
        return $this->belongsTo(Video::class);
    }

    public function slot()
    {
        return $this->belongsTo(
            TemplateSlot::class,
            'template_slot_id'
        );
    }
}
