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

interface FetchCandidate {
  label: string
  url: string
}

function createErrorMessage(statusCode: number, statusMessage: string): never {
  throw createError({ statusCode, statusMessage })
}

function stripProtocol(url: string) {
  return url.replace(/^https?:\/\//i, '')
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
      url: `https://r.jina.ai/http://${stripProtocol(parsedUrl.toString())}`,
    },
  ]

  if (listingId) {
    candidates.push(
      {
        label: 'canonical-details',
        url: `https://r.jina.ai/http://suchen.mobile.de/fahrzeuge/details.html?id=${listingId}`,
      },
      {
        label: 'print-view',
        url: `https://r.jina.ai/http://suchen.mobile.de/fahrzeuge/printView.html?id=${listingId}`,
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

async function fetchListingText(parsedUrl: URL) {
  const candidates = buildFetchCandidates(parsedUrl)
  let blocked = false

  for (const candidate of candidates) {
    const response = await fetch(candidate.url, {
      headers: {
        'User-Agent': 'car-seller-service/1.0',
        Accept: 'text/plain, text/markdown;q=0.9, */*;q=0.8',
      },
    })

    if (!response.ok) {
      continue
    }

    const text = await response.text()

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

  const { fetchedUrl, text } = await fetchListingText(parsedUrl)

  const firstRegistration = parseFirstRegistration(text)
  const ageMonths = parseAgeMonths(firstRegistration)
  const mileageKm = parseMileage(text)
  const fuel = parseFuel(text)

  const listing: ParsedListing = {
    sourceUrl: parsedUrl.toString(),
    fetchedUrl,
    title: parseTitle(text),
    subtitle: parseSubtitle(text),
    priceEur: parsePrice(text),
    mileageKm,
    fuel,
    transmission: parseTransmission(text),
    firstRegistration,
    ageMonths,
    ...parsePower(text),
    engineCc: parseEngineCc(text),
    sellerType: parseSellerType(text),
    sellerName: parseSellerName(text),
    location: parseLocation(text),
    co2Gkm: parseCo2(text),
    notes: extractNotes(text),
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
