import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { User } from 'lucide-react';
import { scAPI } from '@/api/soundcloud';
import type { SCUser } from '@/types/soundcloud';
import { PageHeader, Spinner, EmptyState, UserRow, RowSkeleton } from '@/components/common/UI';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useT } from '@/store/i18n';

const INITIAL_LIMIT = 50;

export function FollowingPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const t = useT();
  const [users, setUsers] = useState<SCUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetUser, setTargetUser] = useState<SCUser | null>(null);
  const [nextHref, setNextHref] = useState<string | null>(null);

  const loadMore = useCallback(async () => {
    if (!nextHref || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await scAPI.fetchNext<SCUser>(nextHref);
      setUsers((prev) => {
        const existing = new Set(prev.map((u) => u.id));
        return [...prev, ...data.collection.filter((u) => !existing.has(u.id))];
      });
      setNextHref(data.next_href);
    } catch (err) {
      console.error('[FollowingPage] loadMore error:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [nextHref, loadingMore]);

  const sentinelRef = useInfiniteScroll(loadMore, { enabled: Boolean(nextHref) });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [userData, followingsData] = await Promise.all([
          scAPI.getUser(Number(id)),
          scAPI.getUserFollowings(Number(id), INITIAL_LIMIT),
        ]);
        if (cancelled) return;
        setTargetUser(userData);
        setUsers(followingsData.collection);
        setNextHref(followingsData.next_href);
      } catch (err) {
        if (!cancelled) {
          const msg = (err as Error).message;
          setError(msg.includes('авторизаци') ? t('following_auth_error') : msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  return (
    <div>
      <PageHeader
        title={t('following_title')}
        subtitle={targetUser ? targetUser.username : t('loading')}
      />

      {loading && (
        <div className="space-y-1">
          {Array.from({ length: 12 }, (_, i) => <RowSkeleton key={i} avatar />)}
        </div>
      )}

      {error && <EmptyState title={t('error_loading')} description={error} />}

      {!loading && !error && users.length === 0 && (
        <EmptyState icon={<User size={40} />} title={t('following_empty_title')} description={t('following_empty_desc')} />
      )}

      {!loading && !error && users.length > 0 && (
        <div className="space-y-1 animate-slide-up">
          {users.map((user) => (
            <UserRow key={user.id} user={user} onClick={() => navigate(`/user/${user.id}`)} />
          ))}
          <div ref={sentinelRef} className="flex justify-center py-2">
            {loadingMore && <Spinner />}
          </div>
        </div>
      )}
    </div>
  );
}
