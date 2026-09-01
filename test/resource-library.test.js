import test from 'node:test';
import assert from 'node:assert/strict';
import { googleDriveDownloadUrl, googleDriveFileId, isGoogleDriveFileLink } from '../lib/resource-library.js';

test('Google Drive 공유 파일 링크에서 파일 ID와 다운로드 주소를 만든다', () => {
  const link = 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view?usp=sharing';
  assert.equal(googleDriveFileId(link), '1AbCdEfGhIjKlMnOpQrStUvWxYz');
  assert.equal(isGoogleDriveFileLink(link), true);
  assert.equal(googleDriveDownloadUrl(link), 'https://drive.usercontent.google.com/download?id=1AbCdEfGhIjKlMnOpQrStUvWxYz&export=download&confirm=t');
});

test('Google Drive 파일 링크가 아닌 주소는 자료 링크로 등록하지 않는다', () => {
  assert.equal(isGoogleDriveFileLink('https://example.com/file.pdf'), false);
  assert.equal(googleDriveDownloadUrl('https://drive.google.com/folderview?id=abc'), '');
});
