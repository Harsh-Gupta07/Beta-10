// Shared starter recipes. Quantities are totals for `baseServings`, in each ingredient's canonical unit
// (g, ml, or pieces), and every ingredient name must exist in the global catalog in seed.ts.

export type SeedRecipe = {
  name: string
  category: string
  description: string
  baseServings: number
  prepMinutes: number
  cookMinutes: number
  ingredients: Array<[ingredient: string, quantity: number, note?: string]>
  instructions: string[]
}

export const recipes: SeedRecipe[] = [
  {
    name: 'Dal Tadka', category: 'Dals & Curries', baseServings: 4, prepMinutes: 15, cookMinutes: 30,
    description: 'Everyday toor dal finished with a sizzling ghee, cumin and garlic tempering.',
    ingredients: [['Toor dal', 200, 'rinsed'], ['Onion', 100, 'finely chopped'], ['Tomato', 150, 'chopped'], ['Ghee', 30], ['Cumin seeds', 5], ['Garlic', 10, 'sliced'], ['Ginger', 10, 'grated'], ['Green chilli', 10, 'slit'], ['Turmeric powder', 3], ['Red chilli powder', 3], ['Asafoetida (hing)', 1], ['Salt', 8], ['Coriander leaves', 10, 'to garnish']],
    instructions: [
      'Pressure-cook the rinsed dal with 600 ml water, turmeric and half the salt for 3–4 whistles until soft. Whisk lightly.',
      'Heat half the ghee, add onion, ginger and green chilli and cook until the onion is golden.',
      'Add tomato and red chilli powder and cook until the tomato breaks down. Stir in the dal, adjust water and salt, and simmer 5 minutes.',
      'For the tadka, heat the remaining ghee, add cumin, garlic and hing, and pour it sizzling over the dal.',
      'Garnish with coriander and serve with rice or roti.',
    ],
  },
  {
    name: 'Rajma Chawal', category: 'Rice', baseServings: 4, prepMinutes: 20, cookMinutes: 50,
    description: 'Punjabi kidney-bean curry in an onion-tomato masala, served with steamed basmati rice. Soak rajma overnight.',
    ingredients: [['Rajma', 250, 'soaked overnight'], ['Basmati rice', 300], ['Onion', 200, 'finely chopped'], ['Tomato', 250, 'puréed'], ['Ginger', 15, 'grated'], ['Garlic', 15, 'minced'], ['Oil', 40], ['Cumin seeds', 5], ['Bay leaf', 2], ['Coriander powder', 6], ['Red chilli powder', 4], ['Turmeric powder', 2], ['Garam masala', 4], ['Salt', 10]],
    instructions: [
      'Pressure-cook the soaked rajma with fresh water and a little salt for 6–7 whistles until completely soft.',
      'Rinse the rice and cook it with 600 ml water and a pinch of salt until fluffy.',
      'Heat oil, add cumin and bay leaf, then onion. Cook until deep golden, then add ginger and garlic.',
      'Add the tomato purée and powdered spices and cook until oil separates.',
      'Add the rajma with its cooking water and simmer 15–20 minutes, mashing a few beans to thicken. Finish with garam masala and serve over rice.',
    ],
  },
  {
    name: 'Kanda Batata Poha', category: 'Breakfast', baseServings: 4, prepMinutes: 10, cookMinutes: 15,
    description: 'Light Maharashtrian breakfast of flattened rice with onion, potato, peanuts and lemon.',
    ingredients: [['Flattened rice (poha)', 250, 'thick variety'], ['Onion', 120, 'chopped'], ['Potato', 150, 'small dice'], ['Peanuts', 40], ['Oil', 30], ['Mustard seeds', 4], ['Curry leaves', 5], ['Green chilli', 10, 'chopped'], ['Turmeric powder', 2], ['Sugar', 8], ['Salt', 6], ['Lemon', 1], ['Coriander leaves', 10]],
    instructions: [
      'Rinse the poha in a strainer until just softened, then drain and toss with salt, sugar and turmeric.',
      'Heat oil and fry the peanuts until crisp; set aside.',
      'In the same oil add mustard seeds, curry leaves and green chilli, then the potato. Cover and cook until tender.',
      'Add onion and cook until translucent, then fold in the poha and peanuts. Cover for 2 minutes on low heat.',
      'Finish with lemon juice and coriander.',
    ],
  },
  {
    name: 'Vegetable Pulao', category: 'Rice', baseServings: 4, prepMinutes: 15, cookMinutes: 25,
    description: 'Fragrant one-pot basmati rice with mixed vegetables and whole spices.',
    ingredients: [['Basmati rice', 300, 'soaked 20 min'], ['Carrot', 100, 'diced'], ['Green peas', 100], ['French beans', 80, 'chopped'], ['Onion', 120, 'sliced'], ['Ghee', 30], ['Cumin seeds', 4], ['Bay leaf', 2], ['Garam masala', 3], ['Ginger', 10, 'grated'], ['Garlic', 10, 'minced'], ['Salt', 8]],
    instructions: [
      'Heat ghee in a heavy pot and add cumin and bay leaf.',
      'Add onion and cook until light golden, then ginger and garlic.',
      'Add the vegetables and garam masala and sauté for 3 minutes.',
      'Add the drained rice, 600 ml hot water and salt. Bring to a boil, then cover and cook on low for 12 minutes.',
      'Rest 5 minutes covered, then fluff with a fork.',
    ],
  },
  {
    name: 'Paneer Bhurji', category: 'Breakfast', baseServings: 3, prepMinutes: 10, cookMinutes: 15,
    description: 'Scrambled paneer with onion, tomato and capsicum. Quick with roti or toast.',
    ingredients: [['Paneer', 300, 'crumbled'], ['Onion', 150, 'finely chopped'], ['Tomato', 150, 'finely chopped'], ['Capsicum', 80, 'finely chopped'], ['Butter', 25], ['Ginger', 10, 'grated'], ['Green chilli', 8, 'chopped'], ['Turmeric powder', 2], ['Red chilli powder', 3], ['Garam masala', 2], ['Salt', 5], ['Coriander leaves', 10]],
    instructions: [
      'Melt butter, add onion, ginger and green chilli and cook until soft.',
      'Add capsicum and tomato with the powdered spices and cook until the tomato is soft.',
      'Fold in the crumbled paneer and salt and cook 2–3 minutes. Don’t overcook or it turns rubbery.',
      'Finish with coriander.',
    ],
  },
  {
    name: 'Aloo Paratha', category: 'Breads & Rotis', baseServings: 4, prepMinutes: 30, cookMinutes: 30,
    description: 'Whole-wheat flatbreads stuffed with spiced potato, cooked with ghee. Makes about 8.',
    ingredients: [['Wheat flour (atta)', 400], ['Potato', 400, 'boiled and mashed'], ['Green chilli', 10, 'finely chopped'], ['Coriander leaves', 15, 'chopped'], ['Red chilli powder', 3], ['Garam masala', 3], ['Salt', 8], ['Ghee', 60], ['Curd', 200, 'to serve']],
    instructions: [
      'Knead the atta with a pinch of salt and water into a soft dough. Rest 15 minutes.',
      'Mix the mashed potato with green chilli, coriander, spices and salt.',
      'Roll a dough ball into a small disc, place filling in the centre, seal and roll gently into a paratha.',
      'Cook on a hot tawa, brushing with ghee on both sides until golden spots appear.',
      'Serve hot with curd.',
    ],
  },
  {
    name: 'Moong Dal Khichdi', category: 'Rice', baseServings: 4, prepMinutes: 10, cookMinutes: 25,
    description: 'Comforting rice and moong dal cooked soft with ghee and cumin.',
    ingredients: [['Rice', 150], ['Moong dal', 100], ['Ghee', 25], ['Cumin seeds', 4], ['Asafoetida (hing)', 1], ['Turmeric powder', 3], ['Ginger', 8, 'grated'], ['Salt', 8]],
    instructions: [
      'Rinse rice and dal together until the water runs clear.',
      'Heat ghee in a pressure cooker, add cumin, hing and ginger.',
      'Add rice, dal, turmeric, salt and 900 ml water. Pressure-cook for 3–4 whistles.',
      'Stir well, loosening with hot water if needed. Serve with a spoon of ghee.',
    ],
  },
  {
    name: 'Aloo Gobi with Roti', category: 'Breads & Rotis', baseServings: 4, prepMinutes: 20, cookMinutes: 35,
    description: 'Dry potato and cauliflower sabzi with fresh phulkas, the classic weeknight roti-sabzi.',
    ingredients: [['Wheat flour (atta)', 300], ['Cauliflower', 400, 'florets'], ['Potato', 250, 'cubed'], ['Onion', 100, 'chopped'], ['Tomato', 120, 'chopped'], ['Oil', 40], ['Cumin seeds', 4], ['Turmeric powder', 3], ['Coriander powder', 5], ['Red chilli powder', 3], ['Garam masala', 2], ['Ginger', 10, 'grated'], ['Salt', 8], ['Coriander leaves', 10]],
    instructions: [
      'Knead the atta with water into a soft dough and rest it while the sabzi cooks.',
      'Heat oil, add cumin, then onion and ginger, and cook until soft.',
      'Add potato, cauliflower, turmeric and salt. Cover and cook on low, stirring occasionally, until tender.',
      'Add tomato and the remaining spices and cook uncovered until dry. Garnish with coriander.',
      'Roll the dough into thin rotis and cook on a hot tawa, puffing them over the flame.',
    ],
  },
  {
    name: 'Rava Upma', category: 'Breakfast', baseServings: 4, prepMinutes: 10, cookMinutes: 15,
    description: 'South Indian semolina breakfast with vegetables, curry leaves and a lemon finish.',
    ingredients: [['Semolina (rava)', 200], ['Onion', 100, 'chopped'], ['Carrot', 60, 'finely diced'], ['Green peas', 50], ['Oil', 25], ['Mustard seeds', 4], ['Chana dal', 10], ['Curry leaves', 5], ['Ginger', 8, 'grated'], ['Green chilli', 8, 'chopped'], ['Salt', 6], ['Lemon', 1]],
    instructions: [
      'Dry-roast the rava until fragrant and set aside.',
      'Heat oil, add mustard seeds, chana dal, curry leaves, ginger and green chilli.',
      'Add onion, carrot and peas and cook until soft.',
      'Pour in 600 ml boiling water with salt, then add the rava slowly while stirring to avoid lumps.',
      'Cover and cook on low for 3 minutes. Finish with lemon juice.',
    ],
  },
  {
    name: 'Chole', category: 'Dals & Curries', baseServings: 4, prepMinutes: 20, cookMinutes: 45,
    description: 'Robust chickpea curry with chole masala. Pairs with rice, roti or bhature. Soak chana overnight.',
    ingredients: [['Kabuli chana', 250, 'soaked overnight'], ['Onion', 200, 'finely chopped'], ['Tomato', 250, 'puréed'], ['Ginger', 15, 'grated'], ['Garlic', 15, 'minced'], ['Oil', 40], ['Chole masala', 12], ['Cumin seeds', 4], ['Bay leaf', 2], ['Turmeric powder', 2], ['Red chilli powder', 3], ['Salt', 10], ['Coriander leaves', 10]],
    instructions: [
      'Pressure-cook the soaked chana with salt for 6–7 whistles until very soft.',
      'Heat oil, add cumin and bay leaf, then onion. Cook until deep brown.',
      'Add ginger and garlic, then tomato purée and spices, and cook until oil separates.',
      'Add chana with some cooking water and chole masala. Simmer 15 minutes, mashing a few chickpeas.',
      'Garnish with coriander.',
    ],
  },
  {
    name: 'Palak Paneer', category: 'Dals & Curries', baseServings: 4, prepMinutes: 20, cookMinutes: 25,
    description: 'Paneer cubes in a smooth, mildly spiced spinach gravy.',
    ingredients: [['Spinach', 500, 'washed'], ['Paneer', 250, 'cubed'], ['Onion', 120, 'chopped'], ['Tomato', 100, 'chopped'], ['Ginger', 10], ['Garlic', 10], ['Green chilli', 8], ['Oil', 25], ['Butter', 15], ['Cumin seeds', 4], ['Garam masala', 3], ['Salt', 7]],
    instructions: [
      'Blanch spinach in boiling water for 2 minutes, plunge into cold water, then blend with green chilli to a smooth purée.',
      'Heat oil, add cumin, then onion, ginger and garlic, and cook until golden.',
      'Add tomato and cook until soft, then stir in the spinach purée and salt. Simmer 5 minutes.',
      'Add paneer and garam masala and simmer 3 minutes. Finish with butter.',
    ],
  },
  {
    name: 'Masoor Dal', category: 'Dals & Curries', baseServings: 4, prepMinutes: 10, cookMinutes: 25,
    description: 'Quick-cooking red lentils with garlic and tomato. No soaking needed.',
    ingredients: [['Masoor dal', 200, 'rinsed'], ['Onion', 100, 'chopped'], ['Tomato', 120, 'chopped'], ['Garlic', 10, 'minced'], ['Oil', 25], ['Cumin seeds', 4], ['Turmeric powder', 3], ['Red chilli powder', 3], ['Salt', 8], ['Coriander leaves', 10]],
    instructions: [
      'Boil the dal with 700 ml water and turmeric until soft, about 15 minutes.',
      'Heat oil, add cumin and garlic, then onion, and cook until golden.',
      'Add tomato, chilli powder and salt and cook until soft.',
      'Stir the masala into the dal and simmer 5 minutes. Garnish with coriander.',
    ],
  },
  {
    name: 'Besan Chilla', category: 'Breakfast', baseServings: 4, prepMinutes: 10, cookMinutes: 20,
    description: 'Savoury gram-flour pancakes with onion and tomato. High protein, ready in minutes.',
    ingredients: [['Gram flour (besan)', 200], ['Onion', 80, 'finely chopped'], ['Tomato', 80, 'finely chopped'], ['Green chilli', 6, 'chopped'], ['Coriander leaves', 10, 'chopped'], ['Turmeric powder', 1], ['Red chilli powder', 2], ['Salt', 5], ['Oil', 30], ['Curd', 100, 'to serve']],
    instructions: [
      'Whisk besan with about 250 ml water into a smooth, pourable batter.',
      'Stir in the vegetables, spices and salt.',
      'Spread a ladle of batter thinly on a hot greased tawa and drizzle oil around the edges.',
      'Cook until golden on both sides. Serve with curd.',
    ],
  },
  {
    name: 'Masala Chai', category: 'Beverages', baseServings: 4, prepMinutes: 2, cookMinutes: 8,
    description: 'Strong milky tea brewed with fresh ginger.',
    ingredients: [['Milk', 400], ['Tea leaves', 10], ['Sugar', 20], ['Ginger', 8, 'crushed']],
    instructions: [
      'Boil 400 ml water with the crushed ginger for 2 minutes.',
      'Add tea leaves and sugar and boil 1 minute.',
      'Add milk and bring to a rolling boil twice, then simmer 2 minutes.',
      'Strain and serve hot.',
    ],
  },
  {
    name: 'Egg Bhurji', category: 'Breakfast', baseServings: 3, prepMinutes: 5, cookMinutes: 10,
    description: 'Spiced Indian scrambled eggs with onion, tomato and green chilli.',
    ingredients: [['Eggs', 6], ['Onion', 100, 'finely chopped'], ['Tomato', 100, 'finely chopped'], ['Green chilli', 6, 'chopped'], ['Butter', 20], ['Turmeric powder', 1], ['Red chilli powder', 2], ['Salt', 4], ['Coriander leaves', 8]],
    instructions: [
      'Melt butter and cook onion and green chilli until soft.',
      'Add tomato, turmeric and chilli powder and cook until soft.',
      'Pour in the beaten eggs with salt and stir gently on low heat until just set.',
      'Garnish with coriander and serve with pav or toast.',
    ],
  },
]

// Cuisine, spice level (1 mild - 5 very hot) and tags for the shared recipes, by name.
// Diet type and allergens are not listed here: they are derived from the ingredients.
export const recipeTags: Record<string, { cuisine: string; spiceLevel: number; tags: string[] }> = {
  'Dal Tadka': { cuisine: 'North Indian', spiceLevel: 2, tags: ['everyday', 'comfort'] },
  'Rajma Chawal': { cuisine: 'Punjabi', spiceLevel: 3, tags: ['hearty', 'weekend'] },
  'Kanda Batata Poha': { cuisine: 'Maharashtrian', spiceLevel: 2, tags: ['quick', 'light'] },
  'Vegetable Pulao': { cuisine: 'North Indian', spiceLevel: 2, tags: ['one-pot'] },
  'Paneer Bhurji': { cuisine: 'North Indian', spiceLevel: 3, tags: ['quick', 'high-protein'] },
  'Aloo Paratha': { cuisine: 'Punjabi', spiceLevel: 2, tags: ['hearty', 'weekend'] },
  'Moong Dal Khichdi': { cuisine: 'North Indian', spiceLevel: 1, tags: ['comfort', 'light', 'one-pot'] },
  'Aloo Gobi with Roti': { cuisine: 'North Indian', spiceLevel: 3, tags: ['everyday'] },
  'Rava Upma': { cuisine: 'South Indian', spiceLevel: 1, tags: ['quick', 'light'] },
  'Chole': { cuisine: 'Punjabi', spiceLevel: 4, tags: ['hearty', 'weekend'] },
  'Palak Paneer': { cuisine: 'North Indian', spiceLevel: 2, tags: ['high-protein'] },
  'Masoor Dal': { cuisine: 'North Indian', spiceLevel: 2, tags: ['everyday', 'quick'] },
  'Besan Chilla': { cuisine: 'North Indian', spiceLevel: 2, tags: ['quick', 'high-protein'] },
  'Masala Chai': { cuisine: 'Indian', spiceLevel: 1, tags: ['beverage'] },
  'Egg Bhurji': { cuisine: 'North Indian', spiceLevel: 3, tags: ['quick', 'high-protein'] },
}
