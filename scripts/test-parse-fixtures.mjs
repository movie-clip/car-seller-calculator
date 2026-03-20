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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

const blockedFixture = readFileSync(join(root, 'scripts', 'fixtures', 'blocked-response.md'), 'utf8')
const listingFixture = readFileSync(join(root, 'scripts', 'fixtures', 'listing-response.md'), 'utf8')

assert(isBlockedResponse(blockedFixture), 'Blocked-response fixture should be detected as blocked')
assert(!looksLikeListing(blockedFixture), 'Blocked-response fixture should not be accepted as a listing')

assert(!isBlockedResponse(listingFixture), 'Listing fixture must not be classified as blocked')
assert(looksLikeListing(listingFixture), 'Listing fixture should be recognized as a real listing')
assert(parsePrice(listingFixture) === 6900, 'Listing fixture price parse failed')
assert(parseMileage(listingFixture) === 149000, 'Listing fixture mileage parse failed')
assert(parseFirstRegistration(listingFixture) === '05/2018', 'Listing fixture first registration parse failed')
assert(parseCo2(listingFixture) === 109, 'Listing fixture CO2 parse failed')

console.log('Parser fixtures passed.')
