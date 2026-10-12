import {requireSchoolNetwork} from './school-access.js';
export function networkCheck(req,res){res.setHeader('Cache-Control','no-store');if(!['GET','HEAD'].includes(req.method))return res.status(405).json({error:'지원하지 않는 요청입니다.'});if(!requireSchoolNetwork(req,res))return;if(req.method==='HEAD')return res.status(200).end();return res.status(200).json({schoolAllowed:true});}
