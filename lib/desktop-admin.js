export const DESKTOP_ADMIN_HEADER='x-dogae-desktop-admin';
export function validAdminKey(value){return typeof value==='string'&&/^[A-Za-z0-9_-]{32,256}$/.test(value);}
export function requestAdminKey(headers){return typeof headers?.get==='function'?headers.get(DESKTOP_ADMIN_HEADER):headers?.[DESKTOP_ADMIN_HEADER];}
export async function desktopAdminAccess(headers,expected=process.env.DESKTOP_ADMIN_ACCESS_KEY){
  const provided=requestAdminKey(headers);if(!validAdminKey(expected)||!validAdminKey(provided))return false;
  const encoder=new TextEncoder();const [a,b]=await Promise.all([crypto.subtle.digest('SHA-256',encoder.encode(provided)),crypto.subtle.digest('SHA-256',encoder.encode(expected))]);
  const left=new Uint8Array(a),right=new Uint8Array(b);let diff=0;for(let i=0;i<left.length;i++)diff|=left[i]^right[i];return diff===0;
}
