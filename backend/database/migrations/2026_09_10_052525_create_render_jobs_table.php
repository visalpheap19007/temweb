<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('render_jobs', function (Blueprint $table) {
                    $table->id();

        $table->foreignId('video_id')
            ->constrained('videos')
            ->cascadeOnDelete();

        $table->foreignId('preset_id')
            ->constrained('presets')
            ->cascadeOnDelete();

        $table->string('status')->default('queued');

        $table->string('job_path')->nullable();

        $table->string('output_path')->nullable();

        $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('render_jobs');
    }
};
