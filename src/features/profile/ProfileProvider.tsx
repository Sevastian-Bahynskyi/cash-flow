import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { runDetached } from '@/lib/async';
import { reportDevError } from '@/lib/errors';
import { useAuth } from '@/features/auth/AuthProvider';
import { uploadAvatar } from './avatar';

type ProfileState = {
  displayName: string;
  avatarUrl: string | null;
  loading: boolean;
  saveName: (name: string) => Promise<void>;
  uploadPicture: (params: { base64: string; mimeType: string }) => Promise<void>;
  reload: () => Promise<void>;
};

const Ctx = createContext<ProfileState | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async (): Promise<void> => {
    if (!userId) {
      setDisplayName('');
      setAvatarUrl(null);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) {
        reportDevError('profile.load', error);
        return;
      }
      const profile = data as { display_name: string | null; avatar_url: string | null } | null;
      setDisplayName(profile?.display_name ?? '');
      setAvatarUrl(profile?.avatar_url ?? null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    runDetached(reload(), 'profile.reload');
  }, [reload]);

  const saveName = useCallback(
    async (name: string): Promise<void> => {
      if (!userId) return;
      const trimmed = name.trim();
      const { error } = await supabase
        .from('profiles')
        .upsert({ user_id: userId, display_name: trimmed, updated_at: new Date().toISOString() });
      if (error) throw error;
      setDisplayName(trimmed);
    },
    [userId],
  );

  const uploadPicture = useCallback(
    async ({ base64, mimeType }: { base64: string; mimeType: string }): Promise<void> => {
      if (!userId) return;
      const publicUrl = await uploadAvatar({ userId, base64, mimeType });
      // Cache-bust so a re-upload to the same path refreshes in <Image>.
      const busted = `${publicUrl}?v=${Date.now()}`;
      const { error } = await supabase
        .from('profiles')
        .upsert({ user_id: userId, avatar_url: busted, updated_at: new Date().toISOString() });
      if (error) throw error;
      setAvatarUrl(busted);
    },
    [userId],
  );

  return (
    <Ctx.Provider value={{ displayName, avatarUrl, loading, saveName, uploadPicture, reload }}>
      {children}
    </Ctx.Provider>
  );
}

export const useProfile = (): ProfileState => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useProfile must be used inside ProfileProvider');
  return ctx;
};
