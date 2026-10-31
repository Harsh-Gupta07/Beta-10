import { randomUUID } from 'node:crypto'
import { env } from '../config/env.js'

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
    if (!env.AI_API_KEY || !image) throw new Error('Vision provider is not configured.')
    const prompt = `Propose visible ${kind}. Return JSON only: {"confidence":0-1,"assumptions":[string],"items":[{"name":string,"quantity":number,"unit":"g"|"ml"|"count","confidence":0-1}]}. Never claim exact quantities; use editable estimates.`
    const response = await fetch(`${env.AI_API_BASE_URL}/models/${encodeURIComponent(env.AI_VISION_MODEL)}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': env.AI_API_KEY }, signal: AbortSignal.timeout(25000),
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: image.mimeType, data: image.base64 } }] }], generationConfig: { temperature: 0.1, responseMimeType: 'application/json' } }),
    })
    if (!response.ok) throw new Error('Vision provider unavailable.')
    const body = await response.json() as any
    const text = body.candidates?.[0]?.content?.parts?.find((part: any) => part.text)?.text
    if (!text) throw new Error('Vision provider returned no proposal.')
    return JSON.parse(text) as ScanProposal
  }
}

export function visionProvider(image?: ImageInput): FoodVisionProvider {
  return env.AI_API_KEY && image ? new GeminiFoodVisionProvider() : new MockFoodVisionProvider()
}

