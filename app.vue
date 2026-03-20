<script setup lang="ts">
type SellerMode = 'private-used' | 'dealer-margin' | 'dealer-net' | 'new-eu-vehicle'

interface CostCard {
  id: string
  label: string
  amount: number
  formula: string
  note: string
}

interface CardEdit {
  custom: boolean
  value: number
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

interface ParseResponse {
  listing: ParsedListing
  suggestedScenario: {
    purchasePrice: number | null
    vehicleAgeMonths: number | null
    mileageKm: number | null
    co2Gkm: number | null
    powertrain: string
    iedmtTaxBase: number | null
    sellerMode: SellerMode
  }
}

function isParseResponse(value: unknown): value is ParseResponse {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<ParseResponse>
  return !!candidate.suggestedScenario && typeof candidate.suggestedScenario === 'object' && !!candidate.listing
}

const sellerModes: { value: SellerMode; label: string; note: string }[] = [
  {
    value: 'private-used',
    label: 'Private seller',
    note: 'Usually no VAT on the German invoice; some cases may need ITP in Spain.',
  },
  {
    value: 'dealer-margin',
    label: 'Dealer margin scheme',
    note: 'Common used-car dealer case where VAT is embedded and not shown separately.',
  },
  {
    value: 'dealer-net',
    label: 'Dealer net invoice',
    note: 'Use when Spanish acquisition VAT cost needs to be considered.',
  },
  {
    value: 'new-eu-vehicle',
    label: 'New vehicle VAT rule',
    note: 'For vehicles within 6 months or under 6,000 km under EU VAT rules.',
  },
]

const scenario = reactive({
  mobileDeUrl: 'https://www.mobile.de/',
  purchasePrice: 18200,
  sellerMode: 'dealer-margin' as SellerMode,
  vehicleAgeMonths: 20,
  mileageKm: 42000,
  co2Gkm: 134,
  powertrain: 'petrol',
  spanishVatRate: 21,
  vatRecoveryPercent: 100,
  iedmtTaxBase: 18200,
  itpPrivateUsed: 0,
  routeDistanceKm: 2260,
  fuelConsumption: 6.8,
  fuelPrice: 1.78,
  exportPlatesAndInsurance: 240,
  tollsAndRoads: 170,
  hotelAndMeals: 180,
  flightAndTransit: 130,
  itvAndFicha: 185,
  homologation: 0,
  translationDocs: 45,
  dgtFee: 99.77,
  municipalIvtm: 165,
  spanishPlates: 42,
  gestoria: 180,
})

const hasCalculated = ref(true)
const cardEdits = reactive<Record<string, CardEdit>>({})
const isCalculating = ref(false)
const parseError = ref('')
const parsedListing = ref<ParsedListing | null>(null)

const euroFormatter = new Intl.NumberFormat('en-IE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
})

function money(value: number) {
  return euroFormatter.format(Number.isFinite(value) ? value : 0)
}

function clampPositive(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

const vehicleCountsAsNew = computed(() => scenario.vehicleAgeMonths <= 6 || scenario.mileageKm <= 6000)

const iedmtRate = computed(() => {
  if (scenario.powertrain === 'electric') {
    return 0
  }

  if (scenario.co2Gkm <= 120) {
    return 0
  }

  if (scenario.co2Gkm < 160) {
    return 0.0475
  }

  if (scenario.co2Gkm < 200) {
    return 0.0975
  }

  return 0.1475
})

const acquisitionTaxAmount = computed(() => {
  if (scenario.sellerMode === 'private-used') {
    return clampPositive(scenario.itpPrivateUsed)
  }

  if (scenario.sellerMode === 'dealer-margin') {
    return 0
  }

  const vatBase = clampPositive(scenario.purchasePrice)
  const vatRate = clampPositive(scenario.spanishVatRate) / 100
  const unrecoveredShare = 1 - Math.min(clampPositive(scenario.vatRecoveryPercent), 100) / 100

  return roundCurrency(vatBase * vatRate * unrecoveredShare)
})

const fuelDriveAmount = computed(() => {
  const litres = (clampPositive(scenario.routeDistanceKm) / 100) * clampPositive(scenario.fuelConsumption)
  return roundCurrency(litres * clampPositive(scenario.fuelPrice))
})

const cards = computed<CostCard[]>(() => [
  {
    id: 'purchase-price',
    label: 'Car purchase in Germany',
    amount: clampPositive(scenario.purchasePrice),
    formula: 'Manual purchase price from the mobile.de deal.',
    note: 'Use the real agreed invoice or contract amount.',
  },
  {
    id: 'acquisition-tax',
    label: 'Spain acquisition tax / VAT',
    amount: acquisitionTaxAmount.value,
    formula:
      scenario.sellerMode === 'private-used'
        ? 'Manual ITP amount for the private-purchase route.'
        : scenario.sellerMode === 'dealer-margin'
          ? '0 in this calculator for margin-scheme used stock.'
          : `${money(scenario.purchasePrice)} x ${scenario.spanishVatRate}% x unrecovered share`,
    note: 'This is the editable tax card for private-purchase tax or acquisition VAT cost.',
  },
  {
    id: 'co2-tax',
    label: 'CO2 registration tax (IEDMT)',
    amount: roundCurrency(clampPositive(scenario.iedmtTaxBase) * iedmtRate.value),
    formula: `${money(scenario.iedmtTaxBase)} x ${(iedmtRate.value * 100).toFixed(2)}% based on CO2 band`,
    note: 'Default Spanish registration-tax band derived from CO2 emissions.',
  },
  {
    id: 'export-plates',
    label: 'German export plates and insurance',
    amount: clampPositive(scenario.exportPlatesAndInsurance),
    formula: 'Manual package for temporary export registration and short insurance.',
    note: 'Needed when you drive the car out of Germany yourself.',
  },
  {
    id: 'fuel-drive',
    label: 'Fuel for drive to Spain',
    amount: fuelDriveAmount.value,
    formula: `${scenario.routeDistanceKm} km / 100 x ${scenario.fuelConsumption} L/100 x ${money(scenario.fuelPrice)}`,
    note: 'Based on your route distance, fuel consumption, and fuel price.',
  },
  {
    id: 'tolls',
    label: 'Tolls and road charges',
    amount: clampPositive(scenario.tollsAndRoads),
    formula: 'Manual estimate for route tolls, stickers, and road fees.',
    note: 'Mostly relevant through France and toll segments on the way home.',
  },
  {
    id: 'hotel',
    label: 'Hotel and meals',
    amount: clampPositive(scenario.hotelAndMeals),
    formula: 'Manual travel buffer for overnight stop and food.',
    note: 'Keep it even if the trip slips by one day.',
  },
  {
    id: 'flight',
    label: 'Flight and local transit',
    amount: clampPositive(scenario.flightAndTransit),
    formula: 'Manual pickup travel cost to reach the seller.',
    note: 'Covers your trip into Germany before driving back.',
  },
  {
    id: 'itv',
    label: 'ITV and ficha tecnica',
    amount: clampPositive(scenario.itvAndFicha),
    formula: 'Manual ITV station cost.',
    note: 'Spanish inspection and technical paperwork to register the car.',
  },
  {
    id: 'homologation',
    label: 'Homologation or ficha reducida',
    amount: clampPositive(scenario.homologation),
    formula: 'Manual amount, often zero when documents are already enough.',
    note: 'Use only if ITV or gestor says extra technical paperwork is needed.',
  },
  {
    id: 'translation',
    label: 'Document translation',
    amount: clampPositive(scenario.translationDocs),
    formula: 'Manual translation or certification cost.',
    note: 'Useful when foreign paperwork needs to be translated for Spanish registration.',
  },
  {
    id: 'dgt',
    label: 'DGT registration fee',
    amount: clampPositive(scenario.dgtFee),
    formula: 'Manual DGT fee loaded from current research baseline.',
    note: 'Official registration fee for ordinary matriculation.',
  },
  {
    id: 'ivtm',
    label: 'Municipal IVTM road tax',
    amount: clampPositive(scenario.municipalIvtm),
    formula: 'Manual amount for your registration town hall.',
    note: 'This changes by municipality.',
  },
  {
    id: 'plates',
    label: 'Spanish plates',
    amount: clampPositive(scenario.spanishPlates),
    formula: 'Manual cost for physical number plates.',
    note: 'Paid after the registration number is assigned.',
  },
  {
    id: 'gestoria',
    label: 'Gestoria handling',
    amount: clampPositive(scenario.gestoria),
    formula: 'Manual admin fee if a gestor files everything for you.',
    note: 'Set to zero if you handle all paperwork yourself.',
  },
])

watchEffect(() => {
  for (const card of cards.value) {
    const edit = ensureCardEdit(card.id, card.amount)

    if (!edit.custom) {
      edit.value = roundCurrency(card.amount)
    }
  }
})

function cardValue(card: CostCard) {
  const edit = cardEdits[card.id]

  if (edit?.custom) {
    return clampPositive(edit.value)
  }

  return roundCurrency(card.amount)
}

const totalSpend = computed(() => {
  return roundCurrency(cards.value.reduce((sum, card) => sum + cardValue(card), 0))
})

const totalSpendAbovePurchase = computed(() => {
  return roundCurrency(totalSpend.value - clampPositive(scenario.purchasePrice))
})

const totalFormulaText = computed(() => {
  return `${cards.value
    .map((card) => `${card.label} (${money(cardValue(card))})`)
    .join(' + ')} = Total spend (${money(totalSpend.value)})`
})

function ensureCardEdit(id: string, fallbackValue = 0) {
  if (!cardEdits[id]) {
    cardEdits[id] = {
      custom: false,
      value: roundCurrency(fallbackValue),
    }
  }

  return cardEdits[id]!
}

function toggleCardEdit(card: CostCard) {
  const edit = cardEdits[card.id]

  if (!edit) {
    return
  }

  if (!edit.custom) {
    edit.value = roundCurrency(card.amount)
  }

  edit.custom = !edit.custom
}

function updateCardValue(id: string, event: Event) {
  const target = event.target as HTMLInputElement
  const edit = cardEdits[id]

  if (!edit) {
    return
  }

  edit.value = Number(target.value)
}

async function calculate() {
  parseError.value = ''
  isCalculating.value = true

  try {
    const response = await $fetch<unknown>('/api/parse-mobile', {
      method: 'POST',
      body: {
        url: scenario.mobileDeUrl,
      },
    })

     if (!isParseResponse(response)) {
       throw new Error('Parser returned an unexpected response. Refresh the page and try again.')
     }

      if (!response.listing.priceEur && !response.listing.mileageKm && !response.listing.firstRegistration) {
        throw new Error('This mobile.de listing could not be parsed. The source may be blocked or missing key vehicle data.')
      }

      parsedListing.value = response.listing

    if (response.suggestedScenario.purchasePrice !== null) {
      scenario.purchasePrice = response.suggestedScenario.purchasePrice
      scenario.iedmtTaxBase = response.suggestedScenario.purchasePrice
    }

    if (response.suggestedScenario.vehicleAgeMonths !== null) {
      scenario.vehicleAgeMonths = response.suggestedScenario.vehicleAgeMonths
    }

    if (response.suggestedScenario.mileageKm !== null) {
      scenario.mileageKm = response.suggestedScenario.mileageKm
    }

    if (response.suggestedScenario.co2Gkm !== null) {
      scenario.co2Gkm = response.suggestedScenario.co2Gkm
    }

    scenario.powertrain = response.suggestedScenario.powertrain
    scenario.sellerMode = response.suggestedScenario.sellerMode

    hasCalculated.value = true
  } catch (error) {
    parseError.value = error instanceof Error ? error.message : 'Could not parse this mobile.de URL.'
  } finally {
    isCalculating.value = false
  }
}

const helperText = computed(() => {
  if (vehicleCountsAsNew.value) {
    return 'This car counts as new under the EU 6 months / 6,000 km rule, so review VAT treatment carefully.'
  }

  return 'This calculator is focused only on the spend needed to buy in Germany, drive to Spain, and register on Spanish plates.'
})
</script>

<template>
  <div class="import-page">
    <main class="import-shell">
      <section class="top-strip">
        <div class="url-panel">
          <div class="url-actions">
            <label class="field">
              <span>mobile.de URL</span>
              <input v-model="scenario.mobileDeUrl" class="field-input" type="url" placeholder="https://www.mobile.de/..." />
            </label>

            <button class="calculate-button" type="button" :disabled="isCalculating" @click="calculate">
              {{ isCalculating ? 'Parsing...' : 'Calculate' }}
            </button>
          </div>

          <p v-if="parseError" class="error-line">{{ parseError }}</p>
        </div>
      </section>

      <section v-if="parsedListing" class="listing-panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">Parsed from URL</p>
            <h2>{{ parsedListing.title || 'mobile.de listing' }}</h2>
          </div>
        </div>

        <div class="listing-grid">
          <article class="listing-item">
            <span>Price</span>
            <strong>{{ parsedListing.priceEur ? money(parsedListing.priceEur) : 'Not found' }}</strong>
          </article>
          <article class="listing-item">
            <span>First registration</span>
            <strong>{{ parsedListing.firstRegistration || 'Not found' }}</strong>
          </article>
          <article class="listing-item">
            <span>Mileage</span>
            <strong>{{ parsedListing.mileageKm ? `${parsedListing.mileageKm.toLocaleString('en-IE')} km` : 'Not found' }}</strong>
          </article>
          <article class="listing-item">
            <span>Fuel</span>
            <strong>{{ parsedListing.fuel || 'Not found' }}</strong>
          </article>
          <article class="listing-item">
            <span>Transmission</span>
            <strong>{{ parsedListing.transmission || 'Not found' }}</strong>
          </article>
          <article class="listing-item">
            <span>Power</span>
            <strong>
              {{ parsedListing.powerKw ? `${parsedListing.powerKw} kW` : 'Not found' }}
              <template v-if="parsedListing.powerPs"> / {{ parsedListing.powerPs }} PS</template>
            </strong>
          </article>
          <article class="listing-item">
            <span>Seller</span>
            <strong>{{ parsedListing.sellerName || parsedListing.sellerType }}</strong>
          </article>
          <article class="listing-item">
            <span>Location</span>
            <strong>{{ parsedListing.location || 'Not found' }}</strong>
          </article>
          <article class="listing-item">
            <span>CO2</span>
            <strong>{{ parsedListing.co2Gkm ? `${parsedListing.co2Gkm} g/km` : 'Needs manual input' }}</strong>
          </article>
        </div>

        <div v-if="parsedListing.notes.length" class="notes-row">
          <span v-for="note in parsedListing.notes" :key="note" class="note-pill">{{ note }}</span>
        </div>
      </section>

      <section class="input-layout">
        <article class="input-card">
          <div class="section-head">
            <div>
              <p class="eyebrow">Car facts</p>
              <h2>Vehicle and tax inputs</h2>
            </div>
          </div>

          <div class="field-grid three-up">
            <label class="field">
              <span>Purchase price</span>
              <input v-model.number="scenario.purchasePrice" class="field-input" type="number" min="0" step="100" />
            </label>

            <label class="field">
              <span>Age in months</span>
              <input v-model.number="scenario.vehicleAgeMonths" class="field-input" type="number" min="0" step="1" />
            </label>

            <label class="field">
              <span>Mileage km</span>
              <input v-model.number="scenario.mileageKm" class="field-input" type="number" min="0" step="100" />
            </label>

            <label class="field">
              <span>CO2 g/km</span>
              <input v-model.number="scenario.co2Gkm" class="field-input" type="number" min="0" step="1" />
            </label>

            <label class="field">
              <span>Powertrain</span>
              <select v-model="scenario.powertrain" class="field-input">
                <option value="petrol">Petrol</option>
                <option value="diesel">Diesel</option>
                <option value="hybrid">Hybrid</option>
                <option value="phev">Plug-in hybrid</option>
                <option value="electric">Electric</option>
              </select>
            </label>

            <label class="field">
              <span>IEDMT tax base</span>
              <input v-model.number="scenario.iedmtTaxBase" class="field-input" type="number" min="0" step="100" />
            </label>

            <label class="field field-span-full">
              <span>Seller type</span>
              <select v-model="scenario.sellerMode" class="field-input">
                <option v-for="mode in sellerModes" :key="mode.value" :value="mode.value">{{ mode.label }}</option>
              </select>
            </label>

            <label class="field">
              <span>Spanish VAT rate %</span>
              <input v-model.number="scenario.spanishVatRate" class="field-input" type="number" min="0" step="0.1" />
            </label>

            <label class="field">
              <span>VAT recovery %</span>
              <input v-model.number="scenario.vatRecoveryPercent" class="field-input" type="number" min="0" max="100" step="1" />
            </label>

            <label class="field">
              <span>ITP for private route</span>
              <input v-model.number="scenario.itpPrivateUsed" class="field-input" type="number" min="0" step="10" />
            </label>
          </div>

          <p class="helper-line">{{ helperText }}</p>
        </article>

        <article class="input-card">
          <div class="section-head">
            <div>
              <p class="eyebrow">Drive back to Spain</p>
              <h2>Travel and Spanish registration inputs</h2>
            </div>
          </div>

          <div class="field-grid three-up">
            <label class="field">
              <span>Route km</span>
              <input v-model.number="scenario.routeDistanceKm" class="field-input" type="number" min="0" step="10" />
            </label>

            <label class="field">
              <span>Fuel L/100 km</span>
              <input v-model.number="scenario.fuelConsumption" class="field-input" type="number" min="0" step="0.1" />
            </label>

            <label class="field">
              <span>Fuel price / litre</span>
              <input v-model.number="scenario.fuelPrice" class="field-input" type="number" min="0" step="0.01" />
            </label>

            <label class="field">
              <span>Export plates + insurance</span>
              <input v-model.number="scenario.exportPlatesAndInsurance" class="field-input" type="number" min="0" step="10" />
            </label>

            <label class="field">
              <span>Tolls and roads</span>
              <input v-model.number="scenario.tollsAndRoads" class="field-input" type="number" min="0" step="10" />
            </label>

            <label class="field">
              <span>Hotel and meals</span>
              <input v-model.number="scenario.hotelAndMeals" class="field-input" type="number" min="0" step="10" />
            </label>

            <label class="field">
              <span>Flight and local transit</span>
              <input v-model.number="scenario.flightAndTransit" class="field-input" type="number" min="0" step="10" />
            </label>

            <label class="field">
              <span>ITV and ficha tecnica</span>
              <input v-model.number="scenario.itvAndFicha" class="field-input" type="number" min="0" step="5" />
            </label>

            <label class="field">
              <span>Homologation</span>
              <input v-model.number="scenario.homologation" class="field-input" type="number" min="0" step="10" />
            </label>

            <label class="field">
              <span>Document translation</span>
              <input v-model.number="scenario.translationDocs" class="field-input" type="number" min="0" step="5" />
            </label>

            <label class="field">
              <span>DGT fee</span>
              <input v-model.number="scenario.dgtFee" class="field-input" type="number" min="0" step="0.01" />
            </label>

            <label class="field">
              <span>Municipal IVTM</span>
              <input v-model.number="scenario.municipalIvtm" class="field-input" type="number" min="0" step="5" />
            </label>

            <label class="field">
              <span>Spanish plates</span>
              <input v-model.number="scenario.spanishPlates" class="field-input" type="number" min="0" step="1" />
            </label>

            <label class="field">
              <span>Gestoria</span>
              <input v-model.number="scenario.gestoria" class="field-input" type="number" min="0" step="10" />
            </label>
          </div>
        </article>
      </section>

      <section v-if="hasCalculated" class="results-block">
        <div class="results-head">
          <div>
            <p class="eyebrow">Spend result</p>
            <h2>Total cash out to buy, drive home, and register in Spain</h2>
          </div>

          <div class="results-summary-cards">
            <div class="total-chip">
              <span>Total spend</span>
              <strong>{{ money(totalSpend) }}</strong>
            </div>

            <div class="total-chip total-chip-secondary">
              <span>Total costs</span>
              <strong>{{ money(totalSpendAbovePurchase) }}</strong>
            </div>
          </div>
        </div>

        <div class="cards-grid">
          <article v-for="card in cards" :key="card.id" class="cost-card">
            <div class="cost-head">
              <strong>{{ card.label }}</strong>
              <span>{{ money(cardValue(card)) }}</span>
            </div>

            <p class="cost-note">{{ card.note }}</p>
            <small class="cost-formula">{{ card.formula }}</small>

            <div class="card-actions">
              <button class="mini-button" type="button" @click="toggleCardEdit(card)">
                {{ ensureCardEdit(card.id, card.amount).custom ? 'Use formula' : 'Edit value' }}
              </button>

              <input
                class="mini-input"
                type="number"
                min="0"
                step="1"
                :disabled="!ensureCardEdit(card.id, card.amount).custom"
                :value="ensureCardEdit(card.id, card.amount).value"
                @input="updateCardValue(card.id, $event)"
              />
            </div>
          </article>
        </div>
      </section>

      <section v-if="hasCalculated" class="formula-panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">Calculation formula</p>
            <h2>How the total spend is built</h2>
          </div>
        </div>

        <div class="formula-total">
          <strong>{{ totalFormulaText }}</strong>
        </div>
      </section>
    </main>
  </div>
</template>
