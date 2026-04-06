/**
 * Fetches current GitHub repo stats and updates article components.
 * Matches GitHubRepoBadge component props: stars="X" forks="Y"
 * Runs as part of the build pipeline.
 *
 * Usage: npx tsx scripts/update-github-stats.ts
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface RepoConfig {
  owner: string
  repo: string
  /** File containing the GitHubRepoBadge component usage */
  file: string
  label: string
}

const REPOS: RepoConfig[] = [
  { owner: 'santifer', repo: 'career-ops', file: 'src/CareerOps.tsx', label: 'career-ops' },
  { owner: 'santifer', repo: 'jacobo-workflows', file: 'src/JacoboAgent.tsx', label: 'jacobo-workflows' },
]

function formatCount(n: number): string {
  if (n >= 1000) {
    const k = n / 1000
    return k % 1 === 0 ? `${k}K` : `${k.toFixed(1)}K`
  }
  return String(n)
}

async function fetchGitHubStats(owner: string, repo: string): Promise<{ stars: number; forks: number } | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        'User-Agent': 'santifer-build/1.0',
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
    })
    if (!res.ok) {
      console.warn(`  ⚠ GitHub API returned ${res.status} for ${owner}/${repo}`)
      return null
    }
    const data = await res.json()
    return { stars: data.stargazers_count, forks: data.forks_count }
  } catch (err) {
    console.warn(`  ⚠ GitHub fetch failed:`, (err as Error).message)
    return null
  }
}

async function main() {
  console.log('⭐ Updating GitHub stats...\n')

  let anyChanged = false

  for (const repo of REPOS) {
    const filePath = resolve(__dirname, '..', repo.file)
    let content: string
    try {
      content = readFileSync(filePath, 'utf-8')
    } catch {
      console.log(`  ⏭ ${repo.label}: file not found (${repo.file})`)
      continue
    }

    // Check if this file has a GitHubRepoBadge for this repo
    const repoPattern = `repo="${repo.owner}/${repo.repo}"`
    if (!content.includes(repoPattern)) {
      console.log(`  ⏭ ${repo.label}: no GitHubRepoBadge found in ${repo.file}`)
      continue
    }

    const stats = await fetchGitHubStats(repo.owner, repo.repo)
    if (!stats) {
      console.log(`  ⏭ ${repo.label}: skipped (fetch failed)`)
      continue
    }

    const starsFormatted = formatCount(stats.stars)
    const forksFormatted = formatCount(stats.forks)

    // Match: GitHubRepoBadge repo="owner/repo" stars="X" forks="Y"
    const badgeRegex = new RegExp(
      `(repo="${repo.owner}/${repo.repo}"\\s+stars=")[^"]+("\\s+forks=")[^"]+(")`,
    )

    const newContent = content.replace(badgeRegex, `$1${starsFormatted}$2${forksFormatted}$3`)

    if (newContent !== content) {
      writeFileSync(filePath, newContent, 'utf-8')
      anyChanged = true
      console.log(`  ✓ ${repo.label}: ${starsFormatted} stars, ${forksFormatted} forks`)
    } else {
      console.log(`  ⏭ ${repo.label}: no changes (${starsFormatted} stars, ${forksFormatted} forks)`)
    }
  }

  if (anyChanged) {
    console.log('\n✅ GitHub stats updated')
  } else {
    console.log('\n⏭ No changes needed')
  }
}

main()
