import fs from 'fs';
import { FileStore } from '../models/File.js';
import { deleteFromBucket } from '../utils/gridfs.js';

// Deletes every file whose category is 'message' from disk and from the
// `files` collection. Avatars and any other category are left untouched.
//
// Returns a summary so we can log it and surface it later in the admin UI.
export async function purgeSharedMessageFiles(): Promise<{
  scanned: number;
  diskDeleted: number;
  diskMissing: number;
  diskFailed: number;
  dbDeleted: number;
  bytesFreed: number;
}> {
  const summary = {
    scanned: 0,
    diskDeleted: 0,
    diskMissing: 0,
    diskFailed: 0,
    dbDeleted: 0,
    bytesFreed: 0,
  };

  // Stream the records so we don't load thousands at once.
  const cursor = FileStore.find({ category: 'message' }).cursor();
  const idsToRemove: any[] = [];

  for await (const file of cursor) {
    summary.scanned += 1;
    const size = file.size || 0;

    if (file.path) {
      try {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
          summary.diskDeleted += 1;
          summary.bytesFreed += size;
        } else {
          summary.diskMissing += 1;
        }
      } catch (err) {
        summary.diskFailed += 1;
        console.error(`[fileCleanup] failed to delete ${file.path}:`, err);
        // Skip DB delete so we can retry next month.
        continue;
      }
    }

    // Remove the GridFS bytes for files stored in MongoDB.
    if ((file as any).gridfs_id) {
      try {
        await deleteFromBucket((file as any).gridfs_id);
        summary.bytesFreed += size;
      } catch (err) {
        console.error(`[fileCleanup] failed to delete GridFS ${(file as any).gridfs_id}:`, err);
        // Skip DB delete so we can retry next month.
        continue;
      }
    }

    idsToRemove.push(file._id);
  }

  if (idsToRemove.length > 0) {
    const result = await FileStore.deleteMany({ _id: { $in: idsToRemove } });
    summary.dbDeleted = result.deletedCount || 0;
  }

  return summary;
}

// Schedules purgeSharedMessageFiles to run shortly after 02:00 server time on
// the 1st of every calendar month. We use a 1-hour poll instead of node-cron
// to avoid a new dependency, mirroring the attendanceScheduler pattern.
let lastRunYearMonth: string | null = null;

async function tick() {
  const now = new Date();
  if (now.getDate() !== 1) return;
  if (now.getHours() < 2) return; // wait until after 02:00

  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (lastRunYearMonth === ym) return;

  lastRunYearMonth = ym;
  try {
    console.log('[fileCleanup] Starting monthly shared-file purge for', ym);
    const summary = await purgeSharedMessageFiles();
    console.log('[fileCleanup] Done:', summary);
  } catch (err) {
    console.error('[fileCleanup] Monthly purge failed:', err);
    // Allow retry next tick by clearing the marker.
    lastRunYearMonth = null;
  }
}

export function startMessageFileCleanupScheduler() {
  // Run once a few minutes after startup (no-op on most days), then every hour.
  setTimeout(() => { tick().catch(() => { }); }, 5 * 60_000);
  setInterval(() => { tick().catch(() => { }); }, 60 * 60_000);
}
