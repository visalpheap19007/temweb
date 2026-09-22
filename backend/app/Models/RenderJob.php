<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RenderJob extends Model
{
    protected $fillable = [
        'video_id',
        'preset_id',
        'status',
        'progress',
        'error_message',
        'job_path',
        'output_path',
    ];
    public function video()
    {
        return $this->belongsTo(Video::class);
    }

    public function preset()
    {
        return $this->belongsTo(Preset::class);
    }
}
