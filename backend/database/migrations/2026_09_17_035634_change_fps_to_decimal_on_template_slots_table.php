<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('template_slots', function (Blueprint $table) {
            $table->decimal('fps', 12, 6)->change();
        });
    }

    public function down(): void
    {
        Schema::table('template_slots', function (Blueprint $table) {
            $table->unsignedInteger('fps')->change();
        });
    }
};