import { useEffect, useState } from "react";
import { NodeType } from "@/types/workflow";
import { cn } from "@/lib/utils";

type Props = {
  type: NodeType;
  url?: string;
  caption?: string;
  className?: string;
};

function isProbablyImage(url: string) {
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(url);
}

function isProbablyVideo(url: string) {
  return /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(url);
}

function isProbablyAudio(url: string) {
  return /\.(mp3|wav|ogg|m4a|aac|flac)(\?.*)?$/i.test(url);
}

export function MediaPreview({ type, url, caption, className }: Props) {
  const [audioError, setAudioError] = useState(false);

  useEffect(() => {
    if (type === "audio") {
      setAudioError(false);
    }
  }, [type, url]);

  if (!url) return null;

  const trimmed = url.trim();
  if (!trimmed) return null;

  if (type === "photo" || type === "photo-caption") {
    return (
      <div className={cn("mt-3 overflow-hidden rounded-lg border border-border/60 bg-background/20", className)}>
        <img
          src={trimmed}
          alt={caption || "Foto"}
          className="h-40 w-full object-cover"
          loading="lazy"
          draggable={false}
        />
      </div>
    );
  }

  if (type === "video" || type === "video-caption") {
    const isVideo = isProbablyVideo(trimmed) || !isProbablyImage(trimmed);
    if (!isVideo) return null;

    return (
      <div className={cn("mt-3 overflow-hidden rounded-lg border border-border/60 bg-background/20", className)}>
        <video src={trimmed} controls preload="metadata" className="h-40 w-full object-cover" />
      </div>
    );
  }

  if (type === "audio") {
    const isAudio = isProbablyAudio(trimmed) || !isProbablyImage(trimmed);
    if (!isAudio) return null;

    return (
      <div className={cn("mt-3 w-full", className)}>
        <audio
          key={trimmed}
          className="audio-player-lg w-full rounded-lg"
          controls
          preload="metadata"
          playsInline
          onError={() => setAudioError(true)}
          onCanPlay={() => setAudioError(false)}
        >
          <source src={trimmed} />
          Seu navegador não suporta áudio HTML5.
        </audio>

        {audioError && (
          <p className="mt-1 text-xs text-destructive/80">Não foi possível carregar o áudio.</p>
        )}
      </div>
    );
  }

  return null;
}