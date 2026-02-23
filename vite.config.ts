import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

type EnvMap = Record<string, string | undefined>

function getRuntimeEnv(): EnvMap {
  const scopedGlobal = globalThis as { process?: { env?: EnvMap } }
  return scopedGlobal.process?.env ?? {}
}

function resolveBasePath() {
  const env = getRuntimeEnv()
  const explicitBase = env.VITE_BASE_PATH
  if (explicitBase) {
    const withLeading = explicitBase.startsWith('/') ? explicitBase : `/${explicitBase}`
    return withLeading.endsWith('/') ? withLeading : `${withLeading}/`
  }

  const repoName = env.GITHUB_REPOSITORY?.split('/')[1]
  if (env.GITHUB_ACTIONS === 'true' && repoName) {
    return `/${repoName}/`
  }

  return '/'
}

export default defineConfig({
  base: resolveBasePath(),
  plugins: [react()],
})
