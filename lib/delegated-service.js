import { randomBytes } from 'node:crypto';
import { allowJson } from './http.js';
import { requireSchoolNetwork } from './school-access.js';
import { desktopAdminAccess, validAdminKey } from './desktop-admin.js';
import { normalizeGrant, hashPin, verifyPin, grantId, issueSession, readSession } from './delegated-access.js';

export function createDelegatedService({db,secret:configuredSecret,network=requireSchoolNetwork,authorize=desktopAdminAccess}) {
const grants=db.collection('delegated_admin_grants');
async function authorizedDelegate(headers, menu) {
  const secret=configuredSecret();
  if (!validAdminKey(secret)) return false;
  const session=readSession(headers?.['x-dogae-delegated'],secret);
  if (!session) return false;
  const doc=await grants.doc(grantId(session.name,secret)).get();
  const grant=doc.exists?doc.data():null;
  return !!grant && grant.revision===session.revision && grant.enabled===true && Array.isArray(grant.menus) && grant.menus.includes(menu);
}
async function delegatedHandler(req,res) {
  if(!allowJson(req,res,['POST'])||!network(req,res))return;
  const secret=configuredSecret();if(!validAdminKey(secret))return res.status(503).json({error:'관리자 인증 설정을 확인하세요.'});
  const action=req.body?.action;
  try {
    if(action==='login') {
      const {name,pin}=normalizeGrant({name:req.body?.name,pin:req.body?.pin,menus:['students']});
      const ref=grants.doc(grantId(name,secret));
      const result=await db.runTransaction(async tx=>{
        const doc=await tx.get(ref), record=doc.exists?doc.data():null,now=Date.now();
        if(!record||!record.enabled)return null;
        if(Number(record.lockedUntil)>now)return {locked:true};
        if(!verifyPin(pin,record)) {const fails=(Number(record.fails)||0)+1;tx.update(ref,{fails:fails>=5?0:fails,lockedUntil:fails>=5?now+5*60*1000:0});return null;}
        tx.update(ref,{fails:0,lockedUntil:0});
        return {token:issueSession(name,record.revision,secret,now),menus:record.menus};
      });
      if(result?.locked)return res.status(429).json({error:'인증번호를 여러 번 틀렸습니다. 5분 뒤 다시 시도하세요.'});
      if(!result)return res.status(401).json({error:'이름 또는 인증번호를 확인하세요.'});
      return res.status(200).json(result);
    }
    if(!await authorize(req.headers))return res.status(403).json({error:'전체 관리자 인증이 필요합니다.'});
    if(action==='list') {const docs=await grants.get();return res.status(200).json({grants:docs.docs.map(doc=>{const {name,menus,enabled}=doc.data();return {name,menus,enabled};})});}
    if(action==='save') {
      const supplied=typeof req.body?.pin==='string'&&req.body.pin.length>0,value=normalizeGrant({...req.body,pin:supplied?req.body.pin:'0000'}),revision=randomBytes(16).toString('hex'),ref=grants.doc(grantId(value.name,secret));
      const changed=await db.runTransaction(async tx=>{const old=await tx.get(ref);if(!supplied&&!old.exists)return false;const pinRecord=supplied?hashPin(value.pin):{salt:old.data().salt,hash:old.data().hash};if(!pinRecord.salt||!pinRecord.hash)throw Error('기존 인증번호를 확인할 수 없습니다.');tx.set(ref,{name:value.name,menus:value.menus,enabled:true,revision,...pinRecord,fails:0,lockedUntil:0});return true;});
      return changed?res.status(200).json({ok:true}):res.status(400).json({error:'새 권한에는 인증번호가 필요합니다.'});
    }
    if(action==='remove') {const {name}=normalizeGrant({name:req.body?.name,pin:'0000',menus:['students']});await grants.doc(grantId(name,secret)).delete();return res.status(200).json({ok:true});}
    return res.status(400).json({error:'알 수 없는 요청입니다.'});
  } catch(error) {console.error('delegated authorization failed',error.message);return res.status(400).json({error:'권한 설정을 처리하지 못했습니다.'});}
}

return {authorizedDelegate,delegatedHandler};
}
