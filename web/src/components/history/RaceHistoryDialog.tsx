import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import TimelineIcon from '@mui/icons-material/Timeline'
import StarIcon from '@mui/icons-material/Star'
import { useQuery } from '@tanstack/react-query'
import { fetchRaces } from '@/services/api'
import { BADGE_ICON } from '@/constants/ui'
import { monthHalfLabel, dateKeysForYear, toDateKey } from '@/utils/race'
import type { RunRecord, RaceAttempt, TurnLogEntry } from '@/services/historyApi'
import { useCharactersData, getGoalForDateKey } from '@/hooks/useCharactersData'

const surfaceColor: Record<string, string> = { Turf: '#2e7d32', Dirt: '#bf8f4a', Varies: '#757575' }

const actionLabel: Record<string, string> = {
  to_training: 'Train',
  to_race: 'Race',
  to_rest: 'Rest',
  to_recreation: 'Recreatn',
  raced: 'Raced',
  rested: 'Rested',
  infirmary: 'Infirm',
  continue: 'Wait',
  training_ready: 'Train\u2713',
}

const actionColor: Record<string, string> = {
  to_training: '#4caf50',
  to_race: '#2196f3',
  to_rest: '#ff9800',
  to_recreation: '#9c27b0',
  raced: '#1565c0',
  rested: '#e65100',
  infirmary: '#f44336',
  continue: '#757575',
  training_ready: '#66bb6a',
}

type TurnCard = {
  turn: number
  date_key: string
  action: string
  training_type?: string
  reason?: string
  stats?: Record<string, number>
  energy?: number
  mood?: string
  skill_pts?: number
  race?: RaceAttempt | null
  entry: TurnLogEntry
}

function parseDateKeySafe(dateKey?: string | null): { year: number; month: number | null; half: number | null } {
  if (!dateKey) return { year: 1, month: null, half: null }
  const parts = dateKey.split('-')
  const year = Number.parseInt((parts[0] || 'Y1').slice(1), 10) || 1
  const month = parts[1] ? Number.parseInt(parts[1], 10) : Number.NaN
  const half = parts[2] ? Number.parseInt(parts[2], 10) : Number.NaN
  return {
    year,
    month: Number.isFinite(month) ? month : null,
    half: Number.isFinite(half) ? half : null,
  }
}

function imgEncoded(path: string | undefined): string {
  return path ? path.replace(/ /g, '%20') : ''
}

function normalizeAction(action: string): string {
  return action.toLowerCase()
}

export default function RaceHistoryDialog({
  open,
  record,
  onClose,
}: {
  open: boolean
  record: RunRecord | null
  onClose: () => void
}) {
  const { data: races = {} } = useQuery({ queryKey: ['races'], queryFn: fetchRaces, enabled: open })
  const { data: charIndex } = useCharactersData()
  const charEntry = useMemo(() => {
    if (!charIndex) return undefined
    if (record?.char_id) return charIndex[String(record.char_id)]
    const name = record?.uma_name?.split(' / ').pop()
    if (name) return Object.values(charIndex).find((c) => c.name_en === name || c.name_jp === name)
    return undefined
  }, [charIndex, record])
  const goals = charEntry?.goals

  const [activeYearTab, setActiveYearTab] = useState<1 | 2 | 3>(1)
  const contentRef = useRef<HTMLDivElement>(null)
  const scrollPosRef = useRef(0)

  useEffect(() => {
    if (open) setActiveYearTab(1)
  }, [open, record?.id])

  const handleScroll = () => {
    if (contentRef.current) {
      scrollPosRef.current = contentRef.current.scrollTop
    }
  }

  useEffect(() => {
    if (open && contentRef.current) {
      contentRef.current.scrollTop = scrollPosRef.current
    }
  })

  const lookupRace = (name: string): { banner?: string; rank?: string; surface?: string; distance?: string; location?: string } => {
    for (const [raceName, arr] of Object.entries(races)) {
      if (raceName === name && arr.length > 0) {
        const inst = arr[0]
        return {
          banner: inst.public_banner_path,
          rank: inst.rank,
          surface: inst.surface,
          distance: inst.distance_category,
          location: inst.location,
        }
      }
    }
    return {}
  }

  const cards = useMemo(() => {
    if (!record) return [] as TurnCard[]

    const attemptsByKey = new Map<string, RaceAttempt>()
    for (const attempt of record.races_attempted ?? []) {
      if (attempt.turn == null || !attempt.date_key) continue
      attemptsByKey.set(`${attempt.turn}::${attempt.date_key}`, attempt)
    }

    const items: TurnCard[] = []
    const seen = new Set<string>()

    for (const entry of record.turn_log ?? []) {
      const key = `${entry.turn}::${entry.date_key}`
      const existingIndex = items.findIndex((item) => `${item.turn}::${item.date_key}` === key)
      const race = attemptsByKey.get(key) ?? null

      if (existingIndex >= 0) {
        const current = items[existingIndex]
        items[existingIndex] = {
          ...current,
          race: current.race ?? race,
          action: current.action || entry.action,
          training_type: current.training_type ?? entry.training_type,
          reason: current.reason ?? entry.reason,
          stats: current.stats ?? entry.stats,
          energy: current.energy ?? entry.energy,
          mood: current.mood ?? entry.mood,
          skill_pts: current.skill_pts ?? entry.skill_pts,
          entry: current.entry,
        }
      } else {
        items.push({
          turn: entry.turn,
          date_key: entry.date_key,
          action: entry.action,
          training_type: entry.training_type,
          reason: entry.reason,
          stats: entry.stats,
          energy: entry.energy,
          mood: entry.mood,
          skill_pts: entry.skill_pts,
          race,
          entry,
        })
      }
      seen.add(key)
    }

    for (const attempt of record.races_attempted ?? []) {
      if (attempt.turn == null || !attempt.date_key) continue
      const key = `${attempt.turn}::${attempt.date_key}`
      if (seen.has(key)) continue
      items.push({
        turn: attempt.turn,
        date_key: attempt.date_key,
        action: 'to_race',
        race: attempt,
        entry: {
          turn: attempt.turn,
          date_key: attempt.date_key,
          action: 'to_race',
        },
      })
    }

    return items.sort((a, b) => {
      const da = parseDateKeySafe(a.date_key)
      const db = parseDateKeySafe(b.date_key)
      if (da.year !== db.year) return da.year - db.year
      const ma = da.month ?? 99
      const mb = db.month ?? 99
      if (ma !== mb) return ma - mb
      const ha = da.half ?? 99
      const hb = db.half ?? 99
      if (ha !== hb) return ha - hb
      if (a.turn !== b.turn) return a.turn - b.turn
      return a.date_key.localeCompare(b.date_key)
    })
  }, [record])

  const cardsByDateKey = useMemo(() => {
    const map = new Map<string, TurnCard>()
    for (const card of cards) {
      if (!map.has(card.date_key)) map.set(card.date_key, card)
    }
    return map
  }, [cards])

  const yearKeys = useMemo(() => {
    const keys = dateKeysForYear(activeYearTab)
    if (activeYearTab === 1) {
      const early: string[] = []
      for (let m = 1; m <= 5; m++) {
        early.push(toDateKey(1, m, 1))
        early.push(toDateKey(1, m, 2))
      }
      return [...early, ...keys]
    }
    return keys
  }, [activeYearTab])

  if (!record) return null

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography variant="h6" fontWeight={700}>
          Race History - {record.uma_name || record.preset_name}
        </Typography>
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent ref={contentRef} onScroll={handleScroll}>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          <Tabs
            value={activeYearTab}
            onChange={(_, v) => setActiveYearTab(v)}
            variant="fullWidth"
            sx={{ minHeight: 0, '& .MuiTab-root': { minHeight: 36, py: 0.5 } }}
          >
            <Tab label="Junior Year" value={1} />
            <Tab label="Classic Year" value={2} />
            <Tab label="Senior Year" value={3} />
          </Tabs>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, minmax(0, 1fr))',
                md: 'repeat(3, minmax(0, 1fr))',
                lg: 'repeat(4, minmax(0, 1fr))',
              },
              gap: 1,
            }}
          >
            {yearKeys.map((dk) => {
              const card = cardsByDateKey.get(dk)
              const parsed = parseDateKeySafe(dk)
              const dateLabel = parsed.month && parsed.half ? monthHalfLabel(parsed.month, parsed.half) : dk
              const goal = getGoalForDateKey(goals, dk)
              const isGoal = !!goal

              if (!card) {
                const disabled = activeYearTab === 1 && parsed.month != null && parsed.month < 6
                const effectiveOpacity = disabled ? 0.18 : isGoal ? 0.75 : 0.45
                const goalRaceInfo = goal?.race_name ? lookupRace(goal.race_name) : null
                const goalBadge = goalRaceInfo?.rank ? BADGE_ICON[goalRaceInfo.rank] : null
                return (
                  <Paper
                    key={dk}
                    variant="outlined"
                    sx={{
                      p: 1,
                      minHeight: 180,
                      opacity: effectiveOpacity,
                      borderStyle: 'dashed',
                      borderColor: isGoal ? '#ffd700' : undefined,
                      borderWidth: isGoal ? 2 : 1,
                      bgcolor: isGoal
                        ? (theme) => theme.palette.mode === 'dark' ? 'rgba(255,215,0,0.09)' : '#fff8e1'
                        : 'background.paper',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 0.75,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                      <Chip label={dateLabel} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.6rem' }} />
                      {isGoal && (
                        <Chip
                          icon={<StarIcon sx={{ fontSize: 12 }} />}
                          label="Goal"
                          size="small"
                          sx={{ height: 20, fontSize: '0.55rem', bgcolor: '#ffd700', color: '#7c5c00', fontWeight: 700 }}
                        />
                      )}
                    </Box>
                    {goal?.race_name && (
                      <>
                        {goalRaceInfo?.banner && (
                          <Box
                            component="img"
                            src={imgEncoded(goalRaceInfo.banner)}
                            alt=""
                            sx={{ width: '100%', aspectRatio: '2 / 1', objectFit: 'cover', borderRadius: 1 }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                          />
                        )}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                          {goalBadge && <Box component="img" src={goalBadge} alt={goalRaceInfo?.rank} sx={{ height: 16, flexShrink: 0 }} />}
                          <StarIcon sx={{ fontSize: 14, color: '#ffd700', flexShrink: 0 }} />
                          <Typography variant="caption" noWrap sx={{ fontSize: '0.7rem', fontWeight: 600, lineHeight: 1.2 }}>
                            {goal.race_name}
                          </Typography>
                        </Box>
                        {goalRaceInfo && (
                          <Box sx={{ display: 'flex', gap: 0.25, flexWrap: 'wrap' }}>
                            {goalRaceInfo.surface && (
                              <Chip label={goalRaceInfo.surface} size="small" sx={{ height: 16, fontSize: '0.55rem', color: '#fff', bgcolor: surfaceColor[goalRaceInfo.surface] || '#757575' }} />
                            )}
                            {goalRaceInfo.distance && (
                              <Chip label={goalRaceInfo.distance} size="small" variant="outlined" sx={{ height: 16, fontSize: '0.55rem' }} />
                            )}
                          </Box>
                        )}
                      </>
                    )}
                  </Paper>
                )
              }

              const actionKey = normalizeAction(card.action)
              const raceInfo = card.race ? lookupRace(card.race.race_name) : null
              const badge = raceInfo?.rank ? BADGE_ICON[raceInfo.rank] : null
              const raceIsGoal = !!card.race && goals?.some((g) => g.race_name === card.race?.race_name)

              const goalBorderColor = isGoal ? '#ffd700' : undefined
              return (
                <Paper
                  key={`${card.turn}::${card.date_key}`}
                  variant="outlined"
                  sx={{
                    p: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0.75,
                    minHeight: 180,
                    borderColor: goalBorderColor ?? (card.race ? (card.race.won ? 'success.main' : 'error.main') : (actionColor[actionKey] || 'divider')),
                    borderWidth: card.race || isGoal ? 2 : 1,
                    bgcolor: isGoal
                      ? (theme) => theme.palette.mode === 'dark' ? 'rgba(255,215,0,0.09)' : '#fff8e1'
                      : undefined,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                    <Chip label={`Turn ${card.turn}`} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }} />
                    <Chip label={dateLabel} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.6rem' }} />
                    <Chip label={dk} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.55rem', opacity: 0.8 }} />
                    <Chip label={actionLabel[actionKey] || card.action.replace('to_', '')} size="small" icon={<TimelineIcon sx={{ fontSize: 12 }} />} sx={{ height: 20, fontSize: '0.6rem', fontWeight: 600 }} />
                    {card.race && (
                      <Chip label={card.race.won ? 'WIN' : 'LOSS'} size="small" color={card.race.won ? 'success' : 'error'} sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }} />
                    )}
                    {isGoal && (
                      <Chip
                        icon={<StarIcon sx={{ fontSize: 12 }} />}
                        label="Goal"
                        size="small"
                        sx={{ height: 20, fontSize: '0.55rem', bgcolor: '#ffd700', color: '#7c5c00', fontWeight: 700 }}
                      />
                    )}
                  </Box>

                  {card.race ? (
                    <>
                      <Typography variant="body2" fontWeight={700} noWrap sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {raceIsGoal && <StarIcon sx={{ fontSize: 14, color: '#ffd700', flexShrink: 0 }} />}
                        {card.race.race_name}
                      </Typography>

                      {raceInfo?.banner && (
                        <Box
                          component="img"
                          src={imgEncoded(raceInfo.banner)}
                          alt=""
                          sx={{ width: '100%', aspectRatio: '2 / 1', objectFit: 'cover', borderRadius: 1 }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                      )}

                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                        {badge && <Box component="img" src={badge} alt={raceInfo?.rank} sx={{ height: 16 }} />}
                        {raceInfo?.surface && (
                          <Chip label={raceInfo.surface} size="small" sx={{ height: 18, fontSize: '0.6rem', color: '#fff', bgcolor: surfaceColor[raceInfo.surface] || '#757575' }} />
                        )}
                        {raceInfo?.distance && <Chip label={raceInfo.distance} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />}
                        {card.race.fans_after != null && <Chip label={`${card.race.fans_after.toLocaleString()} fans`} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />}
                        {raceInfo?.location && (
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {raceInfo.location}
                          </Typography>
                        )}
                      </Box>

                      {card.reason && (
                        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>
                          {card.reason}
                        </Typography>
                      )}
                    </>
                  ) : (
                    <>
                      <Typography variant="body2" fontWeight={700} noWrap>
                        {card.training_type || actionLabel[actionKey] || 'Turn'}
                      </Typography>

                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {card.stats && ['SPD', 'STA', 'PWR', 'GUTS', 'WIT'].map((k) => (
                          <Chip key={k} label={`${k} ${card.stats?.[k] ?? '—'}`} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.55rem' }} />
                        ))}
                        {card.energy != null && (
                          <Chip label={`Energy ${card.energy}%`} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.55rem' }} />
                        )}
                        {card.mood && card.mood !== 'UNKNOWN' && (
                          <Chip label={card.mood} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.55rem' }} />
                        )}
                        {card.skill_pts != null && (
                          <Chip label={`Pts ${card.skill_pts}`} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.55rem' }} />
                        )}
                      </Box>
                    </>
                  )}

                </Paper>
              )
            })}
          </Box>
        </Stack>
      </DialogContent>
    </Dialog>
  )
}
