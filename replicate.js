// netlify/functions/replicate.js
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  const KEY = process.env.REPLICATE_API_KEY;
  if (!KEY) {
    return {
      statusCode: 500, headers: CORS,
      body: JSON.stringify({ error: 'Netlify 환경변수 REPLICATE_API_KEY 를 설정해주세요.' }),
    };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: '잘못된 요청' }) }; }

  const { action, model, input, predictionId } = body;

  try {
    if (action === 'create') {
      // "owner/name" 형식이면 최신 API, "hash" 형식이면 구형 API
      const isVersionHash = !model.includes('/');
      const url = isVersionHash
        ? 'https://api.replicate.com/v1/predictions'
        : 'https://api.replicate.com/v1/models/' + model + '/predictions';

      const reqBody = isVersionHash
        ? { version: model, input }
        : { input };

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json', 'Prefer': 'wait=5' },
        body: JSON.stringify(reqBody),
      });
      const data = await resp.json();
      return { statusCode: resp.ok ? 200 : resp.status, headers: CORS, body: JSON.stringify(data) };
    }

    if (action === 'poll') {
      const resp = await fetch('https://api.replicate.com/v1/predictions/' + predictionId, {
        headers: { 'Authorization': 'Bearer ' + KEY },
      });
      const data = await resp.json();
      return { statusCode: resp.ok ? 200 : resp.status, headers: CORS, body: JSON.stringify(data) };
    }

    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'unknown action' }) };
  } catch(e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
