<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('template_render_job_videos', function (Blueprint $table) {
            $table->decimal('crop_scale', 6, 3)
                ->default(1)
                ->after('end_frame');

            $table->decimal('crop_x', 7, 3)
                ->default(0)
                ->after('crop_scale');

            $table->decimal('crop_y', 7, 3)
                ->default(0)
                ->after('crop_x');
        });
    }

    public function down(): void
    {
        Schema::table('template_render_job_videos', function (Blueprint $table) {
            $table->dropColumn([
                'crop_scale',
                'crop_x',
                'crop_y',
            ]);
        });
    }
};