// Hand-picked, freely licensed photos from Wikimedia Commons, by absolute URL, with the credit each licence requires.
// Only upload.wikimedia.org is allowed by the Content Security Policy.

export type Photo = { url: string; alt: string; credit: string; license: string; source: string }

export const LANDING_PHOTOS: Photo[] = [
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/North_Indian_Vegetarian_Thali-MB51.jpg/1280px-North_Indian_Vegetarian_Thali-MB51.jpg',
    alt: 'A North Indian vegetarian thali with dal, sabzi, rice and roti',
    credit: 'Rajeeb Dutta', license: 'CC BY-SA 4.0',
    source: 'https://commons.wikimedia.org/wiki/File:North_Indian_Vegetarian_Thali-MB51.jpg',
  },
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f0/Dal_Tadka-Delhi.jpg/960px-Dal_Tadka-Delhi.jpg',
    alt: 'A bowl of dal tadka',
    credit: 'AugustineKajur', license: 'CC BY-SA 4.0',
    source: 'https://commons.wikimedia.org/wiki/File:Dal_Tadka-Delhi.jpg',
  },
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/0/07/Spices_in_an_Indian_market.jpg',
    alt: 'Heaps of colourful spices at an Indian market',
    credit: 'judepics', license: 'CC BY 2.0',
    source: 'https://commons.wikimedia.org/wiki/File:Spices_in_an_Indian_market.jpg',
  },
]
