export interface RaceAttempt {
  race_name: string
  won: boolean
  timestamp: string
}

export interface RunRecord {
  id: string
  scenario: string
  preset_name: string
  uma_name: string | null
  start_date: string
  start_time: string
  end_time: string | null
  final_turn: number | null
  final_stats: Record<string, number> | null
  final_mood: string | null
  final_fans: number | null
  final_rank: string | null
  completed: boolean
  error: string | null
  races_attempted: RaceAttempt[]
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
