import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';

// Keep this list limited to menus whose server-side authorization is implemented.
export const DELEGATABLE_MENUS = Object.freeze(['students']);
export const studentActionRequiresAdmin = action => typeof action === 'string' && (action.startsWith('roster:') || action === 'discipline:sync');
export function normalizeGrant({ name, pin, menus }) {
  const teacher = typeof name === 'string' ? name.normalize('NFC').trim() : '';
  if (!teacher || teacher.length > 40 || /[<>\u0000-\u001f/]/.test(teacher)) throw new Error('교사 이름을 확인하세요.');
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) throw new Error('인증번호는 숫자 4자리여야 합니다.');
  if (!Array.isArray(menus) || !menus.length || menus.some(menu => !DELEGATABLE_MENUS.includes(menu))) throw new Error('부여할 권한을 확인하세요.');
  return { name:teacher, pin, menus:[...new Set(menus)] };
}
export function hashPin(pin, salt = randomBytes(16).toString('hex')) {
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin) || !/^[0-9a-f]{32}$/.test(salt)) throw new Error('인증번호를 확인하세요.');
  return { salt, hash:scryptSync(pin, salt, 32).toString('hex') };
}
export function verifyPin(pin, record) {
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin) || !record || !/^[0-9a-f]{32}$/.test(record.salt || '') || !/^[0-9a-f]{64}$/.test(record.hash || '')) return false;
  return timingSafeEqual(scryptSync(pin, record.salt, 32), Buffer.from(record.hash, 'hex'));
}
export function grantId(name, secret) {
  return createHmac('sha256', secret).update(name.normalize('NFC').trim()).digest('hex');
}
export function issueSession(name, revision, secret, now = Date.now()) {
  const body=Buffer.from(JSON.stringify({name,revision,expires:now+8*60*60*1000})).toString('base64url');
  return body+'.'+createHmac('sha256',secret).update(body).digest('base64url');
}
export function readSession(token, secret, now = Date.now()) {
  if(typeof token!=='string'||token.length>2048||!secret)return null;
  const parts=token.split('.');if(parts.length!==2)return null;
  const expected=createHmac('sha256',secret).update(parts[0]).digest();let signature;
  try{signature=Buffer.from(parts[1],'base64url');}catch{return null;}
  if(signature.length!==expected.length||!timingSafeEqual(signature,expected))return null;
  try{const data=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));return typeof data.name==='string'&&typeof data.revision==='string'&&Number.isFinite(data.expires)&&data.expires>now?data:null;}catch{return null;}
}
