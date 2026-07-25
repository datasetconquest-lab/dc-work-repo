import mongoose from 'mongoose';
import { GridFSBucket } from 'mongodb';
import type { ObjectId } from 'mongodb';

// Bucket that holds the actual bytes of uploaded message/avatar files. Storing
// them in MongoDB (GridFS) instead of the local disk means they survive server
// restarts and redeploys — the host (Render) has an ephemeral filesystem, so
// disk-stored uploads vanish on every deploy and become undownloadable.
export const UPLOAD_BUCKET_NAME = 'message_uploads';

export function getUploadBucket(): GridFSBucket {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database not connected');
  return new GridFSBucket(db, { bucketName: UPLOAD_BUCKET_NAME });
}

export async function deleteFromBucket(id: ObjectId): Promise<void> {
  try {
    await getUploadBucket().delete(id);
  } catch (err: any) {
    // A missing GridFS file is fine (already gone); rethrow anything else.
    if (!/FileNotFound/i.test(String(err?.message))) throw err;
  }
}
