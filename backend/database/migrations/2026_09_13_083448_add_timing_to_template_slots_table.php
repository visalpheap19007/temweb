<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('template_slots', function (Blueprint $table) {
            $table->unsignedInteger('required_frames')
                ->nullable()
                ->after('slot_order');

            $table->unsignedInteger('fps')
                ->default(30)
                ->after('required_frames');
        });
    }

    public function down(): void
    {
        Schema::table('template_slots', function (Blueprint $table) {
            $table->dropColumn([
                'required_frames',
                'fps',
            ]);
        });
    }
};