<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('template_render_job_videos', function (Blueprint $table) {
            $table->unsignedInteger('start_frame')->default(0);
            $table->unsignedInteger('end_frame')->default(0);
        });
    }

    public function down(): void
    {
        Schema::table('template_render_job_videos', function (Blueprint $table) {
            $table->dropColumn([
                'start_frame',
                'end_frame',
            ]);
        });
    }
};