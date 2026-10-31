import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Prisma } from '@prisma/client'
import { calculateRecipeNutrition, calculateTargets } from './nutritionEngine.js'

const D = (value: string | number) => new Prisma.Decimal(value)

describe('nutrition targets', () => {
  it('calculates Mifflin-St Jeor BMR, TDEE and conservative muscle-gain macros with Decimal math', () => {
    const result = calculateTargets({ ageYears: 30, biologicalSex: 'MALE', heightCm: 180, weightKg: 75, activityLevel: 'MODERATE', goal: 'MUSCLE_GAIN' })
    assert.equal(result.bmr.toString(), '1730')
    assert.equal(result.tdee.toString(), '2682')
    assert.equal(result.calorieTarget, 2950)
    assert.equal(result.proteinTargetG.toString(), '120')
    assert.equal(result.fatTargetG.toString(), '81.94')
    assert.equal(result.carbsTargetG.toString(), '433.13')
  })

  it('enforces a safe lower bound instead of recommending an extreme deficit', () => {
    const result = calculateTargets({ ageYears: 80, biologicalSex: 'FEMALE', heightCm: 145, weightKg: 40, activityLevel: 'SEDENTARY', goal: 'FAT_LOSS' })
    assert.equal(result.calorieTarget, 1200)
  })
})

describe('recipe nutrition', () => {
  it('scales verified ingredient values and reports missing data without treating it as zero', () => {
    const nutrition = { caloriesPer100: D(200), proteinG: D(20), carbsG: D(10), fatG: D(5), fibreG: D(3), source: 'Test source', sourceReference: 'TEST-1' }
    const result = calculateRecipeNutrition([
      { quantity: D(250), ingredient: { name: 'Paneer', canonicalUnit: 'g', nutrition } },
      { quantity: D(20), ingredient: { name: 'Homemade masala', canonicalUnit: 'g', nutrition: null } },
    ], 4, 2)
    assert.equal(result.calories.toString(), '250')
    assert.equal(result.proteinG.toString(), '25')
    assert.equal(result.completeness.toString(), '0.5')
    assert.deepEqual(result.missingIngredients, ['Homemade masala'])
  })
})

