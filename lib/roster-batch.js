import { createHash } from 'node:crypto';

export function rosterRevision(doc) {
  const t = doc?.updateTime;
  return t && Number.isInteger(t.seconds) && Number.isInteger(t.nanoseconds) ? `${t.seconds}:${t.nanoseconds}` : '';
}

export async function applyRosterBatch({ db, students, rosterMeta, syncRevision, receiptRef, adds, updates = [], deletes, requestId, timestamp, increment }) {
  const hash = createHash('sha256').update(JSON.stringify(updates.length ? { adds, updates, deletes } : { adds, deletes })).digest('hex');
  const refs = adds.map(row => students.doc(row.key)).concat(updates.map(row => students.doc(row.id)), deletes.map(row => students.doc(row.id)));
  if (new Set(refs.map(ref => ref.id)).size !== refs.length) throw Object.assign(new Error('같은 학생이 중복되었습니다.'), { status: 400 });
  return db.runTransaction(async tx => {
    const receipt = await tx.get(receiptRef);
    if (receipt.exists) {
      if (receipt.data().hash !== hash) throw Object.assign(new Error('저장 요청이 변경되었습니다. 다시 확인해 주세요.'), { status: 409 });
      return { applied: true, replayed: true, added: adds.length, updated: updates.length, deleted: deletes.length };
    }
    const classKeys = [...new Set(adds.concat(updates).map(row => row.classKey))];
    const [meta, ...results] = await Promise.all([tx.get(rosterMeta), ...refs.map(ref => tx.get(ref)), ...classKeys.map(key => tx.get(students.where('classKey', '==', key)))]);
    const docs = results.slice(0, refs.length), classDocs = results.slice(refs.length);
    for (let i = 0; i < adds.length; i++) if (docs[i].exists) throw Object.assign(new Error('이미 등록된 학생이 있습니다. 명단을 새로 확인해 주세요.'), { status: 409 });
    const moving = new Set(deletes.map(row => row.id).concat(updates.map(row => row.id))), places = new Set();
    for (const row of adds.concat(updates)) {
      if (row.status === '전출') continue;
      const place = `${row.classKey}\u0000${row.number}`;
      if (places.has(place)) throw Object.assign(new Error('같은 학급과 번호가 중복되었습니다.'), { status: 409 });
      places.add(place);
      const match = classDocs[classKeys.indexOf(row.classKey)].docs.some(doc => !moving.has(doc.id) && String(doc.data().number) === row.number && doc.data().status !== '전출');
      if (match) throw Object.assign(new Error('같은 학급과 번호의 학생이 이미 있습니다. 명단을 새로 확인해 주세요.'), { status: 409 });
    }
    for (let i = 0; i < updates.length; i++) {
      const doc = docs[adds.length + i];
      if (!doc.exists || !updates[i].revision || rosterRevision(doc) !== updates[i].revision) throw Object.assign(new Error('수정할 학생 정보가 변경되었습니다. 명단을 새로 확인해 주세요.'), { status: 409 });
    }
    for (let i = 0; i < deletes.length; i++) {
      const doc = docs[adds.length + updates.length + i];
      if (!doc.exists || !deletes[i].revision || rosterRevision(doc) !== deletes[i].revision) throw Object.assign(new Error('삭제할 학생 정보가 변경되었습니다. 명단을 새로 확인해 주세요.'), { status: 409 });
    }
    const classes = new Set(meta.exists && Array.isArray(meta.data().classes) ? meta.data().classes : []);
    for (const row of adds.concat(updates)) classes.add(row.classKey);
    adds.forEach((row, i) => tx.set(refs[i], { ...row, updatedAt: timestamp() }, { merge: true }));
    updates.forEach(({id,revision,...row}, i) => tx.set(refs[adds.length + i], { ...row, updatedAt: timestamp() }, { merge: true }));
    deletes.forEach((_row, i) => tx.delete(refs[adds.length + updates.length + i]));
    tx.set(rosterMeta, { classes: [...classes].sort((a, b) => a.localeCompare(b, 'ko', { numeric: true })), updatedAt: timestamp() }, { merge: true });
    tx.set(syncRevision, { revision: increment(1) }, { merge: true });
    tx.set(receiptRef, { hash, added: adds.length, updated: updates.length, deleted: deletes.length, createdAt: timestamp(), requestId });
    return { applied: true, replayed: false, added: adds.length, updated: updates.length, deleted: deletes.length };
  });
}
