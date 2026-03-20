import { spawn } from 'node:child_process'

const port = 4100
const url = `http://127.0.0.1:${port}`
const expectedText = 'Total cash out to buy, drive home, and register in Spain'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url)
      const html = await response.text()

      if (!response.ok) {
        throw new Error(`Unexpected status ${response.status}`)
      }

      if (!html.includes(expectedText)) {
        throw new Error('Production HTML did not include the expected UI text')
      }

      return
    } catch {
      await sleep(500)
    }
  }

  throw new Error('Timed out waiting for production server to render the UI')
}

const server = spawn('node', ['.output/server/index.mjs'], {
  env: {
    ...process.env,
    PORT: String(port),
    NITRO_PORT: String(port),
    HOST: '127.0.0.1',
    NITRO_HOST: '127.0.0.1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let stderr = ''

server.stderr.on('data', (chunk) => {
  stderr += chunk.toString()
})

server.stdout.on('data', () => {})

try {
  await waitForServer()
  console.log('Production render smoke test passed.')
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))

  if (stderr.trim()) {
    console.error(stderr.trim())
  }

  process.exitCode = 1
} finally {
  server.kill('SIGTERM')
}
