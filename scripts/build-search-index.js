import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..')
const PUBLIC_DIR = path.join(ROOT_DIR, 'public')
const DATA_FILE = path.join(PUBLIC_DIR, 'data.json')
const INDEX_FILE = path.join(PUBLIC_DIR, 'searchIndex.json')

const GITHUB_REPO = 'leehyon/kohstool-guide'
const GITHUB_API_BASE = 'https://api.github.com'

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
  
  const newTools = data.filter(t => !existingToolNames.has(t.name))
  const updatedTools = data.filter(t => {
    const existing = existingIndex.tools?.find(et => et.name === t.name)
    if (!existing) return true
    return t.timestamp !== existing.timestamp
  })
  
  const toolsToProcess = [...new Set([...newTools, ...updatedTools])]
  
  if (toolsToProcess.length === 0) {
    log('No new or updated tools to process')
    return
  }
  
  log(`Processing ${toolsToProcess.length} tools (${newTools.length} new, ${updatedTools.length} updated)`)
  
  const processedTools = []
  for (const tool of toolsToProcess) {
    const processed = await processTool(tool)
    processed.timestamp = tool.timestamp
    processedTools.push(processed)
    log(`Processed: ${tool.name} (${processed.scenarios.length} scenarios)`)
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
    version: 1,
    updatedAt: new Date().toISOString(),
    tools: allTools
  }
  
  fs.writeFileSync(INDEX_FILE, JSON.stringify(newIndex, null, 2), 'utf-8')
  log(`Wrote search index with ${allTools.length} tools to searchIndex.json`)
}

buildIndex().catch(e => {
  error(`Build failed: ${e.message}`)
  process.exit(1)
})
