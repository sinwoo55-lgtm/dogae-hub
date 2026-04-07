export default async function handler(req, res) {
  // CORS 헤더
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, desc } = req.body;

  if (!name) {
    return res.status(400).json({ error: '활동명이 없습니다.' });
  }

  const prompt =
    '고등학교 활동명: ' + name +
    (desc ? '\n설명: ' + desc : '') +
    '\n\n이 활동과 관련 있는 대학 학과를 15개 이상 추천해. 학과명만 콤마로 나열해. 다른 말 하지 마.';

  // 환경변수 확인
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GROQ_API_KEY 환경변수가 없습니다.' });
  }

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500
      })
    });

    const data = await groqRes.json();

    if (!groqRes.ok) {
      return res.status(500).json({ error: data.error?.message || 'Groq 오류', status: groqRes.status });
    }

    const text = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({ text });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
