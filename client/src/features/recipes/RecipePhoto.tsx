import { useEffect, useState } from 'react'
import { Camera, Leaf } from 'lucide-react'

type CommonsPhoto = {
  imageUrl: string
  sourceUrl: string
  title: string
  credit: string
}

const memory = new Map<string, CommonsPhoto | null>()

function plainText(value?: string) {
  if (!value) return ''
  const document = new DOMParser().parseFromString(value, 'text/html')
  return document.body.textContent?.trim() ?? ''
}

function meaningfulWords(name: string) {
  return name.toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 2 && !['with', 'and', 'the'].includes(word))
}

async function findPhoto(name: string, signal: AbortSignal): Promise<CommonsPhoto | null> {
  const cached = memory.get(name)
  if (cached !== undefined) return cached

  const query = name.replace(/["\\]/g, '').trim().slice(0, 80)
  const params = new URLSearchParams({
    action: 'query', format: 'json', origin: '*', generator: 'search',
    gsrsearch: `"${query}" filetype:bitmap`, gsrnamespace: '6', gsrlimit: '20',
    prop: 'imageinfo', iiprop: 'url|extmetadata|mime', iiurlwidth: '960',
  })
  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { signal, credentials: 'omit' })
  if (!response.ok) throw new Error('Photo service unavailable')
  const payload = await response.json()
  const words = meaningfulWords(query)
  const pages = Object.values(payload.query?.pages ?? {}) as Array<any>
  const candidates = pages
    .filter(page => words.every(word => String(page.title).toLowerCase().includes(word)))
    .sort((a, b) => photoScore(a.title, query) - photoScore(b.title, query))

  for (const page of candidates) {
    const info = page.imageinfo?.[0]
    if (!info || !/^image\/(jpeg|png|webp)$/.test(info.mime ?? '')) continue
    const imageUrl = info.thumburl || info.url
    const sourceUrl = info.descriptionurl
    if (!imageUrl?.startsWith('https://') || !sourceUrl?.startsWith('https://commons.wikimedia.org/')) continue
    const artist = plainText(info.extmetadata?.Artist?.value) || 'Wikimedia contributor'
    const licence = plainText(info.extmetadata?.LicenseShortName?.value) || 'View licence'
    const photo = { imageUrl, sourceUrl, title: String(page.title).replace(/^File:/, ''), credit: `${artist}, ${licence}` }
    memory.set(name, photo)
    return photo
  }

  memory.set(name, null)
  return null
}

function photoScore(title: string, query: string) {
  const cleanTitle = String(title).replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').toLowerCase()
  const cleanQuery = query.toLowerCase()
  const preferred: Record<string, string[]> = {
    'dal tadka': ['dal tadka'],
    'rajma chawal': ['rajma chawal thali'],
    'poha': ['tari poha at indore', 'poha 4'],
    'paneer bhurji': ['homemade paneer bhurji', 'paneer capsicum bhurji'],
    'vegetable pulao': ['indian vegetable pulao'],
    'aloo paratha': ['alooparatha', 'aloo paratha'],
  }
  const preferredIndex = preferred[cleanQuery]?.findIndex(fragment => cleanTitle.includes(fragment)) ?? -1
  const curated = preferredIndex >= 0 ? -100 + preferredIndex : 0
  const noise = /(ketchup|sauce|restaurant|menu|home|selfie|packaging|advertisement)/.test(cleanTitle) ? 40 : 0
  const exact = cleanTitle === cleanQuery ? -30 : cleanTitle.startsWith(cleanQuery) ? -12 : 0
  return curated + exact + noise + Math.abs(cleanTitle.length - cleanQuery.length)
}

export function RecipePhoto({ name, variant = 'card', showSource = false }: { name: string; variant?: 'card' | 'hero' | 'thumb'; showSource?: boolean }) {
  const [photo, setPhoto] = useState<CommonsPhoto | null | undefined>(() => memory.get(name))
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (photo !== undefined) return
    const controller = new AbortController()
    findPhoto(name, controller.signal).then(setPhoto).catch(error => {
      if (error.name !== 'AbortError') setPhoto(null)
    })
    return () => controller.abort()
  }, [name, photo])

  const showImage = photo && !failed
  return <figure className={`recipe-photo ${variant} ${showImage ? 'has-image' : ''}`} aria-label={`${name} photo`}>
    {showImage
      ? <img src={photo.imageUrl} alt={photo.title} loading="lazy" onError={() => setFailed(true)} />
      : <div className="recipe-photo-fallback"><Leaf size={variant === 'hero' ? 30 : 22} aria-hidden /><span>{photo === undefined ? 'Finding a matching photo' : name}</span></div>}
    {showImage && showSource && <a className="photo-source" href={photo.sourceUrl} target="_blank" rel="noreferrer" title={`Photo: ${photo.credit}`} aria-label={`Photo source for ${name}: ${photo.credit}`}>
      <Camera size={13} aria-hidden /><span>Photo source</span>
    </a>}
  </figure>
}
