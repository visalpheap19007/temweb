<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('template_slots', function (Blueprint $table) {
            $table->decimal('target_duration', 10, 4)->nullable();
            $table->unsignedInteger('target_frames')->nullable();

            $table->decimal('original_video_duration', 10, 4)->nullable();
            $table->unsignedInteger('original_video_frames')->nullable();
            $table->decimal('original_video_fps', 10, 4)->nullable();

            $table->boolean('is_precomp')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('template_slots', function (Blueprint $table) {
            $table->dropColumn([
                'target_duration',
                'target_frames',
                'original_video_duration',
                'original_video_frames',
                'original_video_fps',
                'is_precomp',
            ]);
        });
    }
};