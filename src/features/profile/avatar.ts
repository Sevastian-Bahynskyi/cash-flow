import { supabase } from '@/lib/supabase';

const AVATAR_BUCKET = 'avatars';

const base64ToBytes = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const extFromMime = (mimeType: string): string => {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('heic')) return 'heic';
  return 'jpg';
};

/** Upload avatar to the public `avatars` bucket and return its public URL. */
export const uploadAvatar = async ({
  userId,
  base64,
  mimeType,
}: {
  userId: string;
  base64: string;
  mimeType: string;
}): Promise<string> => {
  const path = `${userId}/avatar.${extFromMime(mimeType)}`;
  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, base64ToBytes(base64), { contentType: mimeType, upsert: true });
  if (error) throw error;

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return data.publicUrl;
};
