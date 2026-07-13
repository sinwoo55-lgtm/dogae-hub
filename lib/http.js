export function allowJson(req, res, methods) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', methods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).end();
    return false;
  }

  if (!methods.includes(req.method)) {
    res.setHeader('Allow', methods.join(', '));
    res.status(405).json({ error: '지원하지 않는 요청 방식입니다.' });
    return false;
  }

  return true;
}

export function text(value, maxLength) {
  return typeof value === 'string' && value.trim().length <= maxLength ? value.trim() : null;
}
