import { createServerFn } from "@tanstack/react-start";
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

/**
 * CrowdVision AI — real vision-based crowd detection.
 * Thin server-function wrapper: all runtime helpers live inside the handler
 * (prompt + schema) so this module stays a clean createServerFn declaration.
 *
 * Calls the Lovable AI Gateway with a vision-capable model and parses a
 * structured people-count + scene description. Degrades gracefully on
 * failure so the client always gets a usable shape.
 */

const VisionInput = z.object({
  image: z.string().min(1),
});

const VisionOutput = z.object({
  peopleCount: z.number(),
  density: z.enum(["low", "medium", "high"]),
  sceneDescription: z.string(),
  confidence: z.number(),
});

export type VisionResult = z.infer<typeof VisionOutput>;

export const analyzeWithVision = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => VisionInput.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      return {
        ok: false as const,
        error: "AI vision is not configured (missing API key).",
      };
    }

    const gateway = createLovableAiGatewayProvider(key);

    const prompt = [
      "You are a crowd-analytics vision model. Analyze this crowd image and estimate:",
      "- peopleCount: your best estimate of the number of people visible (integer >= 0).",
      "- density: 'low' (<~1 person/m²), 'medium' (~1-4), or 'high' (>4).",
      "- sceneDescription: one short sentence describing the setting and crowd.",
      "- confidence: 0..1 how confident you are in the count.",
      "Return only the JSON object.",
    ].join(" ");

    try {
      const { output } = await generateText({
        // Gemini Flash — current gen, fast, supports image input.
        model: gateway("google/gemini-3.6-flash"),
        output: Output.object({ schema: VisionOutput }),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: data.image } },
            ],
          },
        ],
      });
      return { ok: true as const, result: output };
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        // Try to salvage a JSON-ish fallback from raw text.
        const text = (error as { text?: string }).text ?? "";
        const m = text.match(/\{[\s\S]*\}/);
        if (m) {
          try {
            const parsed = VisionOutput.parse(JSON.parse(m[0]));
            return { ok: true as const, result: parsed };
          } catch {
            /* fall through */
          }
        }
      }
      const message =
        error instanceof Error ? error.message : "Vision analysis failed.";
      const status =
        typeof error === "object" &&
        error !== null &&
        "statusCode" in error &&
        (error as { statusCode: number }).statusCode;
      if (status === 429)
        return {
          ok: false as const,
          error: "AI vision rate limit reached. Try again shortly.",
        };
      if (status === 402)
        return {
          ok: false as const,
          error: "AI vision credits exhausted. Add credits to continue.",
        };
      return { ok: false as const, error: message };
    }
  });
