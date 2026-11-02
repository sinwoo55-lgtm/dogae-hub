import { createHash,timingSafeEqual } from 'node:crypto';
import { validAdminKey,requestAdminKey } from './desktop-admin.js';
import {clientIp,schoolIpAllowed} from './school-ip.js';
export function isSchoolNetwork(headers,configuredCidrs=process.env.SCHOOL_ALLOWED_CIDRS){const ip=clientIp(headers?.['x-vercel-forwarded-for']||headers?.['x-forwarded-for']);return schoolIpAllowed(ip,configuredCidrs);}
export function requireSchoolNetwork(req, res) {
  const expected=process.env.DESKTOP_ADMIN_ACCESS_KEY,provided=requestAdminKey(req.headers);
  if(validAdminKey(expected)&&validAdminKey(provided)&&timingSafeEqual(createHash('sha256').update(provided).digest(),createHash('sha256').update(expected).digest()))return true;
  const allowed=isSchoolNetwork(req.headers);

  if (allowed) return true;

  res.status(403).json({ error: '학교 네트워크에서만 이용할 수 있습니다.' });
  return false;
}
