<?php

use App\Http\Controllers\PresetController;
use App\Http\Controllers\RenderController;
use App\Http\Controllers\TemplateController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\VideoController;
use App\Http\Controllers\TemplateRenderController;
use App\Http\Controllers\TemplateAnalysisController;

Route::get('/render-jobs', [RenderController::class, 'index']);

Route::post('/videos', [VideoController::class, 'store']);
Route::get('/presets', [PresetController::class, 'index']);
Route::get('/videos/{id}', [VideoController::class, 'show']);

Route::post('/render', [RenderController::class, 'render']);
Route::get('/render/status', [RenderController::class, 'status']);
Route::get('/render/video/{id}', [RenderController::class, 'video']);
Route::post('/render-jobs/{id}/status', [RenderController::class, 'updateStatus']);
Route::get('/render/download/{id}', [RenderController::class, 'download']);
Route::delete('/render-jobs/{id}', [RenderController::class, 'destroy']);
Route::post('/render-jobs/{id}/progress', [RenderController::class, 'updateProgress']);

Route::get('/templates', [TemplateController::class, 'index']);
Route::get('/templates/{id}', [TemplateController::class, 'show']);

Route::post(
    '/template-render',
    [TemplateRenderController::class, 'createJob']
);
Route::get(
    '/template-render/jobs/next',
    [TemplateRenderController::class, 'workerJobs']
);
Route::post(
    '/template-render/jobs/{id}/status',
    [TemplateRenderController::class, 'updateStatus']
);
Route::get(
    '/template-render/jobs/{id}',
    [TemplateRenderController::class, 'status']
);
Route::get('/template-render/jobs/{id}/video', [TemplateRenderController::class, 'video']);
Route::get('/template-render/jobs', [TemplateRenderController::class, 'index']);
Route::delete('/templates/{id}', [TemplateController::class, 'destroy']);
Route::post('/templates/{id}/preview', [TemplateController::class, 'uploadPreview']);
Route::post('/templates', [TemplateController::class, 'store']);
Route::put('/templates/{id}', [TemplateController::class, 'update']);
Route::post(
    '/template-analysis',
    [TemplateAnalysisController::class, 'complete']
);