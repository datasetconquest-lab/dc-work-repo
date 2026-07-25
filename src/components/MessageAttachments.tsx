import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Eye, FileArchive, FileText, Music, Video, X } from 'lucide-react';
import { createProtectedObjectUrl, downloadFile, isProtectedUploadUrl, openFile } from '../lib/secureFiles';

export type RawAttachment =
  | string
  | {
    id?: string;
    url: string;
    filename?: string;
    name?: string;
    size?: number;
    mimetype?: string;
  };

interface NormalizedAttachment {
  id?: string;
  url: string;
  filename: string;
  size?: number;
  mimetype?: string;
}

function normalize(att: RawAttachment): NormalizedAttachment {
  if (typeof att === 'string') {
    return { url: att, filename: deriveNameFromUrl(att) };
  }
  return {
    id: att.id,
    url: att.url,
    filename: att.filename || att.name || deriveNameFromUrl(att.url),
    size: att.size,
    mimetype: att.mimetype,
  };
}

function deriveNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const tail = u.pathname.split('/').filter(Boolean).pop() || url;
    return decodeURIComponent(tail);
  } catch {
    return url.split('/').filter(Boolean).pop() || url;
  }
}

function extension(att: NormalizedAttachment): string {
  return att.filename.toLowerCase().split('.').pop() || '';
}

function isImage(att: NormalizedAttachment): boolean {
  if (att.mimetype?.startsWith('image/') && att.mimetype !== 'image/svg+xml') return true;
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(extension(att));
}

function isAudio(att: NormalizedAttachment): boolean {
  if (att.mimetype?.startsWith('audio/')) return true;
  return ['mp3', 'wav', 'ogg', 'm4a'].includes(extension(att));
}

function isVideo(att: NormalizedAttachment): boolean {
  if (att.mimetype?.startsWith('video/')) return true;
  return ['mp4', 'avi', 'mov', 'webm'].includes(extension(att));
}

function fileIcon(att: NormalizedAttachment) {
  const ext = extension(att);
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return FileArchive;
  if (isAudio(att)) return Music;
  if (isVideo(att)) return Video;
  return FileText;
}

function formatSize(bytes?: number): string {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function useAttachmentSource(url: string) {
  const [source, setSource] = useState(isProtectedUploadUrl(url) ? '' : url);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl = '';

    setFailed(false);
    if (!isProtectedUploadUrl(url)) {
      setSource(url);
      return;
    }

    setSource('');
    createProtectedObjectUrl(url)
      .then((nextUrl) => {
        if (!active) {
          URL.revokeObjectURL(nextUrl);
          return;
        }
        objectUrl = nextUrl;
        setSource(nextUrl);
      })
      .catch((error) => {
        console.error('Failed to load protected file', error);
        if (active) setFailed(true);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return { source, failed };
}

function AttachmentImage({
  att,
  className,
}: {
  att: NormalizedAttachment;
  className: string;
}) {
  const { source, failed } = useAttachmentSource(att.url);

  if (failed) {
    return (
      <div className={`${className} bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xs text-gray-500 dark:text-gray-400`}>
        Preview unavailable
      </div>
    );
  }

  if (!source) {
    return <div className={`${className} bg-gray-100 dark:bg-gray-700 animate-pulse`} />;
  }

  return <img src={source} alt={att.filename} className={className} loading="lazy" />;
}

function MediaPlayer({ att, tone }: { att: NormalizedAttachment; tone: 'light' | 'dark' }) {
  const { source, failed } = useAttachmentSource(att.url);
  const isDark = tone === 'dark';

  if (failed) {
    return (
      <DocumentCard att={att} tone={tone} />
    );
  }

  return (
    <div className={`rounded-lg border p-3 max-w-sm ${isDark ? 'bg-white/10 border-white/15' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="min-w-0">
          <p className={`text-xs font-semibold truncate ${isDark ? 'text-white' : 'text-gray-900 dark:text-gray-100'}`}>{att.filename}</p>
          {att.size !== undefined && <p className={`text-[10px] ${isDark ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'}`}>{formatSize(att.size)}</p>}
        </div>
        <button
          type="button"
          onClick={() => void downloadFile(att.url, att.filename)}
          className={`p-1.5 rounded ${isDark ? 'text-white/90 hover:bg-white/15' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
          title="Download"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>
      {isAudio(att) ? (
        <audio src={source || undefined} controls preload="metadata" className="w-full h-9" />
      ) : (
        <video src={source || undefined} controls preload="metadata" className="w-full max-h-64 rounded-md bg-black" />
      )}
    </div>
  );
}

function DocumentCard({ att, tone }: { att: NormalizedAttachment; tone: 'light' | 'dark' }) {
  const Icon = fileIcon(att);
  const isDark = tone === 'dark';
  const cardBg = isDark ? 'bg-white/10 hover:bg-white/15 border-white/15' : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 border-gray-200 dark:border-gray-700';
  const textColor = isDark ? 'text-white' : 'text-gray-900 dark:text-gray-100';
  const subColor = isDark ? 'text-white/70' : 'text-gray-500 dark:text-gray-400';
  const iconBg = isDark ? 'bg-white/15 text-white' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400';
  const buttonColor = isDark ? 'text-white/90 hover:bg-white/15' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700';

  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border max-w-sm ${cardBg}`}>
      <div className={`flex-shrink-0 w-10 h-10 rounded-md flex items-center justify-center ${iconBg}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-semibold truncate ${textColor}`} title={att.filename}>
          {att.filename}
        </p>
        <p className={`text-[10px] ${subColor}`}>
          {[extension(att).toUpperCase() || 'FILE', formatSize(att.size)].filter(Boolean).join(' • ')}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => void openFile(att.url)}
          className={`p-1.5 rounded ${buttonColor}`}
          title="View"
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => void downloadFile(att.url, att.filename)}
          className={`p-1.5 rounded ${buttonColor}`}
          title="Download"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function imageTileClass(count: number, index: number): string {
  if (count === 1) return 'h-56 max-w-[280px]';
  if (count === 2) return 'h-40';
  if (count === 3 && index === 0) return 'row-span-2 h-[244px]';
  return 'h-[120px]';
}

export function MessageAttachments({
  attachments,
  tone = 'light',
}: {
  attachments: RawAttachment[] | undefined | null;
  tone?: 'light' | 'dark';
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const items = useMemo(() => (attachments || []).map(normalize), [attachments]);
  const images = items.filter(isImage);
  const otherItems = items.filter((att) => !isImage(att));
  const lightbox = lightboxIndex === null ? null : images[lightboxIndex] || null;

  useEffect(() => {
    if (!lightbox) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightboxIndex(null);
      if (event.key === 'ArrowLeft') setLightboxIndex((current) => current === null ? current : Math.max(0, current - 1));
      if (event.key === 'ArrowRight') setLightboxIndex((current) => current === null ? current : Math.min(images.length - 1, current + 1));
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [images.length, lightbox]);

  if (items.length === 0) return null;

  const visibleImages = images.slice(0, 4);
  const extraImages = Math.max(0, images.length - visibleImages.length);

  const goPrevious = () => setLightboxIndex((current) => current === null ? current : Math.max(0, current - 1));
  const goNext = () => setLightboxIndex((current) => current === null ? current : Math.min(images.length - 1, current + 1));

  return (
    <>
      <div className="mt-2 flex flex-col gap-2">
        {visibleImages.length > 0 && (
          <div className={`grid gap-1 overflow-hidden rounded-lg ${visibleImages.length === 1 ? 'grid-cols-1 max-w-[280px]' : 'grid-cols-2 max-w-[320px]'}`}>
            {visibleImages.map((att, index) => (
              <button
                key={`${att.url}-${index}`}
                type="button"
                onClick={() => setLightboxIndex(index)}
                className={`relative overflow-hidden bg-gray-100 dark:bg-gray-700 ${imageTileClass(visibleImages.length, index)}`}
                title={att.filename}
              >
                <AttachmentImage att={att} className="w-full h-full object-cover" />
                {extraImages > 0 && index === visibleImages.length - 1 && (
                  <span className="absolute inset-0 bg-black/50 text-white font-bold flex items-center justify-center text-lg">
                    +{extraImages}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {otherItems.map((att, index) => (
          isAudio(att) || isVideo(att)
            ? <MediaPlayer key={`${att.url}-${index}`} att={att} tone={tone} />
            : <DocumentCard key={`${att.url}-${index}`} att={att} tone={tone} />
        ))}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxIndex(null)}
          onTouchStart={(event) => {
            touchStartX.current = event.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event) => {
            const startX = touchStartX.current;
            const endX = event.changedTouches[0]?.clientX;
            touchStartX.current = null;
            if (startX === null || endX === undefined) return;
            const delta = endX - startX;
            if (Math.abs(delta) < 40) return;
            if (delta > 0) goPrevious();
            else goNext();
          }}
        >
          <button
            type="button"
            className="absolute top-4 right-4 p-2 bg-white/10 text-white rounded-full hover:bg-white/20"
            onClick={(e) => { e.stopPropagation(); setLightboxIndex(null); }}
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
          <button
            type="button"
            className="absolute top-4 right-16 p-2 bg-white/10 text-white rounded-full hover:bg-white/20"
            onClick={(e) => { e.stopPropagation(); void downloadFile(lightbox.url, lightbox.filename); }}
            title="Download"
          >
            <Download className="w-5 h-5" />
          </button>

          {images.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-4 p-2 bg-white/10 text-white rounded-full hover:bg-white/20 disabled:opacity-30"
                onClick={(e) => { e.stopPropagation(); goPrevious(); }}
                disabled={lightboxIndex === 0}
                title="Previous"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                type="button"
                className="absolute right-4 p-2 bg-white/10 text-white rounded-full hover:bg-white/20 disabled:opacity-30"
                onClick={(e) => { e.stopPropagation(); goNext(); }}
                disabled={lightboxIndex === images.length - 1}
                title="Next"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}

          <div className="max-w-[92vw] max-h-[88vh]" onClick={(e) => e.stopPropagation()}>
            <AttachmentImage att={lightbox} className="max-w-[92vw] max-h-[88vh] object-contain rounded-lg" />
            <p className="mt-3 text-center text-xs text-white/75 truncate max-w-[92vw]">{lightbox.filename}</p>
          </div>
        </div>
      )}
    </>
  );
}
