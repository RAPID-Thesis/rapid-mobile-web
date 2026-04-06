import { supabase } from './supabase';
import type { AssessmentImage } from '../types';

const BUCKET = 'assessment-images';
const EXPIRY_SEC = 3600;

export async function signedUrlsForImages(
  images: AssessmentImage[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  await Promise.all(
    images.map(async (img) => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(img.storage_path, EXPIRY_SEC);
      if (!error && data?.signedUrl) {
        map.set(img.id, data.signedUrl);
      }
    })
  );
  return map;
}
