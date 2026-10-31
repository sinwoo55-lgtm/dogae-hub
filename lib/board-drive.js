const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const DRIVE_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/drive/v3/files';

/** The refresh token stays on the server and is never returned to app clients. */
export function createBoardDrive({ clientId, clientSecret, refreshToken, fetchImpl = fetch }) {
  if (!clientId || !clientSecret || !refreshToken) throw new Error('Google Drive connection is not configured');
  let cachedToken = null, expiresAt = 0;
  async function accessToken() {
    if (cachedToken && Date.now() < expiresAt) return cachedToken;
    const response = await fetchImpl(TOKEN_ENDPOINT, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id:clientId, client_secret:clientSecret, refresh_token:refreshToken, grant_type:'refresh_token' })
    });
    if (!response.ok) throw new Error('Google Drive authorization failed');
    const data = await response.json();
    if (!data.access_token || !Number.isFinite(Number(data.expires_in))) throw new Error('Invalid Google Drive authorization response');
    cachedToken = data.access_token;
    expiresAt = Date.now() + Math.max(0, Number(data.expires_in) - 60) * 1000;
    return cachedToken;
  }
  async function call(url, options = {}) {
    const token = await accessToken();
    const response = await fetchImpl(url, { ...options, headers: { ...options.headers, authorization:`Bearer ${token}` } });
    if (!response.ok) throw new Error(`Google Drive request failed (${response.status})`);
    return response;
  }
  return {
    async reserveId() {
      const response = await call(`${DRIVE_ENDPOINT}/generateIds?count=1&space=drive`);
      const { ids } = await response.json();
      const id = ids?.[0];
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(id)) throw new Error('Invalid generated image ID');
      return id;
    },
    async ensureFolder(id) {
      if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) throw new Error('Invalid folder ID');
      try {
        await call(`${DRIVE_ENDPOINT}?fields=id`, {
          method:'POST', headers:{ 'content-type':'application/json; charset=UTF-8' },
          body:JSON.stringify({ id, name:'도개 허브 게시판', mimeType:'application/vnd.google-apps.folder' })
        });
      } catch (error) {
        if (error.message !== 'Google Drive request failed (409)') throw error;
      }
      const response = await call(`${DRIVE_ENDPOINT}/${encodeURIComponent(id)}?fields=id,mimeType,trashed`);
      const folder = await response.json();
      if (folder.id !== id || folder.mimeType !== 'application/vnd.google-apps.folder' || folder.trashed) throw new Error('Board folder unavailable');
    },
    async beginUpload(id, name, mimeType, size, folderId) {
      if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) throw new Error('Invalid image ID');
      if (typeof folderId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(folderId)) throw new Error('Invalid folder ID');
      if (!/^image\/(png|jpeg|webp)$/.test(mimeType) || !Number.isSafeInteger(size) || size < 1 || size > 20 * 1024 * 1024) throw new Error('Invalid image');
      const response = await call(`${UPLOAD_ENDPOINT}?uploadType=resumable&fields=id`, {
        method:'POST', headers:{ 'content-type':'application/json; charset=UTF-8', 'x-upload-content-type':mimeType, 'x-upload-content-length':String(size) },
        body:JSON.stringify({ id, name, parents:[folderId] })
      });
      const location = response.headers.get('location');
      const url = location && new URL(location);
      if (!url || url.protocol !== 'https:' || url.hostname !== 'www.googleapis.com' || !url.pathname.startsWith('/upload/drive/v3/files')) throw new Error('Invalid upload session');
      return location;
    },
    async metadata(id) {
      if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) throw new Error('Invalid image ID');
      const response = await call(`${DRIVE_ENDPOINT}/${encodeURIComponent(id)}?fields=id,name,mimeType,size,trashed`);
      return response.json();
    },
    async read(id, range) {
      if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) throw new Error('Invalid image ID');
      if (range && !/^bytes=\d+-\d+$/.test(range)) throw new Error('Invalid byte range');
      return call(`${DRIVE_ENDPOINT}/${encodeURIComponent(id)}?alt=media`, range ? { headers:{ range } } : {});
    },
    async remove(id) {
      if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) throw new Error('Invalid image ID');
      try { await call(`${DRIVE_ENDPOINT}/${encodeURIComponent(id)}`, { method:'DELETE' }); }
      catch (error) { if (error.message !== 'Google Drive request failed (404)') throw error; }
    }
  };
}
