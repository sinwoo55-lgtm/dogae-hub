export const MAX_RESOURCE_FILE_BYTES = 3 * 1024 * 1024;
export const RESOURCE_CHUNK_BYTES = 240 * 1024;

const CONTENT_TYPES = {
  pdf: 'application/pdf', hwp: 'application/x-hwp', hwpx: 'application/octet-stream',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv', txt: 'text/plain', zip: 'application/zip'
};

export function resourceFileExtension(fileName) {
  const match = typeof fileName === 'string' ? fileName.trim().toLowerCase().match(/\.([a-z0-9]+)$/) : null;
  return match ? match[1] : '';
}

export function resourceContentType(fileName) {
  return CONTENT_TYPES[resourceFileExtension(fileName)] || '';
}

export function isAllowedResourceFile(fileName, byteLength) {
  return Boolean(resourceContentType(fileName)) && Number.isInteger(byteLength) && byteLength > 0 && byteLength <= MAX_RESOURCE_FILE_BYTES;
}

export function resourceChunkCount(byteLength) {
  return Number.isInteger(byteLength) && byteLength > 0 ? Math.ceil(byteLength / RESOURCE_CHUNK_BYTES) : 0;
}
