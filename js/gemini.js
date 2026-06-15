const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

export async function extractNutritionLabel(imageB64, mimeType, apiKey) {
  const res = await fetch(GROQ_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${imageB64}` }
          },
          {
            type: 'text',
            text: `Extract nutrition facts from this label. Return ONLY a JSON object — no other text. All values must be per 100g. If the label shows per-serving values, convert: divide each value by the serving size in grams, then multiply by 100. Use null for nutrients not shown on the label.

{
  "serving_size_g": number,
  "calories": number,
  "protein_g": number,
  "carbs_g": number,
  "fat_g": number,
  "fiber_g": number or null,
  "sodium_mg": number or null,
  "calcium_mg": number or null,
  "iron_mg": number or null,
  "potassium_mg": number or null,
  "magnesium_mg": number or null,
  "zinc_mg": number or null,
  "vitamin_a_mcg": number or null,
  "vitamin_c_mg": number or null,
  "vitamin_d_mcg": number or null
}`
          }
        ]
      }]
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Groq API error (${res.status})`);
  }

  const data = await res.json();
  const text = (data.choices?.[0]?.message?.content || '').trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Could not parse nutrition data from label image');
  return JSON.parse(match[0]);
}

export function labelDataToNutrients(d) {
  const map = {};
  if (d.calories      != null) map[1008] = d.calories;
  if (d.protein_g     != null) map[1003] = d.protein_g;
  if (d.carbs_g       != null) map[1005] = d.carbs_g;
  if (d.fat_g         != null) map[1004] = d.fat_g;
  if (d.fiber_g       != null) map[1079] = d.fiber_g;
  if (d.sodium_mg     != null) map[1093] = d.sodium_mg;
  if (d.calcium_mg    != null) map[1087] = d.calcium_mg;
  if (d.iron_mg       != null) map[1089] = d.iron_mg;
  if (d.potassium_mg  != null) map[1092] = d.potassium_mg;
  if (d.magnesium_mg  != null) map[1090] = d.magnesium_mg;
  if (d.zinc_mg       != null) map[1095] = d.zinc_mg;
  if (d.vitamin_a_mcg != null) map[1106] = d.vitamin_a_mcg;
  if (d.vitamin_c_mg  != null) map[1162] = d.vitamin_c_mg;
  if (d.vitamin_d_mcg != null) map[1114] = d.vitamin_d_mcg;
  return map;
}
