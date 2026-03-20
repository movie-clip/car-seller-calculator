export default defineNuxtConfig({
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: 'Car Seller Service',
      meta: [
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1',
        },
        {
          name: 'description',
          content:
            'Calculator for buying a car in Germany, importing it into Spain, and estimating resale profit with transparent formulas.',
        },
      ],
    },
  },
  future: {
    compatibilityVersion: 4,
  },
  compatibilityDate: '2026-03-19',
})
