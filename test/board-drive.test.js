import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoardDrive } from '../lib/board-drive.js';

test('Google Drive access token is refreshed and retained only on the server', async () => {
  const calls=[];
  const drive=createBoardDrive({clientId:'client',clientSecret:'secret',refreshToken:'refresh',fetchImpl:async (url,options)=>{
    calls.push({url,options});
    if (url.includes('oauth2.googleapis.com')) return Response.json({access_token:'temporary',expires_in:3600});
    return new Response('image',{status:200});
  }});
  await drive.read('image_id'); await drive.read('image_id');
  assert.equal(calls.length,3); assert.equal(calls[1].options.headers.authorization,'Bearer temporary');
  assert.match(String(calls[0].options.body),/grant_type=refresh_token/);
});

test('invalid identifiers and file types are rejected before contacting Drive', async () => {
  let calls=0;
  const drive=createBoardDrive({clientId:'client',clientSecret:'secret',refreshToken:'refresh',fetchImpl:async()=>{calls++;return Response.json({})}});
  await assert.rejects(drive.read('../outside'));
  await assert.rejects(drive.beginUpload('valid','file','text/html',1));
  assert.equal(calls,0);
});

test('upload session URL must point to the Google Drive upload endpoint', async () => {
  const drive=createBoardDrive({clientId:'client',clientSecret:'secret',refreshToken:'refresh',fetchImpl:async url => url.includes('oauth2.googleapis.com') ? Response.json({access_token:'temporary',expires_in:3600}) : new Response(null,{status:200,headers:{location:'https://attacker.example/upload/drive/v3/files'}})});
  await assert.rejects(drive.beginUpload('valid','file','image/png',1024),/Invalid upload session/);
});

