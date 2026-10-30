import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Global ingredient catalog. Units are canonical: g (mass), ml (volume) or count (pieces).
const ingredients: Array<[name: string, category: string, canonicalUnit: 'g' | 'ml' | 'count']> = [
  ['Rice', 'Grains & Flours', 'g'], ['Basmati rice', 'Grains & Flours', 'g'], ['Wheat flour (atta)', 'Grains & Flours', 'g'],
  ['Semolina (rava)', 'Grains & Flours', 'g'], ['Flattened rice (poha)', 'Grains & Flours', 'g'], ['Gram flour (besan)', 'Grains & Flours', 'g'],
  ['Toor dal', 'Pulses', 'g'], ['Moong dal', 'Pulses', 'g'], ['Masoor dal', 'Pulses', 'g'], ['Chana dal', 'Pulses', 'g'],
  ['Rajma', 'Pulses', 'g'], ['Kabuli chana', 'Pulses', 'g'],
  ['Milk', 'Dairy', 'ml'], ['Curd', 'Dairy', 'g'], ['Paneer', 'Dairy', 'g'], ['Ghee', 'Dairy', 'ml'], ['Butter', 'Dairy', 'g'], ['Eggs', 'Dairy', 'count'],
  ['Onion', 'Vegetables', 'g'], ['Tomato', 'Vegetables', 'g'], ['Potato', 'Vegetables', 'g'], ['Carrot', 'Vegetables', 'g'],
  ['Green peas', 'Vegetables', 'g'], ['Cauliflower', 'Vegetables', 'g'], ['Capsicum', 'Vegetables', 'g'], ['Spinach', 'Vegetables', 'g'],
  ['French beans', 'Vegetables', 'g'], ['Green chilli', 'Vegetables', 'g'], ['Ginger', 'Vegetables', 'g'], ['Garlic', 'Vegetables', 'g'],
  ['Coriander leaves', 'Vegetables', 'g'], ['Curry leaves', 'Vegetables', 'g'], ['Lemon', 'Fruits', 'count'], ['Banana', 'Fruits', 'count'],
  ['Cumin seeds', 'Spices', 'g'], ['Mustard seeds', 'Spices', 'g'], ['Turmeric powder', 'Spices', 'g'], ['Red chilli powder', 'Spices', 'g'],
  ['Coriander powder', 'Spices', 'g'], ['Garam masala', 'Spices', 'g'], ['Chole masala', 'Spices', 'g'], ['Asafoetida (hing)', 'Spices', 'g'],
  ['Bay leaf', 'Spices', 'g'], ['Salt', 'Spices', 'g'],
  ['Oil', 'Oils & Essentials', 'ml'], ['Sugar', 'Oils & Essentials', 'g'], ['Peanuts', 'Oils & Essentials', 'g'], ['Tea leaves', 'Oils & Essentials', 'g'],
]

async function main() {
  for (const [name, category, canonicalUnit] of ingredients) {
    const nameKey = name.toLowerCase()
    const existing = await prisma.ingredient.findFirst({ where: { householdId: null, nameKey } })
    if (existing) {
      if (existing.canonicalUnit !== canonicalUnit) console.warn(`Keeping ${name} in ${existing.canonicalUnit}; seed says ${canonicalUnit}. Changing units of existing stock needs a data migration.`)
      await prisma.ingredient.update({ where: { id: existing.id }, data: { name, category } })
    } else {
      await prisma.ingredient.create({ data: { name, nameKey, category, canonicalUnit } })
    }
  }
  console.log(`Seeded ${ingredients.length} canonical ingredients.`)
}

main().finally(() => prisma.$disconnect())
