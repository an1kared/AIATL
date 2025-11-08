// Gemini Chef agent: generate recipes from ingredients and rank by nutrition.
// Requires Vite env var: VITE_GOOGLE_API_KEY
//
// Install SDK in app directory:
//   npm i @google/generative-ai
//

// Preferred models; availability depends on key/region.
const MODEL_PREFERENCE = [
  'gemini-1.5-pro-latest',
  'gemini-1.5-pro',
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash-8b-latest',
  'gemini-1.5-flash-8b',
  'gemini-1.5-flash',
  'gemini-2.0-flash-exp',
];

function stripModelsPrefix(name) {
  if (typeof name !== 'string') return name;
  return name.startsWith('models/') ? name.slice('models/'.length) : name;
}

function coerceJsonFromText(text) {
  if (!text) return null;
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonCandidate = fenceMatch ? fenceMatch[1] : trimmed;
  try {
    return JSON.parse(jsonCandidate);
  } catch {
    const start = jsonCandidate.indexOf('{');
    const end = jsonCandidate.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      const slice = jsonCandidate.slice(start, end + 1);
      try {
        return JSON.parse(slice);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeRecipes(raw) {
  const list = Array.isArray(raw?.recipes) ? raw.recipes : [];
  return list
    .map((r, idx) => {
      const minutes =
        typeof r.durationMinutes === 'number' && r.durationMinutes > 0
          ? r.durationMinutes
          : 20;
      const difficulty =
        typeof r.difficulty === 'string' && r.difficulty ? r.difficulty : 'Easy';
      const score =
        typeof r?.nutrition?.score === 'number' ? r.nutrition.score : 70;
      const idSource =
        typeof r.id === 'string' && r.id
          ? r.id
          : (typeof r.title === 'string' ? r.title : `recipe-${idx + 1}`);
      const id = idSource
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      return {
        id,
        title: typeof r.title === 'string' ? r.title : `Recipe ${idx + 1}`,
        difficulty,
        duration: `${minutes} min`,
        nutritionScore: Math.max(0, Math.min(100, Math.round(score))),
        summary: typeof r.summary === 'string' ? r.summary : '',
        ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
        steps: Array.isArray(r.steps) ? r.steps : [],
        media: {
          videoUrl: 'https://samplelib.com/lib/preview/mp4/sample-5s.mp4',
          audioUrl: 'https://samplelib.com/lib/preview/mp3/sample-3s.mp3',
        },
      };
    })
    .sort((a, b) => b.nutritionScore - a.nutritionScore);
}

async function pickAvailableModelName(genAI) {
  try {
    const list = await genAI.listModels();
    const models = Array.isArray(list?.models) ? list.models : [];
    const contentCapable = models.filter((m) => {
      const methods = Array.isArray(m?.supportedGenerationMethods)
        ? m.supportedGenerationMethods
        : [];
      return methods.includes('generateContent') || methods.includes('generateContentStream');
    });
    if (contentCapable.length === 0) return null;
    const scored = contentCapable
      .map((m) => {
        const id = stripModelsPrefix(m.name || '');
        const prefIndex = MODEL_PREFERENCE.findIndex((p) => id.includes(p));
        return { id, score: prefIndex === -1 ? Number.MAX_SAFE_INTEGER : prefIndex };
      })
      .sort((a, b) => a.score - b.score);
    return scored[0]?.id || null;
  } catch {
    return null;
  }
}

export async function generateRecipesFromIngredients(ingredients) {
  const apiKey =
    import.meta?.env?.VITE_GOOGLE_API_KEY ||
    (typeof window !== 'undefined'
      ? window.localStorage.getItem('VITE_GOOGLE_API_KEY')
      : null);
      console.log("Key being sent to Google:", import.meta.env.VITE_GOOGLE_API_KEY);
  if (import.meta?.env?.DEV) console.log('chef sees key?', !!apiKey);
  if (!apiKey) {
    throw new Error(
      'Missing VITE_GOOGLE_API_KEY. Create .env.local with VITE_GOOGLE_API_KEY=your_key, or run localStorage.setItem(\"VITE_GOOGLE_API_KEY\", \"your_key\") in the browser console for dev.'
    );
  }

  let GoogleGenerativeAI;
  try {
    ({ GoogleGenerativeAI } = await import('@google/generative-ai'));
  } catch {
    throw new Error('The @google/generative-ai package is not installed. Run: npm i @google/generative-ai');
  }


  const genAI = new GoogleGenerativeAI(apiKey);
  const userIngredients = Array.isArray(ingredients) ? ingredients : [];
  const ingredientsList = userIngredients.map((s) => `- ${s}`).join('\n');

  const systemPrompt = `
You are "Gemini Chef", an expert culinary agent. You create nutritious, delicious
recipes from given ingredients and score them for overall nutritional value.

INSTRUCTIONS:
- Propose 5 distinct recipes that use as many of the provided ingredients as practical.
- Optimize for high overall nutritional quality: emphasize protein, fiber, micronutrients,
  low added sugar, healthy fats, and minimally processed ingredients.
- For each recipe, compute a nutrition score from 0-100 (higher is better).
- Keep steps concise and practical.
- Make reasonable assumptions for pantry staples (oil, salt, pepper, basic spices).

OUTPUT STRICTLY AS JSON with this shape:
{
  "recipes": [
    {
      "id": "kebab-case-identifier",
      "title": "Readable Title",
      "summary": "1-2 sentence enticing overview",
      "durationMinutes": 15,
      "difficulty": "Easy",
      "ingredients": ["item 1", "item 2", "..."],
      "steps": ["step 1", "step 2", "..."],
      "nutrition": {
        "calories": 500,
        "protein_g": 35,
        "fiber_g": 10,
        "fat_g": 18,
        "carbs_g": 45,
        "sugar_g": 6,
        "score": 0
      }
    }
  ]
}

Only return JSON. Do not include commentary.
  `.trim();

  const userPrompt = `
INGREDIENTS AVAILABLE:
${ingredientsList || '(none specified)'}
  `.trim();

  const dynamic = await pickAvailableModelName(genAI);
  const candidates = dynamic ? [dynamic, ...MODEL_PREFERENCE] : MODEL_PREFERENCE;

  let text = '';
  let lastError = null;
  for (const modelName of candidates) {
    try {
      const resolved = stripModelsPrefix(modelName);
      const model = genAI.getGenerativeModel({ model: resolved });
      const result = await model.generateContent({
        contents: [
          { role: 'user', parts: [{ text: systemPrompt }, { text: '\n' + userPrompt }] },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.6,
        },
      });
      text = result?.response?.text?.() ?? '';
      if (text) break;
    } catch (err) {
      lastError = err;
      const msg = String(err?.message || '');
      if (msg.includes('404') || msg.includes('not found') || msg.includes('not supported')) {
        continue;
      }
      throw err;
    }
  }
  if (!text && lastError) {
    throw lastError;
  }

  const json = coerceJsonFromText(text);
  if (!json) {
    throw new Error('Gemini returned an unexpected response. Try again.');
  }
  return normalizeRecipes(json);
}

 