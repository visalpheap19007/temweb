<?php

namespace App\Http\Controllers;

use App\Models\Preset;
use Illuminate\Http\Request;

class PresetController extends Controller
{
        public function index()
    {
        return response()->json(
            Preset::all()
        );
    }
}
