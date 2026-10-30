import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Prisma } from '@prisma/client'
import { AppError } from '../lib/errors.js'
import { expiryState, scaleQuantity, stockStatus, toCanonical, unitsFor } from './units.js'

const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value)

describe('toCanonical', () => {
  it('converts within a unit family using exact decimal math', () => {
    assert.equal(toCanonical('1.5', 'kg', 'g').toString(), '1500')
    assert.equal(toCanonical(0.3, 'l', 'ml').toString(), '300')
    assert.equal(toCanonical('0.1', 'kg', 'g').plus(toCanonical('0.2', 'kg', 'g')).toString(), '300')
    assert.equal(toCanonical('250', 'ml', 'ml').toString(), '250')
    assert.equal(toCanonical(6, 'pcs', 'count').toString(), '6')
  })

  it('rounds to the 3 decimal places the database stores', () => {
    assert.equal(toCanonical('0.0004', 'g', 'g').toString(), '0')
    assert.equal(toCanonical('1.2345', 'g', 'g').toString(), '1.235')
  })

  it('rejects cross-family conversions instead of guessing', () => {
    assert.throws(() => toCanonical(500, 'ml', 'g'), (e: unknown) => e instanceof AppError && e.status === 422)
    assert.throws(() => toCanonical(1, 'kg', 'ml'), AppError)
    assert.throws(() => toCanonical(2, 'pcs', 'g'), AppError)
  })

  it('rejects negative, fractional-count and oversized values', () => {
    assert.throws(() => toCanonical(-1, 'g', 'g'), AppError)
    assert.throws(() => toCanonical('1.5', 'pcs', 'count'), AppError)
    assert.throws(() => toCanonical('200000', 'kg', 'g'), AppError)
  })

  it('lists the input units allowed for each canonical unit', () => {
    assert.deepEqual(unitsFor('g'), ['g', 'kg'])
    assert.deepEqual(unitsFor('ml'), ['ml', 'l'])
    assert.deepEqual(unitsFor('count'), ['pcs'])
  })
})

describe('scaleQuantity', () => {
  it('scales mass and volume exactly and rounds counts up', () => {
    assert.equal(scaleQuantity(D(200), 4, 6, 'g').toString(), '300')
    assert.equal(scaleQuantity(D(1), 4, 3, 'g').toString(), '0.75')
    assert.equal(scaleQuantity(D(100), 3, 1, 'ml').toString(), '33.333')
    assert.equal(scaleQuantity(D(6), 3, 2, 'count').toString(), '4')
    assert.equal(scaleQuantity(D(1), 4, 1, 'count').toString(), '1')
  })

  it('rejects invalid servings', () => {
    assert.throws(() => scaleQuantity(D(1), 4, 0, 'g'), AppError)
    assert.throws(() => scaleQuantity(D(1), 4, 1.5, 'g'), AppError)
  })
})

describe('stockStatus', () => {
  it('derives OUT, LOW and OK', () => {
    assert.equal(stockStatus(D(0), null), 'OUT')
    assert.equal(stockStatus(D(200), D(250)), 'LOW')
    assert.equal(stockStatus(D(250), D(250)), 'LOW')
    assert.equal(stockStatus(D(251), D(250)), 'OK')
    assert.equal(stockStatus(D(5), null), 'OK')
  })
})

describe('expiryState', () => {
  const now = new Date('2026-01-10T12:00:00Z')
  it('flags expired and soon-to-expire stock', () => {
    assert.equal(expiryState(null, now), null)
    assert.equal(expiryState(new Date('2026-01-09T00:00:00Z'), now), 'EXPIRED')
    assert.equal(expiryState(new Date('2026-01-12T00:00:00Z'), now), 'SOON')
    assert.equal(expiryState(new Date('2026-01-20T00:00:00Z'), now), null)
  })
})
