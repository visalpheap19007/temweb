<?php

namespace App\Http\Controllers;

use App\Models\Video;
use Illuminate\Http\Request;

class VideoController extends Controller
{
   public function store(Request $request)
    {
        $request->validate([
            'video' => 'required|file|max:102400',
        ]);

        $file = $request->file('video');

        $path = $file->store('videos', 'public');

        $video = Video::create([
            'original_name' => $file->getClientOriginalName(),
            'storage_path' => $path,
            'status' => 'uploaded',
        ]);

        return response()->json([
            'message' => 'Video uploaded successfully',
            'video' => $video,
        ], 201);
    }
    public function show($id)
{
    $video = Video::findOrFail($id);

    return response()->json([
        'video' => $video,
        'url' => asset('storage/' . $video->storage_path),
    ]);
}
}
