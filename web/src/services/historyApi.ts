export interface RaceAttempt {
  race_name: string
  won: boolean
  timestamp: string
  turn?: number
  date_key?: string
  fans_before?: number
  fans_after?: number
}

export interface ActivePeriod {
  start_time: string
  stop_time: string | null
}

export interface TurnLogEntry {
  turn: number
  date_key: string
  action: string
  training_type?: string
  reason?: string
  stats?: Record<string, number>
  energy?: number
  mood?: string
  skill_pts?: number
  // Race outcome fields (set on to_race/raced entries)
  race_name?: string
  won?: boolean
  fans_before?: number
  fans_after?: number
}

export interface RunDetail {
  turn_log: TurnLogEntry[]
  active_periods: ActivePeriod[]
}

export interface RunRecord {
  id: string
  scenario: string
  preset_name: string
  uma_name: string | null
  start_date: string
  start_time: string
  active_seconds?: number
  end_time: string | null
  final_turn: number | null
  final_stats: Record<string, number> | null
  final_mood: string | null
  final_fans: number | null
  final_rank: string | null
  completed: boolean
  error: string | null
  races_attempted: RaceAttempt[]
  // Precomputed counts (derived from turn_log at write time)
  race_count?: number
  training_count?: number
  rest_count?: number
  recreation_count?: number
  char_id?: number | null
}

export async function fetchHistory(): Promise<RunRecord[]> {
  const res = await fetch('/api/history', { cache: 'no-store' })
  if (!res.ok) throw new Error('Failed to load history')
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

export async function deleteHistory(recordId: string): Promise<void> {
  const res = await fetch(`/api/history/${encodeURIComponent(recordId)}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete history record')
}

export async function fetchHistoryDetail(recordId: string): Promise<RunDetail> {
  const res = await fetch(`/api/history/${encodeURIComponent(recordId)}/detail`, { cache: 'no-store' })
  if (!res.ok) throw new Error('Failed to load history detail')
  return res.json()
}

export async function fetchIncompleteHistory(): Promise<RunRecord[]> {
  const res = await fetch('/api/history/incomplete', { cache: 'no-store' })
  if (!res.ok) throw new Error('Failed to fetch incomplete history')
  const data = await res.json()
  return Array.isArray(data) ? data : []
}
