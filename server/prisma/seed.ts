import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const ingredients = [
    ['Rice', 'Grains', 'g'], ['Milk', 'Dairy', 'ml'], ['Onion', 'Vegetables', 'g'],
    ['Tomato', 'Vegetables', 'g'], ['Potato', 'Vegetables', 'g'], ['Toor dal', 'Pulses', 'g'],
    ['Oil', 'Pantry', 'ml'], ['Salt', 'Pantry', 'g'], ['Paneer', 'Dairy', 'g'],
  ] as const
  for (const [name, category, canonicalUnit] of ingredients) {
    await prisma.ingredient.upsert({ where: { name }, update: { category, canonicalUnit }, create: { name, category, canonicalUnit } })
  }
  console.log(`Seeded ${ingredients.length} canonical ingredients.`)
}

main().finally(() => prisma.$disconnect())
