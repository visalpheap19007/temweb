<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TemplateRenderJob extends Model
{
    protected $fillable = [
        'template_id',
        'status',
        'error_message',
        'job_path',
        'output_path',
    ];

    public function template()
    {
        return $this->belongsTo(Template::class);
    }

    public function videos()
    {
        return $this->hasMany(
            TemplateRenderJobVideo::class,
            'template_render_job_id'
        );
    }
}