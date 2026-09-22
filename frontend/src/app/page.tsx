"use client";

import { useState } from "react";

import PresetSelector from "./component/PresetSelector";
import VideoUpload from "./component/VideoUpload";
import RenderHistory from "./component/RenderHistory";
import TemplateSelector from "./component/TemplateSelector";
import TemplateRenderHistory from "./component/TemplateRenderHistory";
import "./globals.css";
export default function Home() {
  const [videoId, setVideoId] = useState<number | null>(null);

  return (
    <div className="space-y-8 p-8">

      <h1 className="text-2xl font-bold">
        Video Editor
      </h1>

      <VideoUpload
        onUpload={(id) => {
          setVideoId(id);
        }}
      />

      <PresetSelector
        videoId={videoId ?? undefined}
      />
      <br /> <br />

      <TemplateSelector />
      <TemplateRenderHistory />

      <RenderHistory />

    </div>
  );
}