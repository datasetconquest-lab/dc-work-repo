import { useCallback, useMemo, useRef, useState } from 'react';
import { API_BASE_URL } from '../lib/api';
import { getStoredAuth } from '../lib/authStorage';

export interface UploadedFile {
  id?: string;
  url: string;
  filename: string;
  name: string;
  size?: number;
  mimetype?: string;
}

export type UploadStatus = 'preparing' | 'uploading' | 'done' | 'failed' | 'canceled';

export interface MessageUploadItem {
  localId: string;
  file: File;
  name: string;
  size: number;
  type: string;
  status: UploadStatus;
  progress: number;
  error?: string;
  uploaded?: UploadedFile;
}

const MAX_IMAGE_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

function makeLocalId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = objectUrl;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;

  try {
    const image = await loadImage(file);
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / image.naturalWidth, MAX_IMAGE_DIMENSION / image.naturalHeight);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    ctx.drawImage(image, 0, 0, width, height);
    const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, outputType, outputType === 'image/jpeg' ? JPEG_QUALITY : undefined);
    });

    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name, { type: outputType, lastModified: Date.now() });
  } catch (error) {
    console.warn('Image compression skipped:', error);
    return file;
  }
}

function uploadWithProgress(file: File, onProgress: (progress: number) => void): { xhr: XMLHttpRequest; promise: Promise<UploadedFile> } {
  const xhr = new XMLHttpRequest();
  const formData = new FormData();
  formData.append('file', file);
  formData.append('category', 'message');

  const promise = new Promise<UploadedFile>((resolve, reject) => {
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      let data: any = null;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        data = null;
      }

      if (xhr.status >= 200 && xhr.status < 300 && data) {
        resolve({
          id: data.id,
          url: data.url,
          filename: data.filename || file.name,
          name: data.filename || file.name,
          size: data.size,
          mimetype: data.mimetype,
        });
        return;
      }

      reject(new Error(data?.error || `Upload failed (${xhr.status})`));
    };

    xhr.onerror = () => reject(new Error('Upload failed. Check your network and try again.'));
    xhr.onabort = () => reject(new DOMException('Upload canceled', 'AbortError'));
  });

  xhr.open('POST', `${API_BASE_URL}/upload`);
  const token = getStoredAuth()?.token;
  if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
  xhr.send(formData);

  return { xhr, promise };
}

export function useMessageUploads(maxFiles = 5) {
  const [items, setItems] = useState<MessageUploadItem[]>([]);
  const controllers = useRef<Map<string, XMLHttpRequest>>(new Map());

  const setItem = useCallback((localId: string, patch: Partial<MessageUploadItem>) => {
    setItems((current) => current.map((item) => item.localId === localId ? { ...item, ...patch } : item));
  }, []);

  const uploadOne = useCallback(async (localId: string, file: File) => {
    try {
      setItem(localId, { status: 'preparing', progress: 0, error: undefined });
      const prepared = await compressImage(file);
      setItem(localId, {
        status: 'uploading',
        progress: 1,
        size: prepared.size,
        type: prepared.type || file.type,
      });

      const { xhr, promise } = uploadWithProgress(prepared, (progress) => {
        setItem(localId, { progress: Math.max(1, Math.min(100, progress)) });
      });

      controllers.current.set(localId, xhr);
      const uploaded = await promise;
      controllers.current.delete(localId);
      setItem(localId, { status: 'done', progress: 100, uploaded, error: undefined });
    } catch (error: any) {
      controllers.current.delete(localId);
      const canceled = error?.name === 'AbortError';
      setItem(localId, {
        status: canceled ? 'canceled' : 'failed',
        error: canceled ? 'Canceled' : error?.message || 'Upload failed',
      });
    }
  }, [setItem]);

  const addFiles = useCallback((files: File[]) => {
    const remainingSlots = maxFiles - items.length;
    if (remainingSlots <= 0) {
      return { accepted: 0, message: `Maximum ${maxFiles} files allowed per message` };
    }

    const selected = files.slice(0, remainingSlots);
    const queued = selected.map((file) => ({
      localId: makeLocalId(),
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      status: 'preparing' as UploadStatus,
      progress: 0,
    }));

    setItems((current) => [...current, ...queued]);
    queued.forEach((item) => {
      void uploadOne(item.localId, item.file);
    });

    return {
      accepted: queued.length,
      message: files.length > selected.length ? `Only ${remainingSlots} more file(s) can be added. Some files were not added.` : undefined,
    };
  }, [items.length, maxFiles, uploadOne]);

  const removeUpload = useCallback((localId: string) => {
    const controller = controllers.current.get(localId);
    if (controller) {
      controller.abort();
      controllers.current.delete(localId);
    }
    setItems((current) => current.filter((item) => item.localId !== localId));
  }, []);

  const retryUpload = useCallback((localId: string) => {
    const item = items.find((candidate) => candidate.localId === localId);
    if (!item || item.status === 'uploading' || item.status === 'preparing') return;
    void uploadOne(localId, item.file);
  }, [items, uploadOne]);

  const clearUploads = useCallback(() => {
    controllers.current.forEach((xhr) => xhr.abort());
    controllers.current.clear();
    setItems([]);
  }, []);

  const uploadedFiles = useMemo(
    () => items.map((item) => item.uploaded).filter((file): file is UploadedFile => Boolean(file)),
    [items]
  );

  const isUploading = items.some((item) => item.status === 'preparing' || item.status === 'uploading');
  const hasPendingUploads = items.some((item) => item.status === 'preparing' || item.status === 'uploading' || item.status === 'failed');
  const hasFailedUploads = items.some((item) => item.status === 'failed');

  return {
    items,
    uploadedFiles,
    addFiles,
    removeUpload,
    retryUpload,
    clearUploads,
    isUploading,
    hasPendingUploads,
    hasFailedUploads,
  };
}

