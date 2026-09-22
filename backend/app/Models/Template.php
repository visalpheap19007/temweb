<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Template extends Model
{
    protected $fillable = [
        'name',
        'template_path',
        'engine',
        'description',
        'clip_count',
        'preview_path',
    ];

    public function slots()
    {
        return $this->hasMany(TemplateSlot::class)
            ->orderBy('slot_order');
    }

    public function renderJobs()
    {
        return $this->hasMany(TemplateRenderJob::class);
    }
}
