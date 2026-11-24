const FALLBACK =
  'Automatic suggestions unavailable; enter event details manually.';

async function geminiClient(image, mimeType, key) {
  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key
      },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              text: 'Extract event title, date and location from this poster. Return JSON only. Use ISO 8601 for date. Do not invent missing details.'
            },
            {
              inlineData: {
                mimeType,
                data: image
              }
            }
          ]
        }],
        generationConfig: {
          responseMimeType: 'application/json'
        }
      })
    }
  );

  if (!response.ok) {
    throw new Error('Model unavailable');
  }

  const data = await response.json();

  return data.candidates?.[0]?.content?.parts?.[0]?.text;
}

export async function suggestPoster(
  image,
  mimeType,
  client = geminiClient,
  key = process.env.GEMINI_API_KEY
) {
  const fallback = {
    ok: false,
    message: FALLBACK
  };

  if (!key ||
      typeof image !== 'string' ||
      !image ||
      image.length > 2800000 ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
    return fallback;
  }

  let timer;

  try {
    const output = await Promise.race([
      client(image, mimeType, key),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Model timeout')),
          8000
        );
      })
    ]);

    const result = JSON.parse(output);

    if (typeof result?.title !== 'string' ||
        !result.title.trim() ||
        result.title.length > 200 ||
        typeof result.date !== 'string' ||
        !Number.isFinite(Date.parse(result.date)) ||
        Date.parse(result.date) <= Date.now() ||
        typeof result.location !== 'string' ||
        !result.location.trim() ||
        result.location.length > 200) {
      return fallback;
    }

    return {
      ok: true,
      suggestions: {
        title: result.title.trim(),
        date: new Date(result.date).toISOString(),
        location: result.location.trim()
      }
    };
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}
