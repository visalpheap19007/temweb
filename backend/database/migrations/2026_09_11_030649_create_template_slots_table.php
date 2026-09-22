<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('template_slots', function (Blueprint $table) {
            $table->id();

            $table->foreignId('template_id')
                ->constrained('templates')
                ->cascadeOnDelete();

            $table->string('slot_name');
            $table->unsignedInteger('slot_order');

            $table->timestamps();

            $table->unique([
                'template_id',
                'slot_name',
            ]);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('template_slots');
    }
};