export const config = { matcher: '/:path*' };

export default function middleware(request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') || '';

  // ★ 허용 IP 목록
  const ALLOWED = [
    '117.110.113.',   // 학교 IP 대역 전체 (117.110.113.0 ~ 117.110.113.255)
    '127.0.0.1',      // 로컬 테스트
    '::1',            // 로컬 IPv6
  ];

  const allowed = ALLOWED.some(function(a) {
    return ip === a || ip.startsWith(a);
  });

  if (!allowed) {
    return new Response(
      `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>접근 제한 · 도개중고등학교</title>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@700&family=Noto+Sans+KR:wght@400;500&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{
      font-family:'Noto Sans KR',sans-serif;
      background:#F0F2F8;
      display:flex;align-items:center;justify-content:center;
      min-height:100vh;padding:20px;
    }
    .box{
      background:#fff;border-radius:20px;
      padding:48px 40px;text-align:center;
      box-shadow:0 12px 48px rgba(37,62,138,.12);
      max-width:420px;width:100%;
    }
    .lock{
      width:64px;height:64px;border-radius:50%;
      background:#EEF2FB;display:flex;align-items:center;
      justify-content:center;margin:0 auto 24px;
    }
    .lock svg{width:30px;height:30px;color:#253E8A;}
    h2{
      font-family:'Noto Serif KR',serif;font-size:20px;
      color:#182B6A;margin-bottom:10px;
    }
    p{font-size:13.5px;color:#64748B;line-height:1.8;}
    .ip-tag{
      display:inline-block;margin-top:16px;
      background:#F0F2F8;border-radius:8px;
      padding:6px 14px;font-size:12px;color:#94A3B8;
    }
    .contact{
      margin-top:24px;padding-top:20px;
      border-top:1px solid #E0E5F0;
      font-size:12px;color:#B0BAC8;
    }
  </style>
</head>
<body>
  <div class="box">
    <div class="lock">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    </div>
    <h2>접근이 제한된 페이지입니다</h2>
    <p>이 페이지는 도개중고등학교<br>교내 네트워크에서만 접속할 수 있습니다.</p>
    <div class="ip-tag">현재 IP: ${ip || '확인 불가'}</div>
    <div class="contact">문의: 정보부</div>
  </div>
</body>
</html>`,
      {
        status: 403,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      }
    );
  }
}
