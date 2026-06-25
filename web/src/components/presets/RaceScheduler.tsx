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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import SearchIcon from '@mui/icons-material/Search'
import ClearIcon from '@mui/icons-material/Clear'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { fetchRaces } from '@/services/api'
import type { RacesMap, RaceInstance } from '@/models/datasets'
import { toDateKey } from '@/utils/race'
import { useConfigStore } from '@/store/configStore'
import { BADGE_ICON } from '@/constants/ui'

type RaceRow = { raceName: string; instance: RaceInstance; dateKey: string }

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const YEAR_COLS = [
  { label: 'Junior', year: 1 },
  { label: 'Classic', year: 2 },
  { label: 'Senior', year: 3 },
]

export default function RaceScheduler({ presetId }: { presetId: string; compact?: boolean }) {
  const preset = useConfigStore((s) => s.getSelectedPreset().preset)
  const patchPreset = useConfigStore((s) => s.patchPreset)
  const { data: races = {} as RacesMap } = useQuery({ queryKey: ['races'], queryFn: fetchRaces })

  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogDateKey, setDialogDateKey] = useState('')
  const [dialogMonth, setDialogMonth] = useState(1)
  const [dialogHalf, setDialogHalf] = useState(1)
  const [dialogSearch, setDialogSearch] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

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

  const remove = (dateKey: string) => {
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
  }

  const handleSelectRace = (row: RaceRow) => {
    patchPreset(presetId, 'plannedRaces', { ...preset.plannedRaces, [dialogDateKey]: row.raceName })
    setDialogOpen(false)
  }

  const handleRemoveFromDialog = () => {
    if (dialogDateKey) remove(dialogDateKey)
    setDialogOpen(false)
  }

  const handleToggleTentative = () => {
    if (dialogDateKey) {
      const next = { ...(preset.plannedRacesTentative ?? {}) }
      if (next[dialogDateKey]) delete next[dialogDateKey]
      else next[dialogDateKey] = true
      patchPreset(presetId, 'plannedRacesTentative', Object.keys(next).length ? next : {})
    }
  }

  const existingRace = (year: number, month: number, half: number): { name: string; tentative: boolean } | null => {
    const dk = toDateKey(year, month, half)
    const name = preset.plannedRaces[dk]
    if (!name) return null
    return { name, tentative: !!preset.plannedRacesTentative?.[dk] }
  }

  const renderCell = (year: number, month: number, half: number) => {
    const dk = toDateKey(year, month, half)
    const selected = existingRace(year, month, half)
    const isBeforeJune = year === 1 && month < 6
    const isDisabled = isBeforeJune

    return (
      <TableCell
        key={dk}
        onClick={() => !isDisabled && handleCellClick(year, month, half)}
        sx={{
          p: 0.5,
          border: 1,
          borderColor: selected ? 'primary.main' : 'divider',
          cursor: isDisabled ? 'default' : 'pointer',
          opacity: isDisabled ? 0.25 : 1,
          bgcolor: selected?.tentative ? 'warning.dark' : selected ? 'primary.dark' : 'background.paper',
          '&:hover': isDisabled ? {} : { borderColor: selected ? 'primary.light' : 'text.secondary' },
          minWidth: 100,
          maxWidth: 160,
          width: 120,
          height: 52,
          transition: 'border-color 0.15s',
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {selected ? (
            <>
              <Typography variant="caption" sx={{ lineHeight: 1.2, fontSize: '0.7rem', fontWeight: 600 }}>
                {selected.name}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, mt: 'auto' }}>
                {selected.tentative && (
                  <Chip size="small" label="?" variant="outlined" sx={{ height: 14, fontSize: '0.55rem' }} />
                )}
              </Box>
            </>
          ) : !isDisabled ? (
            <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.disabled', alignSelf: 'center', mt: 'auto', mb: 'auto' }}>
              +
            </Typography>
          ) : null}
        </Box>
      </TableCell>
    )
  }

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
          <Paper variant="outlined" sx={{ maxHeight: 360, overflow: 'auto' }}>
            <Typography variant="caption" color="text.secondary" sx={{ p: 1, display: 'block' }}>
              {searchResults.length} results — click to add
            </Typography>
            <List dense disablePadding>
              {searchResults.map((r) => {
                const badge = BADGE_ICON[r.instance.rank] || null
                const alreadyPlanned = !!preset.plannedRaces[r.dateKey]
                const surfaceColor: Record<string, string> = { Turf: '#2e7d32', Dirt: '#bf8f4a', Varies: '#757575' }
                return (
                  <ListItemButton
                    key={`${r.dateKey}-${r.raceName}`}
                    onClick={() => handleQuickAdd(r)}
                    sx={{ gap: 1 }}
                  >
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
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 520 }}>
            <Table size="small" stickyHeader sx={{ tableLayout: 'fixed' }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 64, minWidth: 64, fontWeight: 700, fontSize: '0.7rem', py: 0.5 }}>
                    Turn
                  </TableCell>
                  {YEAR_COLS.map(col => (
                    <TableCell key={col.year} align="center" sx={{ fontWeight: 700, fontSize: '0.75rem', py: 0.5 }}>
                      {col.label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].flatMap(m =>
                  [1, 2].map(half => (
                    <TableRow key={`${m}-${half}`} sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                      <TableCell
                        sx={{
                          width: 64,
                          minWidth: 64,
                          fontWeight: 600,
                          fontSize: '0.65rem',
                          color: 'text.secondary',
                          py: 0.5,
                          border: 1,
                          borderColor: 'divider',
                        }}
                      >
                        {MONTH_NAMES[m - 1]} {half === 1 ? '1st' : '2nd'}
                      </TableCell>
                      {YEAR_COLS.map(col => renderCell(col.year, m, half))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Stack>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ pb: 1 }}>
          {dialogRaceName
            ? `Change: ${MONTH_NAMES[dialogMonth - 1]} ${dialogHalf === 1 ? '\u524d\u534a' : '\u5f8c\u534a'}`
            : `Select Race \u2014 ${MONTH_NAMES[dialogMonth - 1]} ${dialogHalf === 1 ? '\u524d\u534a' : '\u5f8c\u534a'}`}
        </DialogTitle>

        <DialogContent sx={{ pt: 1 }}>
          {dialogRaceName && (() => {
            const current = flat.find(r => r.dateKey === dialogDateKey && r.raceName === dialogRaceName)
            const surfaceColor: Record<string, string> = { Turf: '#2e7d32', Dirt: '#bf8f4a', Varies: '#757575' }
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

          <Box sx={{ maxHeight: 320, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {dialogFiltered.map((r) => {
              const badge = BADGE_ICON[r.instance.rank] || null
              const surfaceColor: Record<string, string> = { Turf: '#2e7d32', Dirt: '#bf8f4a', Varies: '#757575' }
              return (
                <Box
                  key={`${r.dateKey}-${r.raceName}`}
                  onClick={() => handleSelectRace(r)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    p: 0.75,
                    borderRadius: 1,
                    cursor: 'pointer',
                    bgcolor: r.dateKey === dialogDateKey && dialogRaceName === r.raceName ? 'action.selected' : 'transparent',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                      <Typography variant="body2" noWrap>{r.raceName}</Typography>
                      {badge && <Box component="img" src={badge} alt={r.instance.rank} sx={{ height: 16, flexShrink: 0 }} />}
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
                    <Typography variant="caption" color="text.secondary">
                      {r.instance.location ? `${r.instance.location} \u2014 ` : ''}{r.instance.distance_text}
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
