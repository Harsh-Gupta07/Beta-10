import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Prisma } from '@prisma/client'
import { allocate, type MealDemand } from './allocation.js'
import { addDays, isDateString, localToday, weekStartOf } from './dates.js'

const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value)
const t0 = new Date('2026-01-01T00:00:00Z')
const meal = (mealId: string, date: string, slot: MealDemand['slot'], lines: Array<[string, Prisma.Decimal.Value]>): MealDemand =>
  ({ mealId, date, slot, createdAt: t0, lines: lines.map(([ingredientId, quantity]) => ({ ingredientId, quantity: D(quantity) })) })
const str = (line: { required: Prisma.Decimal; allocated: Prisma.Decimal; shortage: Prisma.Decimal } | undefined) =>
  line && [line.required.toString(), line.allocated.toString(), line.shortage.toString()]

describe('allocate', () => {
  it('adds repeated daily shortfalls instead of reporting only the first meal', () => {
    const result = allocate(new Map([['spinach', D(0)]]), [
      meal('today', '2026-11-01', 'DINNER', [['spinach', 10]]),
      meal('tomorrow', '2026-11-02', 'DINNER', [['spinach', 10]]),
    ])
    const position = result.byIngredient.get('spinach')!
    assert.equal(position.required.toString(), '20')
    assert.equal(position.shortage.toString(), '20')
    assert.deepEqual(position.shortMealIds, ['today', 'tomorrow'])
  })

  it('reserves stock earliest meal first and reports the shortage (spec rice example)', () => {
    const meals = [meal('mon', '2026-03-02', 'LUNCH', [['rice', 300]]), meal('tue', '2026-03-03', 'LUNCH', [['rice', 400]]), meal('wed', '2026-03-04', 'LUNCH', [['rice', 500]])]
    const result = allocate(new Map([['rice', D(1000)]]), meals)
    assert.deepEqual(str(result.byMeal.get('mon')!.get('rice')), ['300', '300', '0'])
    assert.deepEqual(str(result.byMeal.get('tue')!.get('rice')), ['400', '400', '0'])
    assert.deepEqual(str(result.byMeal.get('wed')!.get('rice')), ['500', '300', '200'])
    const rice = result.byIngredient.get('rice')!
    assert.deepEqual([rice.onHand, rice.required, rice.allocated, rice.unallocated, rice.shortage].map(String), ['1000', '1200', '1000', '0', '200'])
    assert.equal(rice.firstShortMealId, 'wed')
    assert.deepEqual(rice.mealIds, ['mon', 'tue', 'wed'])
  })

  it('does not depend on input order and orders slots within a day', () => {
    const meals = [meal('dinner', '2026-03-02', 'DINNER', [['milk', 500]]), meal('breakfast', '2026-03-02', 'BREAKFAST', [['milk', 400]]), meal('lunch', '2026-03-02', 'LUNCH', [['milk', 200]])]
    const a = allocate(new Map([['milk', D(700)]]), meals)
    const b = allocate(new Map([['milk', D(700)]]), [...meals].reverse())
    for (const result of [a, b]) {
      assert.deepEqual(str(result.byMeal.get('breakfast')!.get('milk')), ['400', '400', '0'])
      assert.deepEqual(str(result.byMeal.get('lunch')!.get('milk')), ['200', '200', '0'])
      assert.deepEqual(str(result.byMeal.get('dinner')!.get('milk')), ['500', '100', '400'])
      assert.equal(result.byIngredient.get('milk')!.firstShortMealId, 'dinner')
    }
  })

  it('leaves unallocated stock and never allocates the same stock twice', () => {
    const result = allocate(new Map([['milk', D(1000)], ['tea', D('50.5')]]), [
      meal('m1', '2026-03-02', 'BREAKFAST', [['milk', 400], ['tea', '10.25']]),
      meal('m2', '2026-03-02', 'LUNCH', [['milk', 500], ['sugar', 20]]),
    ])
    const milk = result.byIngredient.get('milk')!
    assert.deepEqual([milk.allocated, milk.unallocated, milk.shortage].map(String), ['900', '100', '0'])
    assert.equal(result.byIngredient.get('tea')!.unallocated.toString(), '40.25')
    const sugar = result.byIngredient.get('sugar')!
    assert.deepEqual([sugar.onHand, sugar.allocated, sugar.shortage].map(String), ['0', '0', '20'])
    assert.deepEqual(sugar.shortMealIds, ['m2'])
  })

  it('handles empty stock and no meals', () => {
    assert.equal(allocate(new Map(), []).byIngredient.size, 0)
    const result = allocate(new Map(), [meal('m', '2026-03-02', 'DINNER', [['dal', 200]])])
    assert.deepEqual(str(result.byMeal.get('m')!.get('dal')), ['200', '0', '200'])
  })
})

describe('dates', () => {
  it('computes today in the household timezone', () => {
    // 20:30 UTC on 30 Oct is already 31 Oct in India.
    assert.equal(localToday('Asia/Kolkata', new Date('2026-10-30T20:30:00Z')), '2026-10-31')
    assert.equal(localToday('UTC', new Date('2026-10-30T20:30:00Z')), '2026-10-30')
  })

  it('finds the Monday of a week and adds days', () => {
    assert.equal(weekStartOf('2026-11-01'), '2026-10-26') // Sunday
    assert.equal(weekStartOf('2026-10-26'), '2026-10-26') // Monday
    assert.equal(weekStartOf('2026-10-31'), '2026-10-26') // Saturday
    assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  })

  it('validates calendar dates', () => {
    assert.equal(isDateString('2026-02-28'), true)
    assert.equal(isDateString('2026-02-30'), false)
    assert.equal(isDateString('30-10-2026'), false)
  })
})
