const DRIVE_FILE_ID = /^[A-Za-z0-9_-]{10,200}$/;

export function googleDriveFileId(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || !/(^|\.)drive\.google\.com$/i.test(url.hostname)) return '';
    const pathId = url.pathname.match(/\/file\/d\/([A-Za-z0-9_-]{10,200})(?:\/|$)/)?.[1];
    const queryId = url.searchParams.get('id');
    return pathId || (DRIVE_FILE_ID.test(queryId || '') ? queryId : '');
  } catch {
    return '';
  }
}

export function isGoogleDriveFileLink(value) {
  return Boolean(googleDriveFileId(value));
}

export function googleDriveDownloadUrl(value) {
  const id = googleDriveFileId(value);
  return id ? `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t` : '';
}
