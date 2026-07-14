function normalizeIp(ip) {
  if (!ip) return '';
  const value = ip.trim();
  return value.startsWith('::ffff:') ? value.slice(7) : value;
}

function getClientIp(req) {
  // Vercel이 외부에서 전달한 X-Forwarded-For를 덮어써 IP 위조를 방지한다.
  // x-vercel-forwarded-for는 프록시가 추가된 경우에도 원본 Vercel 값을 보존한다.
  const raw = req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'];
  const forwarded = Array.isArray(raw) ? raw[0] : raw;
  // IPv4-mapped IPv6와 프록시 부가 문자열에서도 실제 IPv4만 뽑아낸다.
  return normalizeIp(String(forwarded || '').match(/(?:\d{1,3}\.){3}\d{1,3}/)?.[0] || String(forwarded || '').split(',')[0]);
}

function ipInCidr(ip, cidr) {
  const [network, bitsText] = cidr.trim().split('/');
  const bits = Number(bitsText);
  if (!network || !Number.isInteger(bits)) return false;

  // 현재 학교망은 IPv4 대역이다. IPv6 대역이 필요하면 명시적으로 확장한다.
  const ipParts = ip.split('.').map(Number);
  const networkParts = network.split('.').map(Number);
  if (ipParts.length !== 4 || networkParts.length !== 4 || bits < 0 || bits > 32) return false;
  if ([...ipParts, ...networkParts].some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;

  const ipNumber = ipParts.reduce((result, part) => (result * 256) + part, 0);
  const networkNumber = networkParts.reduce((result, part) => (result * 256) + part, 0);
  const divisor = 2 ** (32 - bits);
  return Math.floor(ipNumber / divisor) === Math.floor(networkNumber / divisor);
}

export function requireSchoolNetwork(req, res) {
  const configuredCidrs = process.env.SCHOOL_ALLOWED_CIDRS;
  const ip = getClientIp(req);
  const allowed = ip.startsWith('117.110.113.') || ip === '117.111.141.213' || configuredCidrs
    ?.split(',')
    .some((cidr) => ipInCidr(ip, cidr));

  if (allowed) return true;

  res.status(403).json({ error: '학교 네트워크에서만 이용할 수 있습니다.' });
  return false;
}
