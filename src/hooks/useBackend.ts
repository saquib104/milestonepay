/**
 * Frontend API client for the MilestonePay backend.
 *
 * All requests go through the Vite proxy at /api/* → localhost:3001/*.
 * The wallet address is sent in X-Wallet-Address; no auth token is stored
 * in localStorage.
 *
 * Rules:
 *  - Never infer a milestone as paid from an API response alone.
 *  - Always re-read contract state to confirm payment status.
 *  - Show "status unavailable" when the backend is unreachable.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAccount } from 'wagmi'

// ── Types ──────────────────────────────────────────────────────────────────

export interface BackendProject {
  id: number
  agreementId: string
  chainId: number
  title: string
  description: string | null
  termsHash: string
  termsVersion: string | null
  clientAddress: string
  providerAddress: string
  resolverAddress: string | null
  indexedAt: string | null
  createdAt: string
  milestones: BackendMilestoneMeta[]
}

export interface BackendMilestoneMeta {
  milestoneIndex: number
  title: string
  description: string | null
}

export interface SubmissionNote {
  id: number
  milestoneIndex: number
  submitter: string
  deliverableRef: string | null
  deliverableHash: string
  note: string | null
  submittedAt: string
}

export interface DisputeEvidence {
  id: number
  milestoneIndex: number
  submittedBy: string
  evidenceRef: string
  evidenceHash: string | null
  submittedAt: string
}

export interface ChainEvent {
  txHash: string
  logIndex: number
  blockNumber: string
  eventName: string
  milestoneIndex: number | null
  rawData: Record<string, unknown>
  indexedAt: string
}

export interface IndexerStatus {
  lastIndexedBlock: string
  lastIndexedAt: string | null
}

// ── Fetch helper ───────────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  walletAddress: string | undefined,
  options?: RequestInit,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  }
  if (walletAddress) headers['X-Wallet-Address'] = walletAddress

  const res = await fetch(`/api${path}`, { ...options, headers })

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

// ── Refresh counter (trigger re-fetch imperatively) ───────────────────────

function useRefreshCounter() {
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick(t => t + 1), [])
  return { tick, refresh }
}

// ── Hook: backend health ───────────────────────────────────────────────────

export function useBackendHealth() {
  const [status, setStatus] = useState<'unknown' | 'ok' | 'unavailable'>('unknown')

  useEffect(() => {
    let cancelled = false
    fetch('/api/health')
      .then(r => r.ok ? r.json() : Promise.reject(new Error('not ok')))
      .then(() => { if (!cancelled) setStatus('ok') })
      .catch(() => { if (!cancelled) setStatus('unavailable') })
    return () => { cancelled = true }
  }, [])

  return status
}

// ── Hook: create / get project metadata ───────────────────────────────────

export interface CreateProjectInput {
  agreementId: string
  title: string
  description?: string
  termsHash: string
  termsVersion?: string
  clientAddress: string
  providerAddress: string
  resolverAddress?: string
  milestones: { title: string; description?: string }[]
}

export function useProjectMeta(agreementId: string | undefined) {
  const { address } = useAccount()
  const { tick, refresh } = useRefreshCounter()

  const [project, setProject] = useState<BackendProject | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    if (!agreementId || !address) return
    let cancelled = false
    setLoading(true)
    setError(null)
    apiFetch<BackendProject>(`/projects/${agreementId}`, address)
      .then(data => { if (!cancelled) { setProject(data); setLoading(false) } })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError((err as Error).message)
          setProject(null)
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agreementId, address, tick])

  const createProject = useCallback(async (input: CreateProjectInput): Promise<number> => {
    if (!address) throw new Error('Wallet not connected')
    const result = await apiFetch<{ ok: boolean; projectId: number }>(
      '/projects',
      address,
      { method: 'POST', body: JSON.stringify(input) },
    )
    refresh()
    return result.projectId
  }, [address, refresh])

  return { project, loading, error, refetch: refresh, createProject }
}

// ── Hook: list projects for connected wallet ───────────────────────────────

export function useMyProjects() {
  const { address } = useAccount()
  const { tick, refresh } = useRefreshCounter()

  const [projects, setProjects] = useState<BackendProject[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    if (!address) return
    let cancelled = false
    setLoading(true)
    setError(null)
    apiFetch<BackendProject[]>(`/projects/wallet/${address}`, address)
      .then(data => { if (!cancelled) { setProjects(data); setLoading(false) } })
      .catch((err: unknown) => {
        if (!cancelled) { setError((err as Error).message); setLoading(false) }
      })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, tick])

  return { projects, loading, error, refetch: refresh }
}

// ── Hook: submission notes for a milestone ─────────────────────────────────

export function useSubmissionNotes(
  agreementId: string | undefined,
  milestoneIndex: number | undefined,
) {
  const { address } = useAccount()
  const { tick, refresh } = useRefreshCounter()

  const [notes, setNotes]     = useState<SubmissionNote[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    if (!agreementId || milestoneIndex === undefined || !address) return
    let cancelled = false
    setLoading(true)
    setError(null)
    apiFetch<SubmissionNote[]>(`/projects/${agreementId}/notes/${milestoneIndex}`, address)
      .then(data => { if (!cancelled) { setNotes(data); setLoading(false) } })
      .catch((err: unknown) => {
        if (!cancelled) { setError((err as Error).message); setLoading(false) }
      })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agreementId, milestoneIndex, address, tick])

  const addNote = useCallback(async (params: {
    milestoneIndex: number
    deliverableHash: string
    deliverableRef?: string
    note?: string
  }): Promise<void> => {
    if (!agreementId || !address) throw new Error('Wallet not connected')
    await apiFetch(
      `/projects/${agreementId}/notes`,
      address,
      { method: 'POST', body: JSON.stringify(params) },
    )
    refresh()
  }, [agreementId, address, refresh])

  return { notes, loading, error, refetch: refresh, addNote }
}

// ── Hook: dispute evidence ─────────────────────────────────────────────────

export function useDisputeEvidence(
  agreementId: string | undefined,
  milestoneIndex: number | undefined,
) {
  const { address } = useAccount()
  const { tick, refresh } = useRefreshCounter()

  const [evidence, setEvidence] = useState<DisputeEvidence[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    if (!agreementId || milestoneIndex === undefined || !address) return
    let cancelled = false
    setLoading(true)
    setError(null)
    apiFetch<DisputeEvidence[]>(`/projects/${agreementId}/evidence/${milestoneIndex}`, address)
      .then(data => { if (!cancelled) { setEvidence(data); setLoading(false) } })
      .catch((err: unknown) => {
        if (!cancelled) { setError((err as Error).message); setLoading(false) }
      })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agreementId, milestoneIndex, address, tick])

  const addEvidence = useCallback(async (params: {
    milestoneIndex: number
    evidenceRef: string
    evidenceHash?: string
  }): Promise<void> => {
    if (!agreementId || !address) throw new Error('Wallet not connected')
    await apiFetch(
      `/projects/${agreementId}/evidence`,
      address,
      { method: 'POST', body: JSON.stringify(params) },
    )
    refresh()
  }, [agreementId, address, refresh])

  return { evidence, loading, error, refetch: refresh, addEvidence }
}

// ── Hook: indexed chain events ─────────────────────────────────────────────

export function useChainEvents(agreementId: string | undefined) {
  const { address } = useAccount()
  const { tick, refresh } = useRefreshCounter()

  const [events, setEvents]           = useState<ChainEvent[]>([])
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    if (!agreementId || !address) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setUnavailable(false)
    apiFetch<ChainEvent[]>(`/events/${agreementId}`, address)
      .then(data => {
        if (!cancelled) { setEvents(data); setLoading(false) }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg = (err as Error).message
          if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
            setUnavailable(true)
          } else {
            setError(msg)
          }
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agreementId, address, tick])

  return { events, loading, error, unavailable, refetch: refresh }
}

// ── Hook: indexer status ───────────────────────────────────────────────────

export function useIndexerStatus() {
  const [status, setStatus]           = useState<IndexerStatus | null>(null)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/indexer/status')
      .then(r => r.ok ? r.json() as Promise<IndexerStatus> : Promise.reject(new Error('not ok')))
      .then(data => { if (!cancelled) setStatus(data) })
      .catch(() => { if (!cancelled) setUnavailable(true) })
    return () => { cancelled = true }
  }, [])

  return { status, unavailable }
}

// ── Hook: user profile ─────────────────────────────────────────────────────

export interface UserProfile {
  walletAddress: string
  displayName: string | null
  notifyOnEvents: boolean
  createdAt: string
}

export function useUserProfile() {
  const { address } = useAccount()
  const { tick, refresh } = useRefreshCounter()

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (!address) return
    let cancelled = false
    loadedRef.current = false
    setLoading(true)
    apiFetch<UserProfile>(`/users/${address}`, address)
      .then(data => {
        if (!cancelled) { setProfile(data); setLoading(false); loadedRef.current = true }
      })
      .catch(() => {
        if (!cancelled) { setProfile(null); setLoading(false); loadedRef.current = true }
      })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, tick])

  const saveProfile = useCallback(async (params: {
    displayName?: string
    notifyOnEvents?: boolean
  }): Promise<void> => {
    if (!address) throw new Error('Wallet not connected')
    await apiFetch(
      `/users/${address}`,
      address,
      { method: 'PUT', body: JSON.stringify(params) },
    )
    refresh()
  }, [address, refresh])

  const requestDeletion = useCallback(async (): Promise<string> => {
    if (!address) throw new Error('Wallet not connected')
    const result = await apiFetch<{ ok: boolean; message: string }>(
      `/users/${address}`,
      address,
      { method: 'DELETE' },
    )
    return result.message
  }, [address])

  return { profile, loading, refetch: refresh, saveProfile, requestDeletion }
}
