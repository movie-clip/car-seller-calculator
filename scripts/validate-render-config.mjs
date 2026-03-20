import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(process.cwd())

function fail(message) {
  console.error(message)
  process.exit(1)
}

function ensureFile(path) {
  if (!existsSync(path)) {
    fail(`Missing required file: ${path}`)
  }
}

const renderPath = join(root, 'render.yaml')
const packagePath = join(root, 'package.json')
const nuxtPath = join(root, 'nuxt.config.ts')
const appPath = join(root, 'app.vue')

ensureFile(renderPath)
ensureFile(packagePath)
ensureFile(nuxtPath)
ensureFile(appPath)

const renderYaml = readFileSync(renderPath, 'utf8')
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))

const rootDirMatch = renderYaml.match(/^\s*rootDir:\s*(.+)$/m)
if (rootDirMatch) {
  const configuredRoot = rootDirMatch[1].trim().replace(/^['"]|['"]$/g, '')
  const resolvedRoot = resolve(root, configuredRoot)

  if (!existsSync(resolvedRoot)) {
    fail(`render.yaml points to a missing rootDir: ${configuredRoot}`)
  }

  if (resolvedRoot !== root) {
    fail(`render.yaml rootDir must match this standalone repo root. Found: ${configuredRoot}`)
  }
}

if (!renderYaml.includes('buildCommand: npm install && npm run build')) {
  fail('render.yaml is missing the expected Render build command')
}

if (!renderYaml.includes('startCommand: npm run start')) {
  fail('render.yaml is missing the expected Render start command')
}

if (packageJson.scripts?.start !== 'node .output/server/index.mjs') {
  fail('package.json start script must run the built Nitro server')
}

console.log('Render config looks valid for a standalone repo.')
