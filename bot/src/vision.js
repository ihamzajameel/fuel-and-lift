// Meal photo → nutrition estimate with Claude (vision + structured JSON output).
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

const MODEL = process.env.VISION_MODEL || 'claude-opus-5-5';

// Reads ANTHROPIC_API_KEY from the environment.
const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
export const visionEnabled = () => !!client;

const Macro = {
  kcal: z.number().describe('Calories'),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
};

export const MealEstimate = z.object({
  is_food: z.boolean().describe('False if the photo does not show food or drink'),
  meal_name: z.string().describe('Short name for the log, e.g. "Chicken karahi + 2 roti"'),
  items: z.array(z.object({ name: z.string(), portion: z.string().describe('e.g. "2 pieces", "1 cup (200 g)"'), ...Macro })),
  total: z.object(Macro),
  confidence: z.enum(['low', 'medium', 'high']),
  matched_preset_id: z.string().nullable().describe("id of the user's usual meal this matches, or null"),
  tip: z.string().describe('One short practical note for a lean bulk, or an empty string'),
});

const SYSTEM = `You estimate the nutrition of meals from photos for a personal food log.
The user is a 31-year-old man in Dubai on a lean bulk (about 2,850 kcal and 160 g protein a day). He mostly eats Pakistani, Indian and Gulf home food: roti, rice, daal, chicken or mutton curry (served as "boti" pieces), biryani, eggs, laban, dates, nuts and a large morning protein shake.
Judge portions from visual cues such as plate and bowl size, cutlery, hands and packaging. Count cooking oil and ghee realistically, since it is the most commonly underestimated part of curries.
If the photo matches one of his usual meals, set matched_preset_id to its id and stay close to its numbers unless the photo clearly shows a different portion.
His own note about the photo, when given, overrides what you see (for example "3 roti" or "half eaten").
Keep the items list to what is visible, with totals equal to the sum of the items.`;

/**
 * @param {{ base64: string, mediaType: string, hint?: string, presets?: object[] }} input
 * @returns {Promise<z.infer<typeof MealEstimate>>}
 */
export async function estimateMeal({ base64, mediaType, hint, presets = [] }) {
  if (!client) throw new Error('ANTHROPIC_API_KEY is not set');
  const usual = presets.map((p) => `- ${p.id}: ${p.name} (${p.kcal} kcal, ${p.p} g P, ${p.c} g C, ${p.f} g F)`).join('\n');
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: betaZodOutputFormat(MealEstimate) },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          {
            type: 'text',
            text: `His usual meals:\n${usual || '(none)'}\n\n${hint ? `His note about this photo: "${hint}"` : 'No note.'}\n\nEstimate this meal.`,
          },
        ],
      },
    ],
  });
  if (response.stop_reason === 'refusal') throw new Error('The model declined to analyse this photo.');
  if (response.stop_reason === 'max_tokens' || !response.parsed_output) throw new Error('Could not read an estimate from the response.');
  const est = response.parsed_output;
  const r = (n) => Math.max(0, Math.round(Number(n) || 0));
  return {
    ...est,
    total: { kcal: r(est.total.kcal), protein_g: r(est.total.protein_g), carbs_g: r(est.total.carbs_g), fat_g: r(est.total.fat_g) },
    items: est.items.map((i) => ({ ...i, kcal: r(i.kcal), protein_g: r(i.protein_g), carbs_g: r(i.carbs_g), fat_g: r(i.fat_g) })),
    model: response.model,
    usage: { input: response.usage?.input_tokens, output: response.usage?.output_tokens },
  };
}
