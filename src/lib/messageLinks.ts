export type DetectedLink = {
  url: string;
  label: string;
  kind: 'link' | 'file';
};

const URL_REGEX = /https?:\/\/[^\s<>()]+/gi;

function isFileUrl(url: string) {
  const lower = url.toLowerCase();
  return (
    lower.match(/\.(pdf|doc|docx|ppt|pptx|xls|xlsx|zip|rar|7z|png|jpg|jpeg|gif|webp|mp4|mov|avi|txt)$/) !==
    null
  );
}

export function detectLinks(text: string | null | undefined): DetectedLink[] {
  if (!text) return [];
  const matches = text.match(URL_REGEX) || [];
  const uniq = Array.from(new Set(matches));
  return uniq.map((url) => {
    const kind: DetectedLink['kind'] = isFileUrl(url) ? 'file' : 'link';
    let label = url;
    try {
      const u = new URL(url);
      label = u.hostname + (u.pathname && u.pathname !== '/' ? u.pathname : '');
    } catch {
      // keep raw
    }
    if (label.length > 38) label = label.slice(0, 35) + '…';
    return { url, label, kind };
  });
}

// Remove URLs from text for cleaner message display
export function removeLinks(text: string | null | undefined): string {
  if (!text) return '';
  return text.replace(URL_REGEX, '').replace(/\s+/g, ' ').trim();
}

// Check if message is only a link (no other text)
export function isOnlyLink(text: string | null | undefined): boolean {
  if (!text) return false;
  const withoutLinks = removeLinks(text);
  return withoutLinks.length === 0 && detectLinks(text).length > 0;
}
