import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_RESOURCE_FILE_BYTES, RESOURCE_CHUNK_BYTES, isAllowedResourceFile, resourceChunkCount, resourceContentType } from '../lib/resource-library.js';

test('자료 파일은 허용된 업무 문서 형식과 3MB 이하 크기만 등록한다', () => {
  assert.equal(isAllowedResourceFile('회의자료.pdf', 1), true);
  assert.equal(isAllowedResourceFile('시간표.XLSX', MAX_RESOURCE_FILE_BYTES), true);
  assert.equal(isAllowedResourceFile('실행파일.exe', 120), false);
  assert.equal(isAllowedResourceFile('큰파일.pdf', MAX_RESOURCE_FILE_BYTES + 1), false);
});

test('자료의 내려받기 형식과 분할 저장 단위를 안전하게 만든다', () => {
  assert.equal(resourceContentType('자료.docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(resourceChunkCount(RESOURCE_CHUNK_BYTES + 1), 2);
  assert.equal(resourceChunkCount(0), 0);
});
