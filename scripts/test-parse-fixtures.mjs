import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(process.cwd())

function parseGermanNumber(value) {
  if (!value) {
    return null
  }

  const cleaned = value.replace(/\./g, '').replace(',', '.').replace(/[^\d.\-]/g, '')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function matchGroup(text, pattern, index = 1) {
  const match = text.match(pattern)
  return match?.[index]?.trim() ?? null
}

function parsePrice(text) {
  const raw = matchGroup(text, /### Preis\s+([\d.,]+)\s*€/i) ?? matchGroup(text, /für\s+([\d.,]+)\s*€/i)
  return parseGermanNumber(raw)
}

function parseMileage(text) {
  return parseGermanNumber(matchGroup(text, /Kilometerstand\s+([\d.]+)\s*km/i))
}

function parseFirstRegistration(text) {
  return matchGroup(text, /Erstzulassung\s+(\d{2}\/\d{4})/i)
}

function parseCo2(text) {
  return parseGermanNumber(matchGroup(text, /CO₂-Emissionen[^\n]*\s+([\d.]+)\s*g\/km/i))
}

function isBlockedResponse(text) {
  const lowered = text.toLowerCase()

  return (
    lowered.includes('zugriff verweigert')
    || lowered.includes('access denied')
    || lowered.includes('powered and protected by')
    || lowered.includes('akamai')
  )
}

function looksLikeListing(text) {
  return text.includes('Kilometerstand') || text.includes('### Technische Daten') || text.includes('## ')
}

function decodeUnicodeEscapes(value) {
  return value.replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
}

function cleanHomeValue(value) {
  if (!value) {
    return null
  }

  return decodeUnicodeEscapes(value)
    .replace(/�/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchHomeField(block, field) {
  return cleanHomeValue(matchGroup(block, new RegExp(`"${field}":"([^"]+)"`, 'i')))
}

function parsePowerString(value) {
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

function parseHomeMobileListing(text, listingId) {
  const idMarker = `"id":${listingId}`
  const idIndex = text.indexOf(idMarker)

  if (idIndex === -1) {
    return null
  }

  const block = text.slice(Math.max(0, idIndex - 5000), Math.min(text.length, idIndex + 12000))
  const power = parsePowerString(matchHomeField(block, 'pw'))

  return {
    shortTitle: matchHomeField(block, 'shortTitle'),
    subTitle: matchHomeField(block, 'subTitle'),
    priceEur: parseGermanNumber(matchHomeField(block, 'p')),
    mileageKm: parseGermanNumber(matchHomeField(block, 'ml')),
    firstRegistration: matchHomeField(block, 'fr'),
    fuel: matchHomeField(block, 'ft'),
    transmission: matchHomeField(block, 'tr'),
    engineCc: parseGermanNumber(matchHomeField(block, 'cc')),
    powerKw: power.powerKw,
    powerPs: power.powerPs,
  }
}

function extractListingFromDealerMarkdown(text, listingId) {
  const normalized = text.replace(/�/g, '€').replace(/\uFFFD/g, '€')
  const simplePattern = /###\s+([^\n]+)\n\n([\d.,]+)[€]?\n\nFinanzierung[\s\S]*?EZ\s+(\d{2}\/\d{4})\s+[^\n]*?([\d.]+)\s+km\s+[^\n]*?(\d+)\s+kW\((\d+)\s+PS\)\s+[^\n]*?([A-Za-zÄÖÜäöüß]+)/i
  const match = normalized.match(simplePattern)

  if (!match) {
    return null
  }

  return {
    shortTitle: match[1].trim(),
    priceEur: parseGermanNumber(match[2]),
    firstRegistration: match[3].trim(),
    mileageKm: parseGermanNumber(match[4]),
    powerKw: Number(match[5]),
    powerPs: Number(match[6]),
    fuel: match[7].trim(),
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

const blockedFixture = readFileSync(join(root, 'scripts', 'fixtures', 'blocked-response.md'), 'utf8')
const listingFixture = readFileSync(join(root, 'scripts', 'fixtures', 'listing-response.md'), 'utf8')
const dealerFallbackFixture = readFileSync(join(root, 'scripts', 'fixtures', 'dealer-home-response.html'), 'utf8')
const dealerMarkdownFixture = readFileSync(join(root, 'scripts', 'fixtures', 'dealer-home-response.md'), 'utf8')

assert(isBlockedResponse(blockedFixture), 'Blocked-response fixture should be detected as blocked')
assert(!looksLikeListing(blockedFixture), 'Blocked-response fixture should not be accepted as a listing')

assert(!isBlockedResponse(listingFixture), 'Listing fixture must not be classified as blocked')
assert(looksLikeListing(listingFixture), 'Listing fixture should be recognized as a real listing')
assert(parsePrice(listingFixture) === 6900, 'Listing fixture price parse failed')
assert(parseMileage(listingFixture) === 149000, 'Listing fixture mileage parse failed')
assert(parseFirstRegistration(listingFixture) === '05/2018', 'Listing fixture first registration parse failed')
assert(parseCo2(listingFixture) === 109, 'Listing fixture CO2 parse failed')

const fallbackListing = parseHomeMobileListing(dealerFallbackFixture, '443587783')
assert(fallbackListing, 'Dealer home fallback fixture should parse')
assert(fallbackListing.shortTitle === 'Volkswagen Golf', 'Dealer home title parse failed')
assert(fallbackListing.subTitle === 'VII Lim. Trendline BMT/Start-Stopp 1.0 TSI', 'Dealer home subtitle parse failed')
assert(fallbackListing.priceEur === 6900, 'Dealer home price parse failed')
assert(fallbackListing.mileageKm === 149000, 'Dealer home mileage parse failed')
assert(fallbackListing.firstRegistration === '05/2018', 'Dealer home first registration parse failed')
assert(fallbackListing.fuel === 'Benzin', 'Dealer home fuel parse failed')
assert(fallbackListing.transmission === 'Schaltgetriebe', 'Dealer home transmission parse failed')
assert(fallbackListing.engineCc === 999, 'Dealer home engine parse failed')
assert(fallbackListing.powerKw === 63 && fallbackListing.powerPs === 86, 'Dealer home power parse failed')

const markdownFallback = extractListingFromDealerMarkdown(dealerMarkdownFixture, '443587783')
assert(markdownFallback, 'Dealer markdown fallback fixture should parse')
assert(markdownFallback.shortTitle === 'Volkswagen Golf VII Lim. Trendline BMT/Start-Stopp 1.0 TSI', 'Dealer markdown title parse failed')
assert(markdownFallback.priceEur === 6900, 'Dealer markdown price parse failed')
assert(markdownFallback.firstRegistration === '05/2018', 'Dealer markdown first registration parse failed')
assert(markdownFallback.mileageKm === 149000, 'Dealer markdown mileage parse failed')
assert(markdownFallback.powerKw === 63 && markdownFallback.powerPs === 86, 'Dealer markdown power parse failed')
assert(markdownFallback.fuel === 'Benzin', 'Dealer markdown fuel parse failed')

console.log('Parser fixtures passed.')
