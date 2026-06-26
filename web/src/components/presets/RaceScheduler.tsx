import {
  Box,
  Paper,
  Stack,
  TextField,
  Typography,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  Checkbox,
  FormControlLabel,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Tabs,
  Tab,
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import SearchIcon from '@mui/icons-material/Search'
import ClearIcon from '@mui/icons-material/Clear'
import ChevronLeft from '@mui/icons-material/ChevronLeft'
import ChevronRight from '@mui/icons-material/ChevronRight'
import CloseIcon from '@mui/icons-material/Close'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { fetchRaces } from '@/services/api'
import type { RacesMap, RaceInstance } from '@/models/datasets'
import { toDateKey, parseDateKey, monthHalfLabel, yearLabel, dateKeysForYear, nextDateKey } from '@/utils/race'
import { useConfigStore } from '@/store/configStore'
import { BADGE_ICON } from '@/constants/ui'

type RaceRow = { raceName: string; instance: RaceInstance; dateKey: string }

const surfaceColor: Record<string, string> = { Turf: '#2e7d32', Dirt: '#bf8f4a', Varies: '#757575' }

function imgEncoded(path: string | undefined): string {
  return path ? path.replace(/ /g, '%20') : ''
}

export default function RaceScheduler({ presetId }: { presetId: string; compact?: boolean }) {
  const preset = useConfigStore((s) => s.getSelectedPreset().preset)
  const patchPreset = useConfigStore((s) => s.patchPreset)
  const { data: races = {} as RacesMap } = useQuery({ queryKey: ['races'], queryFn: fetchRaces })

  const [activeYearTab, setActiveYearTab] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogDateKey, setDialogDateKey] = useState('')
  const [dialogMonth, setDialogMonth] = useState(1)
  const [dialogHalf, setDialogHalf] = useState(1)
  const [dialogSearch, setDialogSearch] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [autoAdvance, setAutoAdvance] = useState(true)

  if (!preset) return null

  const flat: RaceRow[] = useMemo(() => {
    const out: RaceRow[] = []
    for (const [name, arr] of Object.entries(races)) {
      for (const inst of arr) {
        out.push({ raceName: name, instance: inst, dateKey: toDateKey(inst.year_int, inst.month, inst.day) })
      }
    }
    return out
  }, [races])

  const racesByDateKey = useMemo(() => {
    const map = new Map<string, RaceRow[]>()
    for (const r of flat) {
      const existing = map.get(r.dateKey)
      if (existing) existing.push(r)
      else map.set(r.dateKey, [r])
    }
    return map
  }, [flat])

  const instanceByDateKeyName = useMemo(() => {
    const map = new Map<string, RaceInstance>()
    for (const r of flat) {
      map.set(`${r.dateKey}::${r.raceName}`, r.instance)
    }
    return map
  }, [flat])

  const allDateKeys = useMemo(() => dateKeysForYear(1).concat(dateKeysForYear(2)).concat(dateKeysForYear(3)), [])

  const searchResults = useMemo(() => {
    const x = searchQuery.trim().toLowerCase()
    if (!x) return []
    return flat.filter(r =>
      r.raceName.toLowerCase().includes(x) ||
      r.instance.location?.toLowerCase().includes(x) ||
      r.instance.rank.toLowerCase().includes(x) ||
      r.instance.distance_category.toLowerCase().includes(x) ||
      r.instance.surface?.toLowerCase().includes(x)
    ).slice(0, 200)
  }, [flat, searchQuery])

  const dialogRaceName = dialogDateKey ? preset.plannedRaces[dialogDateKey] : undefined
  const dialogTentative = dialogDateKey ? !!preset.plannedRacesTentative?.[dialogDateKey] : false

  const availableForDate = useMemo(() => {
    if (!dialogDateKey) return []
    return racesByDateKey.get(dialogDateKey) ?? []
  }, [racesByDateKey, dialogDateKey])

  const dialogFiltered = useMemo(() => {
    const x = dialogSearch.trim().toLowerCase()
    if (!x) return availableForDate
    return flat.filter(r =>
      r.raceName.toLowerCase().includes(x) ||
      r.instance.location?.toLowerCase().includes(x) ||
      r.instance.rank.toLowerCase().includes(x) ||
      r.instance.distance_category.toLowerCase().includes(x) ||
      r.instance.surface?.toLowerCase().includes(x)
    ).slice(0, 300)
  }, [flat, dialogSearch, availableForDate])

  const removeRace = (dateKey: string) => {
    const next = { ...preset.plannedRaces }
    delete next[dateKey]
    patchPreset(presetId, 'plannedRaces', next)
  }

  const handleQuickAdd = (row: RaceRow) => {
    patchPreset(presetId, 'plannedRaces', { ...preset.plannedRaces, [row.dateKey]: row.raceName })
    setSearchQuery('')
  }

  const handleCellClick = (year: number, month: number, half: number) => {
    setDialogMonth(month)
    setDialogHalf(half)
    setDialogDateKey(toDateKey(year, month, half))
    setDialogSearch('')
    setDialogOpen(true)
    if (year !== activeYearTab) setActiveYearTab(year)
  }

  const navigateToDate = (dk: string) => {
    const { year, month, half } = parseDateKey(dk)
    setDialogDateKey(dk)
    setDialogMonth(month)
    setDialogHalf(half)
    setDialogSearch('')
    if (year !== activeYearTab) setActiveYearTab(year)
  }

  const handleSelectRace = (row: RaceRow) => {
    patchPreset(presetId, 'plannedRaces', { ...preset.plannedRaces, [dialogDateKey]: row.raceName })
    if (autoAdvance) {
      const next = nextDateKey(dialogDateKey, allDateKeys)
      if (next) {
        navigateToDate(next)
      }
    }
  }

  const handleRemoveFromDialog = () => {
    if (dialogDateKey) removeRace(dialogDateKey)
  }

  const handleToggleTentative = () => {
    if (dialogDateKey) {
      const next = { ...(preset.plannedRacesTentative ?? {}) }
      if (next[dialogDateKey]) delete next[dialogDateKey]
      else next[dialogDateKey] = true
      patchPreset(presetId, 'plannedRacesTentative', Object.keys(next).length ? next : {})
    }
  }

  const currentIdx = allDateKeys.indexOf(dialogDateKey)
  const canGoPrev = currentIdx > 0
  const canGoNext = currentIdx >= 0 && currentIdx < allDateKeys.length - 1

  const getSelectedRace = (dk: string): { name: string; tentative: boolean } | null => {
    const name = preset.plannedRaces[dk]
    if (!name) return null
    return { name, tentative: !!preset.plannedRacesTentative?.[dk] }
  }

  const renderCard = (dk: string) => {
    const { year, month, half } = parseDateKey(dk)
    const selected = getSelectedRace(dk)
    const inst = selected ? instanceByDateKeyName.get(`${dk}::${selected.name}`) : null
    const isBeforeJune = year === 1 && month < 6
    const isDisabled = isBeforeJune
    const badge = inst ? BADGE_ICON[inst.rank] : null

    return (
      <Box key={dk} sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, width: '100%', minWidth: 0 }}>
        <Paper
          onClick={() => !isDisabled && handleCellClick(year, month, half)}
          sx={{
            width: '100%',
            minHeight: 180,
            p: 1,
            cursor: isDisabled ? 'default' : 'pointer',
            opacity: isDisabled ? 0.25 : 1,
            bgcolor: selected?.tentative ? 'warning.dark' : selected ? 'primary.dark' : 'background.paper',
            border: selected ? 2 : 1,
            borderColor: selected ? 'primary.main' : 'divider',
            display: 'flex',
            flexDirection: 'column',
            gap: 0.75,
            transition: 'border-color 120ms ease, transform 120ms ease',
            '&:hover': isDisabled ? {} : {
              borderColor: selected ? 'primary.light' : 'text.secondary',
              transform: 'translateY(-1px)',
            },
          }}
        >
          {selected && inst ? (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5, minWidth: 0 }}>
                <Chip
                  label={monthHalfLabel(month, half)}
                  size="small"
                  variant="outlined"
                  sx={{ height: 20, fontSize: '0.6rem', flexShrink: 0 }}
                />
                <Chip
                  label={selected.tentative ? 'Tentative' : 'Planned'}
                  size="small"
                  color={selected.tentative ? 'warning' : 'primary'}
                  sx={{ height: 20, fontSize: '0.6rem', fontWeight: 700, flexShrink: 0 }}
                />
              </Box>
              {inst.public_banner_path && (
                <Box
                  component="img"
                  src={imgEncoded(inst.public_banner_path)}
                  alt=""
                  sx={{
                    width: '100%',
                    aspectRatio: '2 / 1',
                    objectFit: 'cover',
                    borderRadius: '3px 3px 0 0',
                    flexShrink: 0,
                    display: 'block',
                  }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              )}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                {badge && (
                  <Box component="img" src={badge} alt={inst.rank} sx={{ height: 16, flexShrink: 0 }} />
                )}
                <Typography variant="caption" noWrap sx={{ fontSize: '0.7rem', fontWeight: 600, lineHeight: 1.2 }}>
                  {selected.name}
                </Typography>
                {selected.tentative && (
                  <Chip size="small" label="?" variant="outlined" sx={{ height: 14, fontSize: '0.5rem', flexShrink: 0 }} />
                )}
              </Box>
              <Box sx={{ display: 'flex', gap: 0.25, flexWrap: 'wrap' }}>
                <Chip
                  size="small"
                  label={inst.surface}
                  sx={{
                    height: 16,
                    fontSize: '0.55rem',
                    bgcolor: surfaceColor[inst.surface] ?? '#757575',
                    color: '#fff',
                  }}
                />
                <Chip
                  size="small"
                  label={inst.distance_category}
                  variant="outlined"
                  sx={{ height: 16, fontSize: '0.55rem' }}
                />
              </Box>
              <Typography variant="caption" noWrap sx={{ fontSize: '0.6rem', color: 'text.secondary', lineHeight: 1.1 }}>
                {inst.location ? `${inst.location} — ` : ''}{inst.distance_text}
              </Typography>
            </>
          ) : !isDisabled ? (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5 }}>
                <Chip
                  label={monthHalfLabel(month, half)}
                  size="small"
                  variant="outlined"
                  sx={{ height: 20, fontSize: '0.6rem', flexShrink: 0 }}
                />
                <Chip
                  label="Add race"
                  size="small"
                  variant="outlined"
                  sx={{ height: 20, fontSize: '0.6rem', fontWeight: 700, flexShrink: 0 }}
                />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 90 }}>
                <Typography variant="body1" sx={{ color: 'text.disabled', fontSize: '1.2rem', lineHeight: 1 }}>
                  +
                </Typography>
              </Box>
            </>
          ) : null}
        </Paper>
        <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.secondary', whiteSpace: 'nowrap' }}>
          {monthHalfLabel(month, half)}
        </Typography>
      </Box>
    )
  }

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

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack spacing={1}>
        <Typography variant="subtitle2">Race Scheduler</Typography>

        <TextField
          size="small"
          fullWidth
          placeholder="Search by race name, location, rank, distance..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          slotProps={{
            input: {
              startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
              endAdornment: searchQuery ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearchQuery('')}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            },
          }}
        />

        {searchQuery.trim() ? (
          <Paper variant="outlined" sx={{ overflow: 'auto' }}>
            <Typography variant="caption" color="text.secondary" sx={{ p: 1, display: 'block' }}>
              {searchResults.length} results — click to add
            </Typography>
            <List disablePadding>
              {searchResults.map((r) => {
                const badge = BADGE_ICON[r.instance.rank] || null
                const alreadyPlanned = !!preset.plannedRaces[r.dateKey]
                return (
                  <ListItemButton
                    key={`${r.dateKey}-${r.raceName}`}
                    onClick={() => handleQuickAdd(r)}
                    sx={{ gap: 1.5, py: 1.5 }}
                  >
                    <Box
                      component="img"
                      src={imgEncoded(r.instance.public_banner_path)}
                      alt=""
                      sx={{ width: 80, display: 'block', borderRadius: 1, flexShrink: 0 }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <span>{r.raceName}</span>
                          {badge && <Box component="img" src={badge} alt={r.instance.rank} sx={{ height: 18 }} />}
                          <Chip
                            size="small"
                            label={r.instance.surface}
                            sx={{
                              height: 18,
                              fontSize: '0.6rem',
                              bgcolor: surfaceColor[r.instance.surface] ?? '#757575',
                              color: '#fff',
                            }}
                          />
                          <Chip
                            size="small"
                            label={r.instance.distance_category}
                            variant="outlined"
                            sx={{ height: 18, fontSize: '0.6rem' }}
                          />
                        </Box>
                      }
                      secondary={`${r.instance.year_label} — ${r.instance.date_text} — ${r.instance.location ?? ''} — ${r.instance.distance_text}`}
                    />
                    <Chip
                      size="small"
                      label={r.dateKey}
                      variant={alreadyPlanned ? 'filled' : 'outlined'}
                      color={alreadyPlanned ? 'primary' : 'default'}
                      sx={{ fontSize: '0.65rem', flexShrink: 0 }}
                    />
                    {alreadyPlanned && <Chip size="small" label="Added" color="success" sx={{ fontSize: '0.6rem', flexShrink: 0 }} />}
                  </ListItemButton>
                )
              })}
              {!searchResults.length && (
                <Typography variant="caption" color="text.secondary" sx={{ p: 1, display: 'block' }}>
                  No races match your search.
                </Typography>
              )}
            </List>
          </Paper>
        ) : (
          <>
            <Tabs
              value={activeYearTab}
              onChange={(_, v) => setActiveYearTab(v)}
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
              {yearKeys.map(renderCard)}
            </Box>
          </>
        )}
      </Stack>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <IconButton size="small" disabled={!canGoPrev} onClick={() => navigateToDate(allDateKeys[currentIdx - 1])}>
              <ChevronLeft fontSize="small" />
            </IconButton>
            <Typography variant="body1" sx={{ flex: 1, textAlign: 'center', fontWeight: 600 }}>
              {dialogRaceName
                ? `Change — ${yearLabel(parseDateKey(dialogDateKey).year)}, ${monthHalfLabel(dialogMonth, dialogHalf)}`
                : `Select Race — ${yearLabel(parseDateKey(dialogDateKey).year)}, ${monthHalfLabel(dialogMonth, dialogHalf)}`}
            </Typography>
            <IconButton size="small" disabled={!canGoNext} onClick={() => navigateToDate(allDateKeys[currentIdx + 1])}>
              <ChevronRight fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={() => setDialogOpen(false)}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent sx={{ pt: 1 }}>
          {dialogRaceName && (() => {
            const current = flat.find(r => r.dateKey === dialogDateKey && r.raceName === dialogRaceName)
            return (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  mb: 2,
                  p: 1,
                  borderRadius: 1,
                  bgcolor: 'action.selected',
                }}
              >
                {current && (
                  <Box
                    component="img"
                    src={imgEncoded(current.instance.public_banner_path)}
                    alt=""
                    sx={{ width: 96, display: 'block', borderRadius: 1, flexShrink: 0 }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                )}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2">
                    Current: <strong>{dialogRaceName}</strong>
                  </Typography>
                  {current && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25, flexWrap: 'wrap' }}>
                      <Chip size="small" label={current.instance.surface} sx={{ height: 16, fontSize: '0.55rem', bgcolor: surfaceColor[current.instance.surface] ?? '#757575', color: '#fff' }} />
                      <Chip size="small" label={current.instance.distance_category} variant="outlined" sx={{ height: 16, fontSize: '0.55rem' }} />
                      <Typography variant="caption" color="text.secondary">{current.instance.location} — {current.instance.distance_text}</Typography>
                    </Box>
                  )}
                </Box>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={dialogTentative}
                      onChange={handleToggleTentative}
                    />
                  }
                  label={<Typography variant="caption">Tentative</Typography>}
                  sx={{ m: 0 }}
                />
                <IconButton size="small" color="error" onClick={handleRemoveFromDialog}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            )
          })()}

          {!availableForDate.length && !dialogSearch.trim() && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              No races found in the dataset for this turn. Search below to find any race.
            </Typography>
          )}

          <TextField
            size="small"
            fullWidth
            placeholder="Search all races by name, location, rank, distance..."
            value={dialogSearch}
            onChange={(e) => setDialogSearch(e.target.value)}
            slotProps={{ input: { startAdornment: <SearchIcon sx={{ mr: 1, fontSize: 18 }} /> as any } }}
            sx={{ mb: 1 }}
          />

          {availableForDate.length > 0 && !dialogSearch.trim() && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Races available at this turn:
            </Typography>
          )}

          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={autoAdvance}
                onChange={(e) => setAutoAdvance(e.target.checked)}
              />
            }
            label={<Typography variant="caption">Auto-advance to next turn after selecting</Typography>}
            sx={{ mb: 0.5 }}
          />

          <Box sx={{ maxHeight: 320, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {dialogFiltered.map((r) => {
              const badge = BADGE_ICON[r.instance.rank] || null
              return (
                <Box
                  key={`${r.dateKey}-${r.raceName}`}
                  onClick={() => handleSelectRace(r)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      p: 1.5,
                    borderRadius: 1,
                    cursor: 'pointer',
                    bgcolor: r.dateKey === dialogDateKey && dialogRaceName === r.raceName ? 'action.selected' : 'transparent',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <Box
                    component="img"
                    src={imgEncoded(r.instance.public_banner_path)}
                    alt=""
                    sx={{ width: 80, display: 'block', borderRadius: 1, flexShrink: 0 }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                      <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{r.raceName}</Typography>
                      {badge && <Box component="img" src={badge} alt={r.instance.rank} sx={{ height: 20, flexShrink: 0 }} />}
                      <Chip
                        size="small"
                        label={r.instance.surface}
                        sx={{
                          height: 20,
                          fontSize: '0.65rem',
                          bgcolor: surfaceColor[r.instance.surface] ?? '#757575',
                          color: '#fff',
                        }}
                      />
                      <Chip
                        size="small"
                        label={r.instance.distance_category}
                        variant="outlined"
                        sx={{ height: 20, fontSize: '0.65rem' }}
                      />
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, display: 'block' }}>
                      {r.instance.location ? `${r.instance.location} — ` : ''}{r.instance.distance_text}
                    </Typography>
                  </Box>
                  <Chip size="small" label={r.dateKey} variant="outlined" sx={{ fontSize: '0.65rem', flexShrink: 0 }} />
                </Box>
              )
            })}
            {!dialogFiltered.length && (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                No races match your search.
              </Typography>
            )}
          </Box>
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  )
}
