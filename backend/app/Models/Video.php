<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Video extends Model
{
        protected $fillable = [
        'original_name',
        'storage_path',
        'status',
    ];
}
