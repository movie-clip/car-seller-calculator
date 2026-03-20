interface ParseMobileRequest {
  url?: string
}

interface ParsedListing {
  sourceUrl: string
  fetchedUrl: string
  title: string | null
  subtitle: string | null
  priceEur: number | null
  mileageKm: number | null
  fuel: string | null
  transmission: string | null
  firstRegistration: string | null
  ageMonths: number | null
  powerKw: number | null
  powerPs: number | null
  engineCc: number | null
  sellerType: 'dealer' | 'private' | 'unknown'
  sellerName: string | null
  location: string | null
  co2Gkm: number | null
  notes: string[]
}

interface HomeMobileListingData {
  shortTitle: string | null
  subTitle: string | null
  priceEur: number | null
  mileageKm: number | null
  fuel: string | null
  transmission: string | null
  firstRegistration: string | null
  powerKw: number | null
  powerPs: number | null
  engineCc: number | null
  sellerType: 'dealer' | 'private' | 'unknown'
  sellerName: string | null
  location: string | null
  co2Gkm: number | null
}

interface FetchCandidate {
  label: string
  url: string
}

function createErrorMessage(statusCode: number, statusMessage: string): never {
  throw createError({ statusCode, statusMessage })
}

function toJinaUrl(url: string) {
  return `https://r.jina.ai/http://${url}`
}

function matchGroup(text: string, pattern: RegExp, index = 1) {
  const match = text.match(pattern)
  return match?.[index]?.trim() ?? null
}

function parseGermanNumber(value: string | null) {
  if (!value) {
    return null
  }

  const cleaned = value.replace(/\./g, '').replace(',', '.').replace(/[^\d.\-]/g, '')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function parsePrice(text: string) {
  const raw = matchGroup(text, /### Preis\s+([\d.,]+)\s*€/i) ?? matchGroup(text, /für\s+([\d.,]+)\s*€/i)
  return parseGermanNumber(raw)
}

function parseMileage(text: string) {
  return parseGermanNumber(matchGroup(text, /Kilometerstand\s+([\d.]+)\s*km/i))
}

function parseFuel(text: string) {
  return matchGroup(text, /Kraftstoffart\s+([^\n]+)/i)
}

function parseTransmission(text: string) {
  return matchGroup(text, /Getriebe\s+([^\n]+)/i)
}

function parseFirstRegistration(text: string) {
  return matchGroup(text, /Erstzulassung\s+(\d{2}\/\d{4})/i)
}

function parseAgeMonths(firstRegistration: string | null) {
  if (!firstRegistration) {
    return null
  }

  const match = firstRegistration.match(/^(\d{2})\/(\d{4})$/)
  if (!match) {
    return null
  }

  const month = Number(match[1])
  const year = Number(match[2])
  const now = new Date()
  const ageMonths = (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month)
  return Math.max(ageMonths, 0)
}

function parsePower(text: string) {
  const raw = matchGroup(text, /Leistung\s+(\d+)\s*kW\s*\((\d+)\s*PS\)/i, 0)
  if (!raw) {
    return { powerKw: null, powerPs: null }
  }

  const match = raw.match(/(\d+)\s*kW\s*\((\d+)\s*PS\)/i)
  return {
    powerKw: match ? Number(match[1]) : null,
    powerPs: match ? Number(match[2]) : null,
  }
}

function parseEngineCc(text: string) {
  return parseGermanNumber(matchGroup(text, /Hubraum\s+([\d.]+)\s*cm³/i))
}

function parseCo2(text: string) {
  return parseGermanNumber(matchGroup(text, /CO₂-Emissionen[^\n]*\s+([\d.]+)\s*g\/km/i))
}

function parseTitle(text: string) {
  return matchGroup(text, /^Title:\s*(.+)$/m)
}

function parseSubtitle(text: string) {
  return matchGroup(text, /##\s+[^\n]+\s+([^\n]+)\s+[\d.,]+€/i)
}

function parseSellerName(text: string) {
  return matchGroup(text, /### Händler\s+\[?\]?\([^)]*\)\s*\n+\s*([^\n]+)/i) ?? matchGroup(text, /##\s+[^\n]+\s+[\s\S]*?\n\[([^\]]+)\]\(https:\/\/suchen\.mobile\.de/i)
}

function parseLocation(text: string) {
  return matchGroup(text, /(DE-\d{5}\s+[^\n]+)/i)
}

function parseSellerType(text: string): 'dealer' | 'private' | 'unknown' {
  if (/### Händler/i.test(text) || /Über diesen Händler/i.test(text)) {
    return 'dealer'
  }

  if (/Privatanbieter|Privat/i.test(text)) {
    return 'private'
  }

  return 'unknown'
}

function mapFuelToPowertrain(fuel: string | null) {
  const value = fuel?.toLowerCase() ?? ''

  if (value.includes('elektro')) {
    return 'electric'
  }

  if (value.includes('plugin') || value.includes('plug-in')) {
    return 'phev'
  }

  if (value.includes('hybrid')) {
    return 'hybrid'
  }

  if (value.includes('diesel')) {
    return 'diesel'
  }

  return 'petrol'
}

function inferSellerMode(listing: ParsedListing) {
  if (listing.sellerType === 'private') {
    return 'private-used'
  }

  if (listing.ageMonths !== null && listing.mileageKm !== null && (listing.ageMonths <= 6 || listing.mileageKm <= 6000)) {
    return 'new-eu-vehicle'
  }

  return 'dealer-margin'
}

function extractNotes(text: string) {
  const notes: string[] = []
  const lowered = text.toLowerCase()

  if (lowered.includes('importfahrzeug aus usa') || lowered.includes('usa')) {
    notes.push('US import mentioned in listing')
  }

  if (lowered.includes('unfallschaden') || lowered.includes('vorschaden')) {
    notes.push('Accident or repaired damage mentioned')
  }

  if (lowered.includes('mwst') && lowered.includes('ausweisbar')) {
    notes.push('VAT may be separately shown on invoice')
  }

  if (lowered.includes('garantie')) {
    notes.push('Warranty mentioned in listing')
  }

  return notes
}

function decodeUnicodeEscapes(value: string) {
  return value.replace(/\\u([0-9a-fA-F]{4})/g, (_, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
}

function cleanHomeValue(value: string | null) {
  if (!value) {
    return null
  }

  return decodeUnicodeEscapes(value)
    .replace(/�/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parsePowerString(value: string | null) {
  if (!value) {
    return { powerKw: null, powerPs: null }
  }

  const normalized = cleanHomeValue(value)
  const match = normalized?.match(/(\d+)\s*kW\s*\((\d+)\s*PS\)/i)

  return {
    powerKw: match ? Number(match[1]) : null,
    powerPs: match ? Number(match[2]) : null,
  }
}

function parseHomeMobileBlock(text: string, listingId: string) {
  const idMarker = `"id":${listingId}`
  let idIndex = text.indexOf(idMarker)

  if (idIndex === -1) {
    idIndex = text.indexOf(`adId=${listingId}`)
  }

  if (idIndex === -1) {
    return null
  }

  const start = Math.max(0, idIndex - 5000)
  const end = Math.min(text.length, idIndex + 12000)

  return text.slice(start, end)
}

function matchHomeField(block: string, field: string) {
  return cleanHomeValue(matchGroup(block, new RegExp(`"${field}":"([^"]+)"`, 'i')))
}

function parseHomeMobileListing(text: string, listingId: string): HomeMobileListingData | null {
  const block = parseHomeMobileBlock(text, listingId)

  if (!block) {
    return null
  }

  const title = matchHomeField(block, 'shortTitle')
  const subtitle = matchHomeField(block, 'subTitle')
  const priceValue = matchHomeField(block, 'p')
  const mileage = matchHomeField(block, 'ml')
  const firstRegistration = matchHomeField(block, 'fr')
  const fuel = matchHomeField(block, 'ft')
  const transmission = matchHomeField(block, 'tr')
  const engineCc = matchHomeField(block, 'cc')
  const locationZip = matchHomeField(block, 'z')
  const locationCity = matchHomeField(block, 'loc')
  const sellerName = matchHomeField(block, 'name')
  const sellerTypeRaw = matchHomeField(block, 'st')
  const co2Raw = matchHomeField(block, 'co2')
  const power = parsePowerString(matchHomeField(block, 'pw'))

  return {
    shortTitle: title,
    subTitle: subtitle,
    priceEur: parseGermanNumber(priceValue),
    mileageKm: parseGermanNumber(mileage),
    fuel,
    transmission,
    firstRegistration,
    powerKw: power.powerKw,
    powerPs: power.powerPs,
    engineCc: parseGermanNumber(engineCc),
    sellerType: sellerTypeRaw?.toLowerCase().includes('privat') ? 'private' : sellerTypeRaw ? 'dealer' : 'unknown',
    sellerName,
    location: locationZip && locationCity ? `DK-${locationZip} ${locationCity}` : locationCity,
    co2Gkm: parseGermanNumber(co2Raw),
  }
}

function parseHomeMobileMarkdown(text: string, listingId: string): HomeMobileListingData | null {
  return extractListingFromDealerMarkdown(text, listingId)
}

async function fetchDealerHomeText(text: string, listingId: string) {
  const customerId = matchGroup(text, /customerId=(\d+)/i)
  const dealerSlug = matchGroup(text, /https:\/\/home\.mobile\.de\/([A-Z0-9_-]+)/i)
  const directHomeCustomerId = matchGroup(text, /sellerId":(\d+)/i)

  const urls = [
    customerId ? `https://home.mobile.de/home/index.html?customerId=${customerId}&id=${listingId}` : null,
    directHomeCustomerId ? `https://home.mobile.de/home/index.html?customerId=${directHomeCustomerId}&id=${listingId}` : null,
    dealerSlug ? `https://home.mobile.de/${dealerSlug}` : null,
  ].filter((value): value is string => Boolean(value))

  for (const url of urls) {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    })

    if (!response.ok) {
      continue
    }

    const html = await response.text()
    const parsed = parseHomeMobileListing(html, listingId)

    if (parsed?.priceEur || parsed?.mileageKm || parsed?.firstRegistration) {
      return parsed
    }
  }

  for (const url of urls) {
    const markdown = await fetchText(toJinaUrl(url), {
      'User-Agent': 'car-seller-service/1.0',
      Accept: 'text/plain, text/markdown;q=0.9, */*;q=0.8',
    })

    if (!markdown) {
      continue
    }

    const parsed = parseHomeMobileMarkdown(markdown, listingId)

    if (parsed?.priceEur || parsed?.mileageKm || parsed?.firstRegistration) {
      return parsed
    }
  }

  return null
}

function extractListingFromDealerMarkdown(text: string, listingId: string): HomeMobileListingData | null {
  const normalized = text.replace(/�/g, '€').replace(/\uFFFD/g, '€')
  const listingIndex = normalized.indexOf(listingId)

  if (listingIndex === -1) {
    const simplePattern = /###\s+([^\n]+)\n\n([\d.,]+)[€]?\n\nFinanzierung[\s\S]*?EZ\s+(\d{2}\/\d{4})\s+[^\n]*?([\d.]+)\s+km\s+[^\n]*?(\d+)\s+kW\((\d+)\s+PS\)\s+[^\n]*?([A-Za-zÄÖÜäöüß]+)/i
    const fallbackMatch = normalized.match(simplePattern)

    if (!fallbackMatch) {
      return null
    }

    return {
      shortTitle: cleanHomeValue(fallbackMatch[1] ?? null),
      subTitle: null,
      priceEur: parseGermanNumber(fallbackMatch[2] ?? null),
      mileageKm: parseGermanNumber(fallbackMatch[4] ?? null),
      fuel: cleanHomeValue(fallbackMatch[7] ?? null),
      transmission: null,
      firstRegistration: cleanHomeValue(fallbackMatch[3] ?? null),
      powerKw: Number(fallbackMatch[5]),
      powerPs: Number(fallbackMatch[6]),
      engineCc: null,
      sellerType: 'dealer',
      sellerName: null,
      location: matchGroup(normalized, /(DK-\d{4}\s+[^\n]+)/i),
      co2Gkm: null,
    }
  }

  const blockStart = normalized.lastIndexOf('### ', listingIndex)
  const blockEnd = normalized.indexOf('Kontakt Parken', listingIndex)

  if (blockStart === -1 || blockEnd === -1) {
    return null
  }

  const block = normalized.slice(blockStart, blockEnd + 'Kontakt Parken'.length)
  const match = block.match(/###\s+([^\n]+)\n\n([\d.,]+)[€]?\n\nFinanzierung[\s\S]*?EZ\s+(\d{2}\/\d{4})\s+[^\n]*?([\d.]+)\s+km\s+[^\n]*?(\d+)\s+kW\((\d+)\s+PS\)\s+[^\n]*?([A-Za-zÄÖÜäöüß]+)/i)

  if (!match) {
    return null
  }

  return {
    shortTitle: cleanHomeValue(match[1] ?? null),
    subTitle: null,
    priceEur: parseGermanNumber(match[2] ?? null),
    mileageKm: parseGermanNumber(match[4] ?? null),
    fuel: cleanHomeValue(match[7] ?? null),
    transmission: null,
    firstRegistration: cleanHomeValue(match[3] ?? null),
    powerKw: Number(match[5]),
    powerPs: Number(match[6]),
    engineCc: null,
    sellerType: 'dealer',
    sellerName: null,
    location: matchGroup(text, /(DK-\d{4}\s+[^\n]+)/i),
    co2Gkm: null,
  }
}

async function fetchDealerHomeFromSearch(listingId: string) {
  const searchUrl = toJinaUrl(`https://duckduckgo.com/html/?q=${encodeURIComponent(`${listingId} mobile.de`)}`)
  const searchText = await fetchText(searchUrl, {
    'User-Agent': 'car-seller-service/1.0',
    Accept: 'text/plain, text/markdown;q=0.9, */*;q=0.8',
  })

  if (!searchText) {
    return null
  }

  const dealerUrl = matchGroup(searchText, /https:\/\/home\.mobile\.de\/[A-Z0-9_-]+/i, 0)

  if (!dealerUrl) {
    return null
  }

  const dealerText = await fetchText(toJinaUrl(dealerUrl), {
    'User-Agent': 'car-seller-service/1.0',
    Accept: 'text/plain, text/markdown;q=0.9, */*;q=0.8',
  })

  if (!dealerText) {
    return null
  }

  return extractListingFromDealerMarkdown(dealerText, listingId)
}

function extractListingId(parsedUrl: URL) {
  const queryId = parsedUrl.searchParams.get('id')?.trim()

  if (queryId) {
    return queryId
  }

  return parsedUrl.pathname.match(/id=(\d+)/)?.[1] ?? null
}

function buildFetchCandidates(parsedUrl: URL) {
  const listingId = extractListingId(parsedUrl)
  const candidates: FetchCandidate[] = [
    {
      label: 'details-page',
      url: toJinaUrl(parsedUrl.toString()),
    },
  ]

  if (listingId) {
    candidates.push(
      {
        label: 'canonical-details',
        url: toJinaUrl(`https://suchen.mobile.de/fahrzeuge/details.html?id=${listingId}`),
      },
      {
        label: 'print-view',
        url: toJinaUrl(`https://suchen.mobile.de/fahrzeuge/printView.html?id=${listingId}`),
      },
    )
  }

  return candidates
}

function isBlockedResponse(text: string) {
  const lowered = text.toLowerCase()

  return (
    lowered.includes('zugriff verweigert')
    || lowered.includes('access denied')
    || lowered.includes('powered and protected by')
    || lowered.includes('akamai')
  )
}

function looksLikeListing(text: string) {
  return text.includes('Kilometerstand') || text.includes('### Technische Daten') || text.includes('## ')
}

async function fetchText(url: string, headers?: Record<string, string>) {
  const response = await fetch(url, {
    headers,
  })

  if (!response.ok) {
    return null
  }

  return response.text()
}

async function fetchListingText(parsedUrl: URL) {
  const candidates = buildFetchCandidates(parsedUrl)
  let blocked = false

  for (const candidate of candidates) {
    const text = await fetchText(candidate.url, {
      'User-Agent': 'car-seller-service/1.0',
      Accept: 'text/plain, text/markdown;q=0.9, */*;q=0.8',
    })

    if (!text) {
      continue
    }

    if (isBlockedResponse(text)) {
      blocked = true
      continue
    }

    if (looksLikeListing(text)) {
      return {
        fetchedUrl: candidate.url,
        text,
      }
    }
  }

  if (blocked) {
    createErrorMessage(502, 'mobile.de blocked this listing request. Try opening the ad again later or paste a different listing URL.')
  }

  createErrorMessage(502, 'Listing content could not be parsed from mobile.de.')
}

export default defineEventHandler(async (event) => {
  const body = await readBody<ParseMobileRequest>(event)
  const url = body.url?.trim()

  if (!url) {
    createErrorMessage(400, 'Missing mobile.de URL')
  }

  const parsedUrl = (() => {
    try {
      return new URL(url)
    } catch {
      return createErrorMessage(400, 'Invalid URL')
    }
  })()

  if (!/mobile\.de$/i.test(parsedUrl.hostname)) {
    createErrorMessage(400, 'Only mobile.de URLs are supported')
  }
  const listingId = extractListingId(parsedUrl)

  let fetchedUrl: string | null = null
  let text: string | null = null

  try {
    const result = await fetchListingText(parsedUrl)
    fetchedUrl = result.fetchedUrl
    text = result.text
  } catch (error) {
    if (!listingId) {
      throw error
    }
  }

  let fallbackListing = listingId ? await fetchDealerHomeText(text ?? parsedUrl.toString(), listingId) : null

  if (!fallbackListing && listingId) {
    fallbackListing = await fetchDealerHomeFromSearch(listingId)
  }

  if (!text && !fallbackListing) {
    createErrorMessage(502, 'This mobile.de listing could not be parsed. The source may be blocked or missing key vehicle data.')
  }

  const firstRegistration = text ? parseFirstRegistration(text) : null
  const ageMonths = parseAgeMonths(firstRegistration)
  const mileageKm = text ? parseMileage(text) : null
  const fuel = text ? parseFuel(text) : null

  const listing: ParsedListing = {
    sourceUrl: parsedUrl.toString(),
    fetchedUrl: fetchedUrl ?? parsedUrl.toString(),
    title: text ? parseTitle(text) : null,
    subtitle: text ? parseSubtitle(text) : null,
    priceEur: text ? parsePrice(text) : null,
    mileageKm,
    fuel,
    transmission: text ? parseTransmission(text) : null,
    firstRegistration,
    ageMonths,
    ...(text ? parsePower(text) : { powerKw: null, powerPs: null }),
    engineCc: text ? parseEngineCc(text) : null,
    sellerType: text ? parseSellerType(text) : 'unknown',
    sellerName: text ? parseSellerName(text) : null,
    location: text ? parseLocation(text) : null,
    co2Gkm: text ? parseCo2(text) : null,
    notes: text ? extractNotes(text) : [],
  }

  if (fallbackListing) {
    listing.title = fallbackListing.shortTitle ?? listing.title
    listing.subtitle = fallbackListing.subTitle ?? listing.subtitle
    listing.priceEur = fallbackListing.priceEur ?? listing.priceEur
    listing.mileageKm = fallbackListing.mileageKm ?? listing.mileageKm
    listing.fuel = fallbackListing.fuel ?? listing.fuel
    listing.transmission = fallbackListing.transmission ?? listing.transmission
    listing.firstRegistration = fallbackListing.firstRegistration ?? listing.firstRegistration
    listing.ageMonths = parseAgeMonths(listing.firstRegistration)
    listing.powerKw = fallbackListing.powerKw ?? listing.powerKw
    listing.powerPs = fallbackListing.powerPs ?? listing.powerPs
    listing.engineCc = fallbackListing.engineCc ?? listing.engineCc
    listing.sellerType = fallbackListing.sellerType ?? listing.sellerType
    listing.sellerName = fallbackListing.sellerName ?? listing.sellerName
    listing.location = fallbackListing.location ?? listing.location
    listing.co2Gkm = fallbackListing.co2Gkm ?? listing.co2Gkm
    listing.notes.push('Listing data recovered from dealer home page fallback')
  }

  if (!listing.priceEur && !listing.mileageKm && !listing.firstRegistration) {
    createErrorMessage(502, 'This mobile.de listing could not be parsed. The source may be blocked or missing key vehicle data.')
  }

  return {
    listing,
    suggestedScenario: {
      purchasePrice: listing.priceEur,
      vehicleAgeMonths: listing.ageMonths,
      mileageKm: listing.mileageKm,
      co2Gkm: listing.co2Gkm,
      powertrain: mapFuelToPowertrain(listing.fuel),
      iedmtTaxBase: listing.priceEur,
      sellerMode: inferSellerMode(listing),
    },
  }
})
