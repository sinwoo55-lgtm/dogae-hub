import {desktopAdminAccess,validAdminKey} from '../lib/desktop-admin.js';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'지원하지 않는 요청입니다.'});
  if(!validAdminKey(process.env.DESKTOP_ADMIN_ACCESS_KEY))return res.status(503).json({error:'서버 관리자 인증키가 아직 설정되지 않았습니다.'});
  if(!await desktopAdminAccess(req.headers))return res.status(401).json({error:'관리자 인증키가 일치하지 않습니다.'});
  return res.status(200).json({adminAuthorized:true});
}
