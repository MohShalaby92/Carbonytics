import mongoose from 'mongoose';
import { Readable } from 'stream';

/**
 * GridFS-backed binary storage for data-line evidence (§4.3). The bytes live in
 * the Mongo `evidence.files` / `evidence.chunks` collections, so attachments are
 * durable across container rebuilds (unlike the ephemeral CSV upload dir) and
 * tenant isolation is enforced by the Evidence metadata model, not the bucket.
 */

const BUCKET_NAME = 'evidence';

function bucket(): InstanceType<typeof mongoose.mongo.GridFSBucket> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection not ready for evidence storage');
  return new mongoose.mongo.GridFSBucket(db, { bucketName: BUCKET_NAME });
}

/** Stream a buffer into GridFS; resolves with the stored file's ObjectId. */
export function storeEvidenceFile(
  buffer: Buffer,
  filename: string,
  contentType: string,
  metadata: Record<string, any>
): Promise<mongoose.Types.ObjectId> {
  return new Promise((resolve, reject) => {
    const uploadStream = bucket().openUploadStream(filename, { contentType, metadata });
    Readable.from(buffer)
      .pipe(uploadStream)
      .on('error', reject)
      .on('finish', () => resolve(uploadStream.id as mongoose.Types.ObjectId));
  });
}

/** Open a readable download stream for stored evidence bytes. */
export function openEvidenceDownloadStream(fileId: mongoose.Types.ObjectId) {
  return bucket().openDownloadStream(fileId);
}

/** Delete the stored bytes for an evidence file (idempotent — ignores missing). */
export async function deleteEvidenceFile(fileId: mongoose.Types.ObjectId): Promise<void> {
  try {
    await bucket().delete(fileId);
  } catch {
    // File may already be gone (e.g. partial cleanup); the metadata delete is authoritative.
  }
}
