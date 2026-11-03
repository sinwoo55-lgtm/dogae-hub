import { randomUUID } from 'node:crypto';

// A lease prevents simultaneous full imports. A completion acknowledges only
// the revision observed before reading the roster, never a later change.
export function createRosterSyncCoordinator({ db, ref, sync, now = Date.now, leaseMs = 300000 }) {
  return async function synchronize() {
    const token = randomUUID();
    const claim = await db.runTransaction(async tx => {
      const doc = await tx.get(ref), state = doc.exists ? doc.data() : {};
      const revision = Number(state.revision || 0), completed = Number(state.completedRevision || 0);
      if (revision <= completed) return { status: 'unchanged' };
      if (state.leaseToken && Number(state.leaseUntil || 0) > now()) return { status: 'busy' };
      tx.set(ref, { leaseToken: token, leaseUntil: now() + leaseMs }, { merge: true });
      return { status: 'claimed', revision };
    });
    if (claim.status !== 'claimed') return claim;
    try {
      const result = await sync();
      if (!result?.synced) throw new Error('선도부 명단 연동 설정이 완료되지 않았습니다.');
      const completion = await db.runTransaction(async tx => {
        const doc = await tx.get(ref), state = doc.exists ? doc.data() : {};
        // If an expired worker finished after a newer worker, schedule another
        // import so its potentially stale result cannot be considered final.
        if (state.leaseToken !== token) {
          tx.set(ref, { revision: Number(state.revision || 0) + 1 }, { merge: true });
          return { lost: true };
        }
        tx.set(ref, { completedRevision: claim.revision, leaseToken: null, leaseUntil: 0 }, { merge: true });
        return { pending: Number(state.revision || 0) > claim.revision };
      });
      if (completion.lost) throw new Error('명단 동기화 권한이 만료되었습니다.');
      return { status: 'synced', pending: completion.pending, students: result.students };
    } catch (error) {
      await db.runTransaction(async tx => {
        const doc = await tx.get(ref);
        if (doc.exists && doc.data().leaseToken === token) tx.set(ref, { leaseToken: null, leaseUntil: 0 }, { merge: true });
      });
      throw error;
    }
  };
}
