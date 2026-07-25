import mongoose from 'mongoose';

/**
 * Safely convert a string to a Mongoose ObjectId.
 * Returns null if the string is invalid instead of throwing.
 */
export function toObjectId(id: string | undefined): mongoose.Types.ObjectId | null {
  if (!id) return null;
  try {
    return new mongoose.Types.ObjectId(id);
  } catch {
    return null;
  }
}
