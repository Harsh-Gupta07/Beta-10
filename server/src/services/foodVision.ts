import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { env } from '../config/env.js'
import { AppError } from '../lib/errors.js'

export type ScanProposal = { confidence: number; assumptions: string[]; items: Array<{ ingredientId?: string; name: string; quantity: number; unit: 'g' | 'ml' | 'count'; confidence: number }> }
export interface FoodVisionProvider { analyseMeal(image?: ImageInput): Promise<ScanProposal>; analyseGroceries(image?: ImageInput): Promise<ScanProposal> }
export type ImageInput = { mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; base64: string }

/** Reliable demo provider. It proposes estimates only; confirmation and all maths happen elsewhere. */
export class MockFoodVisionProvider implements FoodVisionProvider {
  async analyseMeal() { return { confidence: .72, assumptions: ['Estimated from a single image; ingredients and portion size may differ.'], items: [{ name: 'Rajma', quantity: 220, unit: 'g' as const, confidence: .78 }, { name: 'Rice', quantity: 180, unit: 'g' as const, confidence: .7 }] } }
  async analyseGroceries() { return { confidence: .81, assumptions: ['Package sizes are estimates. Check every quantity before confirming.'], items: [{ name: 'Milk', quantity: 1000, unit: 'ml' as const, confidence: .92 }, { name: 'Tomato', quantity: 500, unit: 'g' as const, confidence: .76 }, { name: 'Rice', quantity: 1000, unit: 'g' as const, confidence: .83 }] } }
}
export const privateImageReference = () => `private://food-scans/${randomUUID()}`

export class GeminiFoodVisionProvider implements FoodVisionProvider {
  async analyseMeal(image?: ImageInput) { return this.analyse('cooked meal', image) }
  async analyseGroceries(image?: ImageInput) { return this.analyse('grocery items', image) }
  private async analyse(kind: string, image?: ImageInput): Promise<ScanProposal> {
    if (!env.AI_API_KEY || !image) throw new AppError(503, 'Image recognition is not configured. Set AI_API_KEY in server/.env and restart the server.', 'FOOD_VISION_NOT_CONFIGURED')
    const prompt = `Carefully inspect this ${kind} photo. Identify every clearly visible food item, using simple ingredient names rather than brand names when possible. Estimate a realistic quantity for each item; never claim it is exact. Use only g for weight, ml for liquids, or count for individual pieces. If the photo is unclear, return an empty items array and explain why in assumptions. Return JSON only in this shape: {"confidence":0.0,"assumptions":["string"],"items":[{"name":"string","quantity":1,"unit":"g","confidence":0.0}]}`
    let response: Response
    try {
      response = await fetch(`${env.AI_API_BASE_URL}/models/${encodeURIComponent(env.AI_VISION_MODEL)}:generateContent`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': env.AI_API_KEY }, signal: AbortSignal.timeout(25000),
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: image.mimeType, data: image.base64 } }] }], generationConfig: { temperature: 0.1, responseMimeType: 'application/json' } }),
      })
    } catch (error) {
      console.error('[food-vision] Gemini request failed', error)
      throw new AppError(503, 'Could not reach the image recognition service. Check your connection and try again.', 'FOOD_VISION_UNAVAILABLE')
    }
    if (!response.ok) {
      console.error('[food-vision] Gemini rejected the image request', { status: response.status, model: env.AI_VISION_MODEL })
      if (response.status === 401 || response.status === 403) {
        throw new AppError(502, 'Gemini rejected the AI key. Check AI_API_KEY in server/.env and restart the server.', 'FOOD_VISION_AUTH_FAILED')
      }
      if (response.status === 429) throw new AppError(503, 'Gemini image recognition is temporarily rate-limited. Please wait and try again.', 'FOOD_VISION_RATE_LIMITED')
      throw new AppError(502, 'Gemini could not analyze this image. Check the image and AI_VISION_MODEL setting, then try again.', 'FOOD_VISION_FAILED')
    }
    let body: unknown
    try {
      body = await response.json()
    } catch (error) {
      console.error('[food-vision] Gemini returned invalid JSON', error)
      throw new AppError(502, 'Gemini returned an unreadable image analysis. Please try again with a clearer photo.', 'FOOD_VISION_INVALID_RESPONSE')
    }
    const responseBody = z.object({
      candidates: z.array(z.object({
        content: z.object({ parts: z.array(z.object({ text: z.string().optional() }).passthrough()).optional() }).optional(),
      }).passthrough()).optional(),
    }).passthrough().safeParse(body)
    const text = responseBody.success ? responseBody.data.candidates?.[0]?.content?.parts?.find(part => part.text)?.text : undefined
    if (!text) throw new AppError(422, 'Gemini could not identify food in this photo. Try a brighter, closer image with the items clearly visible.', 'FOOD_VISION_NO_ITEMS')
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (error) {
      console.error('[food-vision] Gemini returned malformed proposal JSON', error)
      throw new AppError(502, 'Gemini returned an unreadable image analysis. Please try again with a clearer photo.', 'FOOD_VISION_INVALID_RESPONSE')
    }
    const proposal = z.object({
      confidence: z.number().min(0).max(1).default(0.5),
      assumptions: z.array(z.string().max(300)).max(20).default([]),
      items: z.array(z.object({
        name: z.string().trim().min(1).max(100),
        quantity: z.number().positive().max(100000),
        unit: z.enum(['g', 'ml', 'count']),
        confidence: z.number().min(0).max(1).default(0.5),
      })).max(50).default([]),
    }).safeParse(parsed)
    if (!proposal.success) {
      console.error('[food-vision] Gemini proposal did not match the scan format', proposal.error.issues)
      throw new AppError(502, 'Gemini returned an invalid item list. Please try again with a clearer photo.', 'FOOD_VISION_INVALID_RESPONSE')
    }
    return proposal.data
  }
}

export function visionProvider(image?: ImageInput): FoodVisionProvider {
  return image ? new GeminiFoodVisionProvider() : new MockFoodVisionProvider()
}
