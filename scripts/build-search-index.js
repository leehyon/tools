import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..')
const PUBLIC_DIR = path.join(ROOT_DIR, 'public')
const DATA_FILE = path.join(PUBLIC_DIR, 'data.json')
const INDEX_FILE = path.join(PUBLIC_DIR, 'searchIndex.json')
const EMBEDDINGS_FILE = path.join(PUBLIC_DIR, 'embeddings.json')

const EMBEDDING_API_KEY = process.env.EMBEDDING_API_KEY
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'bge-m3'
const EMBEDDING_URL = process.env.EMBEDDING_URL || 'https://model-square.app.baizhi.cloud/v1/embeddings'

function log(msg) {
  console.log(`[build-search] ${msg}`)
}

function error(msg) {
  console.error(`[build-search] ERROR: ${msg}`)
}

async function fetchWithAuth(url) {
  const token = process.env.GITHUB_TOKEN || process.env.PAT
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'koh-tools-build-script'
  }
  if (token) {
    headers['Authorization'] = `token ${token}`
  }
  
  const res = await fetch(url, { headers })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  }
  return res.text()
}

async function getEmbedding(text) {
  if (!EMBEDDING_API_KEY) {
    log('No embedding API key found, skipping vector embeddings')
    return null
  }

  try {
    const response = await fetch(EMBEDDING_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${EMBEDDING_API_KEY}`
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text
      })
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Embedding API error: ${response.status} - ${errText}`)
    }

    const data = await response.json()
    return data.data[0].embedding
  } catch (e) {
    error(`Failed to get embedding: ${e.message}`)
    return null
  }
}

function parseScenarios(markdown) {
  const scenarios = []
  
  const lines = markdown.split('\n')
  let inScenariosSection = false
  
  for (const line of lines) {
    if (line.match(/^##\s+(应用场景|使用场景|场景)/)) {
      inScenariosSection = true
      continue
    }
    
    if (inScenariosSection) {
      if (line.match(/^##\s+/)) {
        break
      }
      
      const match = line.match(/^[-*]\s+(.+)$/)
      if (match) {
        scenarios.push(match[1].trim())
      }
    }
  }
  
  return scenarios
}

function parseTldr(markdown) {
  const match = markdown.match(/##\s*TL;DR\s*\n+([^\n#]+)/i)
  return match ? match[1].trim() : null
}

function guideMarkdownToRawUrl(guideUrl) {
  if (!guideUrl) return null
  
  const match = guideUrl.match(/github\.com\/([^/]+)\/([^/]+)\/blob\/([^#]+)(?:\?.*)?$/)
  if (!match) return null
  
  const [, owner, repo, filePath] = match
  return `https://raw.githubusercontent.com/${owner}/${repo}/${filePath}`
}

async function processTool(tool) {
  if (!tool.guide_markdown) {
    return {
      name: tool.name,
      url: tool.url,
      tldr: tool.tldr || null,
      scenarios: [],
      tags: tool.tags || [],
      categories: tool.categories || []
    }
  }
  
  const rawUrl = guideMarkdownToRawUrl(tool.guide_markdown)
  if (!rawUrl) {
    log(`Could not parse guide_markdown URL: ${tool.guide_markdown}`)
    return {
      name: tool.name,
      url: tool.url,
      tldr: tool.tldr || null,
      scenarios: [],
      tags: tool.tags || [],
      categories: tool.categories || []
    }
  }
  
  try {
    const markdown = await fetchWithAuth(rawUrl)
    const scenarios = parseScenarios(markdown)
    const tldr = parseTldr(markdown) || tool.tldr || null
    
    return {
      name: tool.name,
      url: tool.url,
      tldr,
      scenarios,
      tags: tool.tags || [],
      categories: tool.categories || []
    }
  } catch (e) {
    error(`Failed to fetch ${rawUrl}: ${e.message}`)
    return {
      name: tool.name,
      url: tool.url,
      tldr: tool.tldr || null,
      scenarios: [],
      tags: tool.tags || [],
      categories: tool.categories || []
    }
  }
}

async function processEmbedding(tool) {
  if (!EMBEDDING_API_KEY) {
    return null
  }

  const textToEmbed = [
    tool.name,
    tool.tldr || '',
    ...tool.scenarios,
    ...(tool.tags || []),
    ...(tool.categories || [])
  ].join(' | ')

  return await getEmbedding(textToEmbed)
}

async function buildIndex() {
  log('Starting search index build...')
  
  if (!fs.existsSync(DATA_FILE)) {
    error('data.json not found!')
    process.exit(1)
  }
  
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'))
  log(`Loaded ${data.length} tools from data.json`)
  
  let existingIndex = {}
  let existingToolNames = new Set()
  
  if (fs.existsSync(INDEX_FILE)) {
    try {
      existingIndex = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'))
      existingToolNames = new Set(existingIndex.tools?.map(t => t.name) || [])
      log(`Loaded existing index with ${existingIndex.tools?.length || 0} tools`)
    } catch {
      log('Could not parse existing index, starting fresh')
    }
  }

  let existingEmbeddings = {}
  let existingEmbeddingNames = new Set()

  if (fs.existsSync(EMBEDDINGS_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(EMBEDDINGS_FILE, 'utf-8'))
      // The on-disk file is wrapped: { version, model, updatedAt, embeddings: {...} }.
      // Older runs that ignored the wrapper nested the whole file on every write,
      // so we walk any nesting depth to recover the real flat map.
      const flat = {}
      const recover = (node) => {
        if (!node || typeof node !== 'object') return
        for (const k of Object.keys(node)) {
          const v = node[k]
          if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'number') {
            if (!(k in flat)) flat[k] = v
          } else if (v && typeof v === 'object' && !Array.isArray(v)) {
            recover(v)
          }
        }
      }
      recover(raw)
      existingEmbeddings = flat
      existingEmbeddingNames = new Set(Object.keys(flat))
      log(`Loaded existing embeddings for ${existingEmbeddingNames.size} tools`)
    } catch {
      log('Could not parse existing embeddings, starting fresh')
    }
  }
  
  const newTools = data.filter(t => !existingToolNames.has(t.name))
  const updatedTools = data.filter(t => {
    const existing = existingIndex.tools?.find(et => et.name === t.name)
    if (!existing) return true
    return t.timestamp !== existing.timestamp
  })

  const toolsNeedingEmbedding = [
    ...newTools,
    ...updatedTools
  ].filter(t => !existingEmbeddingNames.has(t.name))
  
  const toolsToProcess = [...new Set([...newTools, ...updatedTools])]
  
  if (toolsToProcess.length === 0) {
    log('No new or updated tools to process')
    return
  }
  
  log(`Processing ${toolsToProcess.length} tools (${newTools.length} new, ${updatedTools.length} updated)`)
  if (EMBEDDING_API_KEY) {
    log(`Using embedding model: ${EMBEDDING_MODEL}`)
  }
  
  const processedTools = []
  for (const tool of toolsToProcess) {
    const processed = await processTool(tool)
    processed.timestamp = tool.timestamp
    processedTools.push(processed)
    log(`Processed: ${tool.name} (${processed.scenarios.length} scenarios)`)
  }

  const newEmbeddings = { ...existingEmbeddings }

  if (EMBEDDING_API_KEY && toolsNeedingEmbedding.length > 0) {
    log(`Generating embeddings for ${toolsNeedingEmbedding.length} tools...`)
    
    for (const tool of toolsNeedingEmbedding) {
      const processed = processedTools.find(t => t.name === tool.name)
      if (processed) {
        const embedding = await processEmbedding(processed)
        if (embedding) {
          newEmbeddings[tool.name] = embedding
          log(`Generated embedding for: ${tool.name}`)
        }
      }
    }
  }
  
  const allTools = []
  const processedNames = new Set(processedTools.map(t => t.name))
  
  for (const tool of (existingIndex.tools || [])) {
    if (!processedNames.has(tool.name)) {
      allTools.push(tool)
    }
  }
  
  allTools.push(...processedTools)
  
  const newIndex = {
    version: 2,
    updatedAt: new Date().toISOString(),
    tools: allTools
  }

  const embeddingsData = {
    version: 2,
    model: EMBEDDING_MODEL,
    updatedAt: new Date().toISOString(),
    embeddings: newEmbeddings
  }

  // Sanity check: newEmbeddings should be a flat {toolName: vector} map.
  // The four meta keys below are the wrapper that the disk format uses;
  // if any show up here it means the read step was wrong and we'd nest on write.
  const metaKeys = ['version', 'model', 'updatedAt', 'embeddings']
  const strayMeta = metaKeys.filter(k => k in newEmbeddings)
  if (strayMeta.length > 0) {
    error(`Refusing to write: newEmbeddings contains wrapper meta keys ${strayMeta.join(', ')}. ` +
          `This would re-introduce the recursive-nesting bug. Aborting.`)
    process.exit(1)
  }

  const indexJson = JSON.stringify(newIndex, null, 2)
  const embeddingsJson = JSON.stringify(embeddingsData, null, 2)
  const embeddingsSizeMiB = Buffer.byteLength(embeddingsJson, 'utf-8') / 1024 / 1024
  if (embeddingsSizeMiB > 24) {
    error(`embeddings.json would be ${embeddingsSizeMiB.toFixed(2)} MiB (>24 MiB safety margin; Cloudflare limit is 25 MiB). Aborting.`)
    process.exit(1)
  }

  fs.writeFileSync(INDEX_FILE, indexJson, 'utf-8')
  fs.writeFileSync(EMBEDDINGS_FILE, embeddingsJson, 'utf-8')
  
  log(`Wrote search index with ${allTools.length} tools to searchIndex.json`)
  log(`Wrote ${Object.keys(newEmbeddings).length} embeddings to embeddings.json`)
}

buildIndex().catch(e => {
  error(`Build failed: ${e.message}`)
  process.exit(1)
})
