import { useQuery } from '@tanstack/react-query'
import { fetchCharacters } from '@/services/api'
import type { CharacterEntry, CharacterGoal } from '@/models/datasets'

export function useCharactersData() {
  return useQuery({
    queryKey: ['characters'],
    queryFn: fetchCharacters,
    staleTime: 5 * 60 * 1000,
  })
}

export function getCharEntry(
  index: Record<string, CharacterEntry> | undefined,
  charId: number | undefined | null,
): CharacterEntry | undefined {
  if (!index || !charId) return undefined
  return index[String(charId)]
}

export function getGoals(
  index: Record<string, CharacterEntry> | undefined,
  charId: number | undefined | null,
): CharacterGoal[] | undefined {
  return getCharEntry(index, charId)?.goals
}

export function getGoalForDateKey(
  goals: CharacterGoal[] | undefined,
  dateKey: string,
): CharacterGoal | undefined {
  if (!goals) return undefined
  return goals.find((g) => {
    const dk = `Y${g.year}-${String(g.month).padStart(2, '0')}-${g.day}`
    return dk === dateKey
  })
}

export function isGoalRace(
  goals: CharacterGoal[] | undefined,
  raceName: string,
): boolean {
  if (!goals) return false
  return goals.some((g) => g.race_name === raceName)
}

export function findCharByName(
  index: Record<string, CharacterEntry> | undefined,
  name: string,
): CharacterEntry | undefined {
  if (!index || !name) return undefined
  const lower = name.toLowerCase()
  return Object.values(index).find((e) => {
    const en = e.name_en.toLowerCase()
    return lower === en || lower.startsWith(en + ' ')
  })
}
