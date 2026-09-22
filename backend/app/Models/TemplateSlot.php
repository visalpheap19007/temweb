<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TemplateSlot extends Model
{
    protected $fillable = [
        'template_id',
        'slot_name',
        'slot_order',
        'required_frames',
        'fps',
        'width',
        'height',

        // Template timing metadata
        'target_duration',
        'target_frames',
        'original_video_duration',
        'original_video_frames',
        'original_video_fps',
        'is_precomp',
    ];

    protected $casts = [
        'required_frames' => 'integer',
        'fps' => 'float',
        'width' => 'integer',
        'height' => 'integer',

        'target_duration' => 'float',
        'target_frames' => 'integer',
        'original_video_duration' => 'float',
        'original_video_frames' => 'integer',
        'original_video_fps' => 'float',
        'is_precomp' => 'boolean',
    ];

    public function template()
    {
        return $this->belongsTo(Template::class);
    }
}