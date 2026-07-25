import { AlertCircle, CheckCircle2, FileText, Loader2, Paperclip, RotateCcw, X } from 'lucide-react';
import type { MessageUploadItem } from '../hooks/useMessageUploads';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusText(item: MessageUploadItem): string {
  if (item.status === 'preparing') return 'Preparing';
  if (item.status === 'uploading') return `${item.progress}%`;
  if (item.status === 'done') return 'Ready';
  if (item.status === 'canceled') return 'Canceled';
  return item.error || 'Failed';
}

function StatusIcon({ item }: { item: MessageUploadItem }) {
  if (item.status === 'done') return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
  if (item.status === 'failed' || item.status === 'canceled') return <AlertCircle className="w-4 h-4 text-red-500" />;
  return <Loader2 className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" />;
}

export function UploadTray({
  items,
  onRemove,
  onRetry,
}: {
  items: MessageUploadItem[];
  onRemove: (localId: string) => void;
  onRetry: (localId: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const showProgress = item.status === 'uploading' || item.status === 'preparing';
        const canRetry = item.status === 'failed' || item.status === 'canceled';

        return (
          <div
            key={item.localId}
            className="w-full sm:w-[260px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-md bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                {item.type.startsWith('image/') ? (
                  <Paperclip className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                ) : (
                  <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate" title={item.name}>
                  {item.name}
                </p>
                <div className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                  <StatusIcon item={item} />
                  <span className="truncate">{statusText(item)}</span>
                  <span>{formatSize(item.size)}</span>
                </div>
              </div>
              {canRetry && (
                <button
                  type="button"
                  onClick={() => onRetry(item.localId)}
                  className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                  title="Retry"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => onRemove(item.localId)}
                className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:text-red-600 hover:bg-red-50"
                title={showProgress ? 'Cancel' : 'Remove'}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {showProgress && (
              <div className="mt-2 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all"
                  style={{ width: `${Math.max(4, item.progress)}%` }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

