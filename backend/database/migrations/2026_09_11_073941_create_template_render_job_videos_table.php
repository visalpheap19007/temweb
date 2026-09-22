<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('template_render_job_videos', function (Blueprint $table) {
            $table->id();

            $table->foreignId('template_render_job_id')
                ->constrained('template_render_jobs')
                ->cascadeOnDelete();

            $table->foreignId('video_id')
                ->constrained('videos')
                ->cascadeOnDelete();

            $table->foreignId('template_slot_id')
                ->constrained('template_slots')
                ->cascadeOnDelete();

            $table->timestamps();

            $table->unique([
                'template_render_job_id',
                'template_slot_id',
            ]);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('template_render_job_videos');
    }
};