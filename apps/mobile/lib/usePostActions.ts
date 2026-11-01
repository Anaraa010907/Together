import { useState } from 'react';
import { Alert } from 'react-native';
import i18n from './i18n';
import { feedErrorKey, markHelpful, unmarkHelpful, voteProposal, type Post, type Vote } from './feed';

// "Тустай" болон саналын товчлуурын нийтлэг логик (feed болон дэлгэрэнгүй дэлгэц).
export function usePostActions(myId: string | undefined, update: (p: Post) => void) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const fail = (e: any) => {
    const key = feedErrorKey(e);
    Alert.alert(i18n.t('common.error'), key ? i18n.t(key) : String(e?.message ?? e));
  };

  const toggleHelpful = async (p: Post) => {
    if (!myId || p.author_id === myId) return;
    setBusyId(p.id);
    try {
      if (p.helpful_ids.includes(myId)) {
        await unmarkHelpful(p.id, myId);
        update({ ...p, helpful_ids: p.helpful_ids.filter((x) => x !== myId) });
      } else {
        await markHelpful(p.id);
        update({ ...p, helpful_ids: [...p.helpful_ids, myId] });
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusyId(null);
    }
  };

  const vote = async (p: Post, v: Vote) => {
    if (!myId) return;
    setBusyId(p.id);
    try {
      await voteProposal(p.id, v);
      update({ ...p, votes: [...p.votes.filter((x) => x.user_id !== myId), { user_id: myId, vote: v }] });
    } catch (e) {
      fail(e);
    } finally {
      setBusyId(null);
    }
  };

  return { busyId, toggleHelpful, vote };
}
