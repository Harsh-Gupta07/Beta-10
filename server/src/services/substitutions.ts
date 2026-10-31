// Hand-picked ingredient swaps for Indian home cooking. Each one stays in the same unit (g for g, ml for ml),
// so the swapped quantity is exact arithmetic, never a guess. Keys and names are catalog names, lower-cased.

export type Swap = { name: string; /** Substitute quantity = original quantity × ratio. */ ratio: number; note: string }

export const SWAPS: Record<string, Swap[]> = {
  'paneer': [{ name: 'tofu', ratio: 1, note: 'Press the tofu and add it at the end so it holds its shape.' }],
  'tofu': [{ name: 'paneer', ratio: 1, note: 'Add paneer at the end so it stays soft.' }],
  'basmati rice': [{ name: 'rice', ratio: 1, note: 'Everyday rice works; the grains will be shorter.' }],
  'rice': [{ name: 'basmati rice', ratio: 1, note: 'Basmati cooks a little faster; check the water.' }],
  'toor dal': [{ name: 'moong dal', ratio: 1, note: 'Moong dal cooks faster, so reduce the cooking time.' }, { name: 'masoor dal', ratio: 1, note: 'Masoor dal cooks faster and turns creamier.' }],
  'moong dal': [{ name: 'masoor dal', ratio: 1, note: 'Similar cooking time; a slightly earthier taste.' }, { name: 'toor dal', ratio: 1, note: 'Toor dal needs longer; pressure-cook a whistle or two more.' }],
  'masoor dal': [{ name: 'moong dal', ratio: 1, note: 'Similar cooking time; a milder taste.' }, { name: 'toor dal', ratio: 1, note: 'Toor dal needs longer; pressure-cook a whistle or two more.' }],
  'chana dal': [{ name: 'toor dal', ratio: 1, note: 'Toor dal cooks faster and is less nutty.' }],
  'kabuli chana': [{ name: 'rajma', ratio: 1, note: 'Soak overnight and cook until soft, as for chana.' }],
  'rajma': [{ name: 'kabuli chana', ratio: 1, note: 'Soak overnight and cook until soft, as for rajma.' }],
  'ghee': [{ name: 'oil', ratio: 1, note: 'Oil works for tempering; the dish will be less rich.' }],
  'oil': [{ name: 'ghee', ratio: 1, note: 'Ghee makes it richer.' }],
  'green peas': [{ name: 'french beans', ratio: 1, note: 'Chop the beans small; they need a few more minutes.' }],
  'french beans': [{ name: 'green peas', ratio: 1, note: 'Peas cook faster; add them later.' }],
  'garam masala': [{ name: 'chole masala', ratio: 1, note: 'Chole masala is tangier; add a little at a time.' }],
  'chole masala': [{ name: 'garam masala', ratio: 1, note: 'Add a pinch of amchur or lemon for the tang.' }],
  'green chilli': [{ name: 'red chilli powder', ratio: 0.25, note: 'Use a quarter of the weight as powder; it is hotter and gives colour.' }],
}
