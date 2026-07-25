import { Link2, FileText, Download, Image, FileArchive, Music, Video, Code } from 'lucide-react';
import type { DetectedLink } from '../lib/messageLinks';

function getFileIcon(url: string) {
  const ext = url.split('.').pop()?.toLowerCase() || '';

  // Images
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
    return Image;
  }

  // Archives
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return FileArchive;
  }

  // Audio
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'].includes(ext)) {
    return Music;
  }

  // Video
  if (['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm'].includes(ext)) {
    return Video;
  }

  // Code files
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'cpp', 'c', 'h', 'css', 'html', 'json', 'xml', 'sql'].includes(ext)) {
    return Code;
  }

  return FileText;
}

function getFileName(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    return decodeURIComponent(pathname.split('/').pop() || url);
  } catch {
    return url.split('/').pop() || url;
  }
}

export function LinkBadges({ links }: { links: DetectedLink[] }) {
  if (!links.length) return null;

  const handleDownload = async (e: React.MouseEvent, url: string, fileName: string) => {
    // If it's a file upload, try to force download
    if (url.includes('/uploads/')) {
      e.preventDefault();
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      } catch (error) {
        console.error('Download failed', error);
        // Fallback to default behavior (opening in new tab)
        window.open(url, '_blank');
      }
    }
  };

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {links.map((l, idx) => {
        const isFileUpload = l.url.includes('/uploads/');
        const Icon = l.kind === 'file' || isFileUpload ? getFileIcon(l.url) : Link2;
        const fileName = getFileName(l.url);
        const displayName = isFileUpload ? fileName : l.label;

        return (
          <a
            key={l.url + idx}
            href={isFileUpload ? '#' : l.url}
            target={isFileUpload ? undefined : "_blank"}
            rel="noreferrer"
            onClick={(e) => isFileUpload && handleDownload(e, l.url, fileName)}
            className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full border border-white/20 bg-black/10 text-xs hover:bg-black/20 transition-colors"
            title={l.url}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="truncate max-w-[14rem]">{displayName}</span>
            {isFileUpload && <Download className="w-3 h-3" />}
          </a>
        );
      })}
    </div>
  );
}

