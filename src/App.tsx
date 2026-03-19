import { useEffect, useMemo, useState } from 'react'
import type { Tool } from './types'
import {
  normalizeTool,
  safeUrl,
  shortDateLabel,
  uniq,
  weekStartIsoFromTimestampSeconds
} from './utils'

type LoadState =
  | { status: 'idle' | 'loading' }
  | { status: 'loaded'; tools: Tool[] }
  | { status: 'error'; message: string }

function countByWeek(tools: Tool[]): { week: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const tool of tools) {
    const key = typeof tool.timestamp === 'number' ? weekStartIsoFromTimestampSeconds(tool.timestamp) : 'unknown'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([week, count]) => ({ week, count }))
    .sort((a, b) => a.week.localeCompare(b.week))
}

function groupByCategory(tools: Tool[]): Map<string, Tool[]> {
  const map = new Map<string, Tool[]>()
  for (const tool of tools) {
    const cats = tool.categories?.length ? tool.categories : ['Uncategorized']
    for (const cat of cats) {
      const list = map.get(cat) ?? []
      list.push(tool)
      map.set(cat, list)
    }
  }
  return new Map([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])))
}

function groupByPlatform(tools: Tool[]): Map<string, Tool[]> {
  const map = new Map<string, Tool[]>()
  for (const tool of tools) {
    const platforms = tool.Platform?.length ? tool.Platform : ['Unspecified']
    for (const platform of platforms) {
      const list = map.get(platform) ?? []
      list.push(tool)
      map.set(platform, list)
    }
  }
  return new Map([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])))
}

function buildWeekSeries(weekly: { week: string; count: number }[]): { week: string; count: number }[] {
  const entries = weekly.filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.week)).sort((a, b) => a.week.localeCompare(b.week))
  if (entries.length <= 1) return weekly

  const parse = (iso: string) => new Date(`${iso}T00:00:00Z`)
  const start = parse(entries[0].week)
  const end = parse(entries[entries.length - 1].week)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return weekly

  const map = new Map(entries.map((x) => [x.week, x.count]))
  const series: { week: string; count: number }[] = []
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 7)) {
    const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    series.push({ week: iso, count: map.get(iso) ?? 0 })
  }
  return series
}

function catmullRomCurve(points: { x: number; y: number }[], tension = 0.5): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`

  let path = `M ${points[0].x} ${points[0].y}`

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2

    const cp1x = p1.x + (p2.x - p0.x) * tension / 6
    const cp1y = p1.y + (p2.y - p0.y) * tension / 6
    const cp2x = p2.x - (p3.x - p1.x) * tension / 6
    const cp2y = p2.y - (p3.y - p1.y) * tension / 6

    path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
  }

  return path
}

function linePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return ''
  return catmullRomCurve(points, 0.8)
}

function areaPath(points: { x: number; y: number; label?: string }[], baseline: number): string {
  if (points.length === 0) return ''
  const line = catmullRomCurve(points, 0.8)
  const last = points[points.length - 1]
  const first = points[0]
  return `${line} L ${last.x.toFixed(1)} ${baseline} L ${first.x.toFixed(1)} ${baseline} Z`
}

function hueFromString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % 360
}

function iconForCategory(category: string): string {
  const v = category.trim().toLowerCase()

  const has = (...parts: string[]) => parts.some((p) => v.includes(p))

  if (has('ai', 'aigc', '智能', '大模型', 'llm')) return 'fa-solid fa-brain'
  if (has('dev', 'code', '开发', '编程', '前端', '后端', '工程')) return 'fa-solid fa-code'
  if (has('自动化', 'automation', 'workflow', '流程', '脚本')) return 'fa-solid fa-gears'
  if (has('数据', 'data', '数据库', 'db', '表格', 'excel', 'sql')) return 'fa-solid fa-database'
  if (has('搜索', 'search', '检索')) return 'fa-solid fa-magnifying-glass'
  if (has('写作', 'writing', '文案', '笔记', 'note', 'markdown')) return 'fa-solid fa-pen-nib'
  if (has('阅读', 'reading', '学习', '知识', 'wiki', 'book')) return 'fa-solid fa-book'
  if (has('设计', 'design', 'ui', 'ux', '原型')) return 'fa-solid fa-palette'
  if (has('图片', '图像', 'image', 'photo', '绘图')) return 'fa-solid fa-image'
  if (has('视频', 'video')) return 'fa-solid fa-video'
  if (has('音频', '音乐', 'audio', 'music')) return 'fa-solid fa-music'
  if (has('安全', 'security', '隐私', 'privacy', '密码', 'auth')) return 'fa-solid fa-shield-halved'
  if (has('协作', 'collab', '团队', '沟通', 'chat')) return 'fa-solid fa-users'
  if (has('运维', 'ops', '部署', 'deploy', 'server', 'infra')) return 'fa-solid fa-server'
  if (has('测试', 'test', '质量', 'qa')) return 'fa-solid fa-bug'
  if (has('翻译', 'translate', '语言', 'language')) return 'fa-solid fa-language'
  if (has('效率', '生产力', 'productivity', '工具')) return 'fa-solid fa-bolt'

  return 'fa-solid fa-folder'
}

function iconForPlatform(platform: string): string {
  const v = platform.trim().toLowerCase()
  const has = (...parts: string[]) => parts.some((p) => v.includes(p))

  if (has('web', 'browser', '网页', '网站')) return 'fa-solid fa-globe'
  if (has('mac', 'macos', 'osx')) return 'fa-brands fa-apple'
  if (has('windows', 'win')) return 'fa-brands fa-windows'
  if (has('linux', 'ubuntu', 'debian', 'arch')) return 'fa-brands fa-linux'
  if (has('ios', 'iphone', 'ipad')) return 'fa-solid fa-mobile-screen'
  if (has('android')) return 'fa-brands fa-android'
  if (has('chrome')) return 'fa-brands fa-chrome'
  if (has('firefox')) return 'fa-brands fa-firefox-browser'

  return 'fa-solid fa-desktop'
}

type SortBy = 'name' | 'timestamp'
type SortOrder = 'asc' | 'desc'

export default function App() {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'idle' })
  const [tableSearch, setTableSearch] = useState('')
  const [selectedTag, setSelectedTag] = useState<string>('')
  const [activeCategory, setActiveCategory] = useState<string>('')
  const [activePlatform, setActivePlatform] = useState<string>('')
  const [sortBy, setSortBy] = useState<SortBy>('timestamp')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  async function load() {
    setLoadState({ status: 'loading' })
    try {
      const res = await fetch('/data.json', { cache: 'no-store' })
      if (!res.ok) throw new Error(`Failed to load data.json: ${res.status}`)
      const raw = (await res.json()) as unknown
      if (!Array.isArray(raw)) throw new Error('data.json should be an array')

      const tools: Tool[] = []
      for (const item of raw) {
        const tool = normalizeTool(item)
        if (tool) tools.push(tool)
      }
      setLoadState({ status: 'loaded', tools })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      setLoadState({ status: 'error', message })
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const allTools = loadState.status === 'loaded' ? loadState.tools : []
  const uniqueTags = useMemo(() => uniq(allTools.flatMap((t) => t.tags ?? [])), [allTools])
  const categoryGroupsAll = useMemo(() => groupByCategory(allTools), [allTools])
  const platformGroupsAll = useMemo(() => groupByPlatform(allTools), [allTools])

  const weeklyTrendRaw = useMemo(() => countByWeek(allTools), [allTools])
  const weeklyTrend = useMemo(() => buildWeekSeries(weeklyTrendRaw), [weeklyTrendRaw])

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const tool of allTools) {
      for (const tag of tool.tags ?? []) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1)
      }
    }
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.tag.localeCompare(b.tag)))
  }, [allTools])

  function includesIgnoreCase(haystack: string, needle: string): boolean {
    if (!needle.trim()) return true
    return haystack.toLowerCase().includes(needle.trim().toLowerCase())
  }

  // Top data region stays static; filters only affect the table.
  const filteredTools = useMemo(() => {
    const result = allTools.filter((tool) => {
      if (activeCategory) {
        const cats = tool.categories?.length ? tool.categories : ['Uncategorized']
        if (!cats.includes(activeCategory)) return false
      }

      if (activePlatform) {
        const platforms = tool.Platform?.length ? tool.Platform : ['Unspecified']
        if (!platforms.includes(activePlatform)) return false
      }

      if (selectedTag) {
        const tags = tool.tags ?? []
        if (!tags.includes(selectedTag)) return false
      }

      if (tableSearch.trim()) {
        const parts: string[] = []
        parts.push(tool.name)
        if (tool.description) parts.push(tool.description)
        if (tool.tldr) parts.push(tool.tldr)
        if (tool.url) parts.push(tool.url)
        if (tool.guide_markdown) parts.push(tool.guide_markdown)
        if (tool.tags?.length) parts.push(tool.tags.join(' '))
        if (tool.categories?.length) parts.push(tool.categories.join(' '))
        if (tool.Platform?.length) parts.push(tool.Platform.join(' '))
        if (!includesIgnoreCase(parts.join(' '), tableSearch)) return false
      }

      return true
    })

    result.sort((a, b) => {
      let cmp = 0
      if (sortBy === 'name') {
        cmp = a.name.localeCompare(b.name)
      } else {
        const tsA = a.timestamp ?? 0
        const tsB = b.timestamp ?? 0
        cmp = tsA - tsB
      }
      return sortOrder === 'asc' ? cmp : -cmp
    })

    return result
  }, [activeCategory, activePlatform, allTools, selectedTag, tableSearch, sortBy, sortOrder])

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebarHeader">
          <div className="brandTitle">What I Use</div>
          <div className="brandSub">tools.kohsruhe.com</div>
        </div>

        <nav className="nav">
          <button
            className={activeCategory === '' ? 'navItem navItemActive' : 'navItem'}
            onClick={() => {
              setActiveCategory('')
              setActivePlatform('')
            }}
            type="button"
          >
            <span className="navIcon">
              <i className="fa-solid fa-border-all" aria-hidden="true" />
            </span>
            <span>All Tools</span>
            <span className="navCount">{allTools.length}</span>
          </button>

          <div className="navSection navSectionCategories" aria-label="Categories">
            <div className="navSectionTitle">Category</div>
            <div className="navList">
              {[...categoryGroupsAll.entries()].map(([cat, list]) => (
                <button
                  key={cat}
                  className={activeCategory === cat ? 'navItem navItemActive' : 'navItem'}
                  onClick={() => setActiveCategory(cat)}
                  type="button"
                  title={cat}
                >
                  <span className="navIcon" aria-hidden="true">
                    <i className={iconForCategory(cat)} aria-hidden="true" />
                  </span>
                  <span className="truncate">{cat}</span>
                  <span className="navCount">{list.length}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="navSection navSectionPlatform" aria-label="Platform">
            <div className="navSectionTitle">Platform</div>
            <div className="navList">
              {[...platformGroupsAll.entries()].map(([platform, list]) => (
                <button
                  key={platform}
                  className={activePlatform === platform ? 'navItem navItemActive' : 'navItem'}
                  onClick={() => setActivePlatform(platform)}
                  type="button"
                  title={platform}
                >
                  <span className="navIcon" aria-hidden="true">
                    <i className={iconForPlatform(platform)} aria-hidden="true" />
                  </span>
                  <span className="truncate">{platform}</span>
                  <span className="navCount">{list.length}</span>
                </button>
              ))}
            </div>
          </div>
        </nav>

        <div className="sidebarFooter" aria-label="外部链接">
          <div className="brandLinks">
            <a
              className="brandLink"
              href="https://github.com/leehyon/tools"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub 仓库：leehyon/tools"
              title="leehyon/tools"
            >
              <i className="fa-brands fa-github" aria-hidden="true" />
            </a>
            <a
              className="brandLink"
              href="https://www.kohsruhe.com"
              target="_blank"
              rel="noreferrer"
              aria-label="主页：www.kohsruhe.com"
              title="www.kohsruhe.com"
            >
              <i className="fa-solid fa-globe" aria-hidden="true" />
            </a>
          </div>
        </div>
      </aside>

      <main className="main">
        <section className="content">
          {loadState.status === 'error' ? (
            <div className="panel">
              <div className="panelTitle">加载失败</div>
              <div className="muted">{loadState.message}</div>
              <div className="panelActions">
                <button className="btn" type="button" onClick={() => void load()}>
                  重试
                </button>
              </div>
            </div>
          ) : null}

          <div className="panel overviewPanel" aria-label="项目概览">
            <div className="panelTitle">Philosophy</div>
            <div className="muted" style={{ marginTop: 6 }}>
              工欲善其事，必先利其器
            </div>
            <ul className="overviewList">
              <li>
                通过浏览器插件自动发送工具链接到 GitHub 仓库并触发流程，提取网页内容给到大模型总结，生成最新的工具元数据
              </li>
              <li>
                该元数据文件会自动同步到另一个静态站点仓库，触发网站构建和部署，从而实现「内容更新即自动发布」
              </li>
            </ul>
          </div>

          <div className="topRow">
            <div className="panel">
              <div className="panelTitle">Weekly Trend</div>
              <div className="muted" style={{ marginTop: 4 }}>
                每周新增工具数
              </div>
              <div className="trendWrap" aria-label="每周趋势">
                {weeklyTrend.length === 0 ? (
                  <div className="muted">暂无数据</div>
                ) : (
                  (() => {
                    const chartSeries = weeklyTrend.slice(-8)
                    const w = 520
                    const h = 200
                    const padX = 30
                    const padY = 20
                    const bottomPad = 24
                    const max = Math.max(1, ...chartSeries.map((x) => x.count))
                    const min = 0
                    const mid = Math.round((max + min) / 2)
                    const baseline = h - bottomPad
                    const xStep = chartSeries.length > 1 ? (w - padX * 2) / (chartSeries.length - 1) : 0
                    const yFor = (count: number) => {
                      const t = (count - min) / (max - min)
                      return padY + (1 - t) * (baseline - padY)
                    }
                    const points = chartSeries.map((x, i) => ({ x: padX + i * xStep, y: yFor(x.count), label: x.week }))
                    const lineD = linePath(points)
                    const areaD = areaPath(points, baseline)
                    return (
                      <svg className="trendSvg" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Weekly trend line">
                        <defs>
                          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#9ca3af" stopOpacity="0.12" />
                            <stop offset="100%" stopColor="#9ca3af" stopOpacity="0.02" />
                          </linearGradient>
                          <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#a5b4fc" />
                            <stop offset="100%" stopColor="#94a3b8" />
                          </linearGradient>
                        </defs>
                        <g className="gridLines">
                          <line x1={padX} y1={baseline} x2={w - padX} y2={baseline} />
                          <line x1={padX} y1={padY} x2={w - padX} y2={padY} />
                          <line x1={padX} y1={(baseline + padY) / 2} x2={w - padX} y2={(baseline + padY) / 2} />
                        </g>
                        <g className="trendYAxis" aria-hidden="true">
                          <text className="trendYLabel" x={6} y={padY + 4}>
                            {max}
                          </text>
                          <text className="trendYLabel" x={6} y={(baseline + padY) / 2 + 4}>
                            {mid}
                          </text>
                          <text className="trendYLabel" x={6} y={baseline + 4}>
                            {min}
                          </text>
                        </g>
                        <path className="trendArea" d={areaD} fill="url(#areaGradient)" />
                        <path className="trendLineShadow" d={lineD} />
                        <path className="trendLine" d={lineD} stroke="url(#lineGradient)" />
                        <g>
                          {points.map((p, idx) => (
                            <g key={idx}>
                              <circle
                                className="trendDot"
                                cx={p.x}
                                cy={p.y}
                                r={3}
                                fill="url(#lineGradient)"
                                stroke="#fff"
                                strokeWidth={1.5}
                              >
                                <title>
                                  {shortDateLabel(p.label)}: {chartSeries[idx].count} 个工具
                                </title>
                              </circle>
                            </g>
                          ))}
                        </g>
                        <g className="trendXAxis" aria-hidden="true">
                          {points.map((p, idx) => (
                            <text
                              key={idx}
                              className="trendXLabel"
                              x={p.x}
                              y={h - 6}
                              textAnchor="middle"
                            >
                              {shortDateLabel(p.label)}
                            </text>
                          ))}
                        </g>
                      </svg>
                    )
                  })()
                )}
              </div>
            </div>

            <div className="panel">
              <div className="panelTitle">Tags</div>
              <div className="muted" style={{ marginTop: 4 }}>
                共 {uniqueTags.length} 个标签
              </div>
              <div className="bubbleStage" aria-label="标签气泡">
                {(() => {
                  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640
                  const maxTags = isMobile ? 10 : 20
                  const top = tagCounts.slice(0, maxTags)
                  if (top.length === 0) return <div className="muted">暂无数据</div>
                  const max = Math.max(...top.map((x) => x.count))
                  const min = Math.min(...top.map((x) => x.count))
                  const sizeFor = (count: number) => {
                    if (max === min) return 100
                    const t = (count - min) / (max - min)
                    return Math.round(58 + t * 72)
                  }
                  const positions: Array<{ left: string; top: string }> = [
                    { left: '50%', top: '50%' },
                    { left: '25%', top: '25%' },
                    { left: '75%', top: '25%' },
                    { left: '25%', top: '75%' },
                    { left: '75%', top: '75%' },
                    { left: '50%', top: '18%' },
                    { left: '50%', top: '82%' },
                    { left: '18%', top: '50%' },
                    { left: '82%', top: '50%' },
                    { left: '32%', top: '12%' },
                    { left: '68%', top: '12%' },
                    { left: '32%', top: '88%' },
                    { left: '68%', top: '88%' },
                    { left: '12%', top: '32%' },
                    { left: '88%', top: '32%' },
                    { left: '12%', top: '68%' },
                    { left: '88%', top: '68%' },
                    { left: '40%', top: '35%' },
                    { left: '60%', top: '65%' },
                    { left: '60%', top: '35%' }
                  ]
                  return top.map((x, i) => {
                    const size = sizeFor(x.count)
                    const opacity = 0.26 + (x.count / max) * 0.26
                    const p = positions[i] ?? positions[positions.length - 1]
                    const hue = hueFromString(x.tag)
                    const bg = `hsla(${hue}, 32%, 78%, ${opacity})`
                    return (
                      <button
                        key={x.tag}
                        className={selectedTag === x.tag ? 'bubble bubbleActive' : 'bubble'}
                        style={{ width: size, height: size, left: p.left, top: p.top, background: bg }}
                        title={`${x.tag}: ${x.count}`}
                        type="button"
                        onClick={() => setSelectedTag((cur) => (cur === x.tag ? '' : x.tag))}
                      >
                        <div className="bubbleText">{x.tag}</div>
                        <div className="bubbleSub">{x.count}</div>
                      </button>
                    )
                  })
                })()}
              </div>
            </div>
          </div>

          <div className="panel panelLarge">
            <div className="panelTitle">Tool List</div>
            <div className="muted" style={{ marginTop: 4 }}>
              当前结果：{filteredTools.length} 个
            </div>

            <div className="tableToolbar" role="search">
              <input
                className="tableSearch"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                placeholder="搜索：名称 / 简介 / 标签 / 平台"
                aria-label="搜索工具"
              />
              <select
                className="sortSelect"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                aria-label="排序方式"
              >
                <option value="timestamp">按收录时间</option>
                <option value="name">按名称</option>
              </select>
              <button
                className="sortBtn"
                type="button"
                onClick={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
                title={sortOrder === 'asc' ? '升序' : '降序'}
                aria-label={sortOrder === 'asc' ? '升序' : '降序'}
              >
                <i className={sortOrder === 'asc' ? 'fa-solid fa-arrow-up' : 'fa-solid fa-arrow-down'} aria-hidden="true" />
              </button>
              {selectedTag ? (
                <button className="chipBtn" type="button" onClick={() => setSelectedTag('')} title="清除标签筛选">
                  Tag: {selectedTag} ×
                </button>
              ) : null}
              {activePlatform ? (
                <button className="chipBtn" type="button" onClick={() => setActivePlatform('')} title="清除平台筛选">
                  Platform: {activePlatform} ×
                </button>
              ) : null}
              {tableSearch.trim() ? (
                <button className="btn btnSmall" type="button" onClick={() => setTableSearch('')} aria-label="清空搜索">
                  清空
                </button>
              ) : null}
            </div>

            <div className="tableWrap" role="table" aria-label="工具表单">
              <div className="tableHeader" role="row">
                <div className="th" role="columnheader">
                  名称
                </div>
                <div className="th" role="columnheader">
                  简介
                </div>
                <div className="th" role="columnheader">
                  速览
                </div>
              </div>

              {filteredTools.map((tool) => {
                const link = safeUrl(tool.url)
                const guideLink = tool.guide_markdown ? safeUrl(tool.guide_markdown) : ''
                return (
                  <div key={`row:${tool.name}`} className="tableRow" role="row">
                    <div className="td truncate" role="cell" title={tool.name}>
                      {link ? (
                        <a className="link" href={link} target="_blank" rel="noreferrer">
                          {tool.name}
                        </a>
                      ) : (
                        tool.name
                      )}
                    </div>
                    <div className="td truncate" role="cell" title={tool.tldr ?? ''}>
                      {tool.tldr ?? '—'}
                    </div>
                    <div className="td" role="cell">
                      {guideLink ? (
                        <a className="link" href={guideLink} target="_blank" rel="noreferrer">
                          打开
                        </a>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </div>
                  </div>
                )
              })}

              {loadState.status === 'loaded' && filteredTools.length === 0 ? (
                <div className="muted" style={{ padding: 12 }}>
                  无匹配结果
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
