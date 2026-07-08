import React from 'react'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  ButtonBase,
  Stack,
  TextField,
  Typography,
  Paper,
  Chip,
  ToggleButton,
  ToggleButtonGroup,
  Avatar,
  Card,
  useTheme,
  useMediaQuery,
  Tooltip,
} from '@mui/material'
import { styled } from '@mui/material/styles'
import CloseIcon from '@mui/icons-material/Close'

type GridProps = {
  container?: boolean
  spacing?: number
  xs?: number
  sm?: number
  md?: number
  lg?: number
  xl?: number
  children?: React.ReactNode
}

const Grid = ({ container, spacing = 2, xs, sm, md, lg, xl, children }: GridProps) => {
  if (container) {
    const StyledContainer = styled('div')(({ theme }) => ({
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'stretch',
      margin: `-${theme.spacing(spacing)} 0 0 -${theme.spacing(spacing)}`,
      '& > *': {
        padding: `${theme.spacing(spacing)} 0 0 ${theme.spacing(spacing)}`,
        boxSizing: 'border-box',
      },
    }))
    return <StyledContainer>{children}</StyledContainer>
  }

  const StyledItem = styled('div')(({ theme }) => {
    const base = xs ? `${(xs / 12) * 100}%` : '100%'
    const styles: any = {
      flexBasis: base,
      maxWidth: base,
      boxSizing: 'border-box',
      display: 'flex',
    }
    if (sm) {
      styles[theme.breakpoints.up('sm')] = {
        flexBasis: `${(sm / 12) * 100}%`,
        maxWidth: `${(sm / 12) * 100}%`,
      }
    }
    if (md) {
      styles[theme.breakpoints.up('md')] = {
        flexBasis: `${(md / 12) * 100}%`,
        maxWidth: `${(md / 12) * 100}%`,
      }
    }
    if (lg) {
      styles[theme.breakpoints.up('lg')] = {
        flexBasis: `${(lg / 12) * 100}%`,
        maxWidth: `${(lg / 12) * 100}%`,
      }
    }
    if (xl) {
      styles[theme.breakpoints.up('xl')] = {
        flexBasis: `${(xl / 12) * 100}%`,
        maxWidth: `${(xl / 12) * 100}%`,
      }
    }
    return styles
  })

  return <StyledItem>{children}</StyledItem>
}
import SearchIcon from '@mui/icons-material/Search'
import SelectAllIcon from '@mui/icons-material/SelectAll'
import ClearAllIcon from '@mui/icons-material/ClearAll'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline'
import { useMemo, useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchSkills } from '@/services/api'
import { useConfigStore } from '@/store/configStore'
import type { Skill, SkillRarity } from '@/models/datasets'

type CategoryMeta = {
  id: string
  label: string
  icon?: string
  count?: number
  sample?: string
}

const rarityColors: Record<SkillRarity, string> = {
  normal: '#9e9e9e',
  gold: '#FFD54F',
  unique: 'linear-gradient(135deg,#8a2be2,#00e5ff,#ffd54f)',
}

const rarityBgColors: Record<SkillRarity, string> = {
  normal: '#9e9e9e15',
  gold: '#ffd54f33',
  unique: 'linear-gradient(135deg,#8a2be233,#00e5ff40,#ffd54f33)',
}

const FALLBACK_ICON = '/icons/skills/utx_ico_skill_9999.png'
const PAGE_SIZE = 48
// Cap the home "Skills to buy" preview so it stays scrollable (taller list before it starts scrolling).
const SKILLS_PREVIEW_MAX_H = 1050

// Strip trailing rank glyphs game skills use for aptitude tiers (e.g. "Right-Handed ◎" -> "Right-Handed").
function cleanSkillName(name: string): string {
  return name.replace(/[◎○×]+\s*$/u, '').trim()
}

// Sample a few distinct skill names from a category to use as a self-describing tooltip,
// instead of hardcoding a guessed category label (category IDs carry no official name).
function sampleNames(skills: Skill[], max = 3): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of skills) {
    const clean = cleanSkillName(s.name)
    if (!clean || seen.has(clean)) continue
    seen.add(clean)
    out.push(clean)
    if (out.length >= max) break
  }
  return out.join(', ')
}

function getCategoryMeta(skills: Skill[]): CategoryMeta[] {
  const groups = new Map<string, { count: number; icon?: string; skills: Skill[] }>()
  for (const skill of skills) {
    const category = skill.category ?? 'unknown'
    const icon = skill.icon_filename ? `/icons/skills/${skill.icon_filename}` : undefined
    const meta = groups.get(category)
    if (meta) {
      meta.count += 1
      meta.skills.push(skill)
      if (!meta.icon && icon) meta.icon = icon
    } else {
      groups.set(category, { count: 1, icon, skills: [skill] })
    }
  }

  // Numeric sort so new category IDs (e.g. future rescrapes) slot into place
  // automatically instead of needing a hardcoded list kept in sync by hand.
  const order = (a: string, b: string) => {
    const an = Number(a)
    const bn = Number(b)
    if (Number.isNaN(an) && Number.isNaN(bn)) return a.localeCompare(b)
    if (Number.isNaN(an)) return 1
    if (Number.isNaN(bn)) return -1
    return an - bn
  }

  const metas: CategoryMeta[] = []
  for (const [id, { icon, count, skills: catSkills }] of groups.entries()) {
    // Only show categories with actual icons beyond fallback
    if (icon && !icon.endsWith('utx_ico_skill_9999.png')) {
      metas.push({
        id,
        label: id === 'unknown' ? 'Misc' : id,
        icon,
        count,
        sample: sampleNames(catSkills),
      })
    }
  }
  metas.sort((a, b) => order(a.id, b.id))
  return metas
}

const rarityOptions: SkillRarity[] = ['normal', 'gold', 'unique']

export default function SkillsPicker({ presetId }: { presetId: string }) {
  const preset = useConfigStore((s) => s.getSelectedPreset().preset)
  const patchPreset = useConfigStore((s) => s.patchPreset)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [rarityFilter, setRarityFilter] = useState<SkillRarity | 'all'>('all')
  const [page, setPage] = useState(0)
  const [mode, setMode] = useState<'browse' | 'selected'>('browse')
  const theme = useTheme()
  const isNarrow = useMediaQuery(theme.breakpoints.down('sm'))

  // Debounce search query with proper cleanup
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q), 400)
    return () => clearTimeout(timer)
  }, [q])

  // Always open on the Browse panel
  useEffect(() => {
    if (open) setMode('browse')
  }, [open])

  // Reset pagination when filters change
  useEffect(() => {
    setPage(0)
  }, [debouncedQ, q, selectedCategories, rarityFilter])

  const { data: skills = [] } = useQuery({
    queryKey: ['skills'],
    queryFn: fetchSkills,
  })

  if (!preset) return null

  const selected = new Set(preset.skillsToBuy)

  const categories = useMemo(() => getCategoryMeta(skills), [skills])

  const filtered = useMemo<Skill[]>(() => {
    const term = debouncedQ.trim().toLowerCase()

    return skills.filter((s) => {
      const matchesQuery = !term
        || s.name.toLowerCase().includes(term)
        || (s.description || '').toLowerCase().includes(term)

      const matchesCategory = !selectedCategories.length
        || selectedCategories.includes(s.category ?? 'unknown')

      const matchesRarity = rarityFilter === 'all'
        || (s.rarity ?? 'normal') === rarityFilter

      return matchesQuery && matchesCategory && matchesRarity
    })
  }, [skills, debouncedQ, selectedCategories, rarityFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))

  useEffect(() => {
    if (page >= totalPages) {
      setPage(totalPages - 1)
    }
  }, [page, totalPages])

  const paginated = useMemo(() => {
    const start = page * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])

  // Selected-panel contents: the picked skills (resolved to catalog objects), filtered by the shared search term.
  const selectedSkillObjs = useMemo<Skill[]>(() => {
    const term = debouncedQ.trim().toLowerCase()
    const objs = preset.skillsToBuy.map((name) => skills.find((s) => s.name === name) ?? ({ name } as Skill))
    if (!term) return objs
    return objs.filter((s) => s.name.toLowerCase().includes(term) || (s.description || '').toLowerCase().includes(term))
  }, [preset.skillsToBuy, skills, debouncedQ])

  const add = (name: string) => {
    if (selected.has(name)) return
    patchPreset(presetId, 'skillsToBuy', [...preset.skillsToBuy, name])
  }
  const remove = (name: string) => {
    patchPreset(presetId, 'skillsToBuy', preset.skillsToBuy.filter(n => n !== name))
  }

  // Shared horizontal skill card used by both the Browse and Selected panels.
  const renderSkillCard = (skill: Skill) => {
    const icon = skill.icon_filename ? `/icons/skills/${skill.icon_filename}` : FALLBACK_ICON
    const selectedState = selected.has(skill.name)
    const toggleSkill = () => {
      selectedState ? remove(skill.name) : add(skill.name)
    }
    return (
      <Grid key={skill.name} xs={12} md={6} xl={4}>
        <Card
          variant="outlined"
          sx={{
            borderColor: selectedState ? theme.palette.primary.main : 'divider',
            bgcolor: selectedState
              ? `${theme.palette.primary.main}08`
              : skill.rarity
              ? rarityBgColors[skill.rarity]
              : 'background.paper',
            background: skill.rarity === 'unique'
              ? 'linear-gradient(135deg, rgba(138,43,226,0.15), rgba(0,229,255,0.15), rgba(255,213,79,0.15))'
              : undefined,
            position: 'relative',
            height: '100%',
            width: '100%',
            cursor: 'pointer',
            '&:hover': {
              borderColor: theme.palette.primary.main,
              bgcolor: selectedState
                ? `${theme.palette.primary.main}12`
                : `${theme.palette.primary.main}0A`,
            },
          }}
          onClick={toggleSkill}
        >
          {/* Horizontal layout: icon on the left, name + description stacked on the right */}
          <Stack direction="row" spacing={1.25} alignItems="center" sx={{ p: 1, height: '100%' }}>
            <Avatar src={icon} variant="rounded" sx={{ width: 40, height: 40, flexShrink: 0 }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{skill.name}</Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  lineHeight: 1.35,
                }}
              >
                {skill.description || 'No description'}
              </Typography>
            </Box>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation()
                toggleSkill()
              }}
              color={selectedState ? 'error' : 'primary'}
              sx={{ flexShrink: 0, alignSelf: 'flex-start' }}
            >
              {selectedState ? <RemoveCircleOutlineIcon fontSize="small" /> : <AddCircleOutlineIcon fontSize="small" />}
            </IconButton>
          </Stack>
        </Card>
      </Grid>
    )
  }

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="subtitle2">Skills to buy</Typography>
        <Button size="small" variant="outlined" onClick={() => setOpen(true)}>
          Open picker
        </Button>
      </Stack>

      {/* quick preview — horizontal tiles: icon on the left, name (up to 2 lines) on the right.
          Scrollable with a capped height so the card stays roughly aligned with the Race Scheduler. */}
      <Box
        sx={{
          mt: 1,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
          gap: 1,
          maxHeight: SKILLS_PREVIEW_MAX_H,
          overflowY: 'auto',
          pr: 0.5,
        }}
      >
        {preset.skillsToBuy.map(n => {
          const skill = skills.find(s => s.name === n)
          const icon = skill?.icon_filename ? `/icons/skills/${skill.icon_filename}` : FALLBACK_ICON
          return (
            <Tooltip key={n} title={skill?.description || n}>
              <Box
                sx={{
                  position: 'relative',
                  minWidth: 0,
                  borderRadius: 1.5,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: skill?.rarity && skill.rarity !== 'unique' ? rarityBgColors[skill.rarity] : 'background.paper',
                  background: skill?.rarity === 'unique' ? rarityBgColors.unique : undefined,
                  p: 0.5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                  transition: 'border-color 0.15s',
                  '&:hover': { borderColor: theme.palette.primary.main },
                  '&:hover .skill-remove': { opacity: 1 },
                }}
              >
                <Avatar src={icon} variant="rounded" sx={{ width: 32, height: 32, flexShrink: 0 }} />
                <Typography
                  variant="caption"
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    pr: 2,
                    fontWeight: 600,
                    lineHeight: 1.2,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {n}
                </Typography>
                <IconButton
                  className="skill-remove"
                  size="small"
                  onClick={() => remove(n)}
                  sx={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    width: 18,
                    height: 18,
                    opacity: { xs: 1, sm: 0 },
                    transition: 'opacity 0.15s',
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                    '&:hover': { bgcolor: 'error.main', color: '#fff' },
                  }}
                >
                  <CloseIcon sx={{ fontSize: 12 }} />
                </IconButton>
              </Box>
            </Tooltip>
          )
        })}
        {!preset.skillsToBuy.length && (
          <Typography variant="caption" color="text.secondary">No skills selected.</Typography>
        )}
      </Box>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="xl"
        fullWidth
        fullScreen={isNarrow}
      >
        <DialogTitle>Skill Library</DialogTitle>
        <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', flex: 1 }}>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              height: { xs: '100%', md: 'calc(100vh - 200px)' },
              minHeight: { xs: 0, md: 500 },
              flex: 1,
              overflow: 'hidden',
            }}
          >
            {/* Shared header: search + rarity + Browse/Selected segmented control (stays put while panels slide) */}
            <Box sx={{ p: 2, pb: 1.5 }}>
                <Stack
                  direction={{ xs: 'column', md: 'row' }}
                  spacing={2}
                  alignItems={{ xs: 'stretch', md: 'center' }}
                >
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Search by name or description"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon fontSize="small" />
                        </InputAdornment>
                      ),
                    }}
                  />
                  <ToggleButtonGroup
                    value={rarityFilter}
                    exclusive
                    onChange={(_, val) => val && setRarityFilter(val)}
                    size="small"
                    color="primary"
                  >
                    <ToggleButton value="all">ALL</ToggleButton>
                    {rarityOptions.map((r) => (
                      <ToggleButton
                        key={r}
                        value={r}
                        sx={{
                          bgcolor: rarityFilter === r ? `${rarityColors[r]}30` : undefined,
                          '&.Mui-selected': {
                            bgcolor: `${rarityColors[r]}40`,
                            color: rarityColors[r],
                          },
                        }}
                      >
                        {r.toUpperCase()}
                      </ToggleButton>
                    ))}
                  </ToggleButtonGroup>

                  {/* Browse / Selected sliding segmented control — the pill behind the labels slides in sync with the panels */}
                  <Box
                    sx={{
                      position: 'relative',
                      display: 'inline-flex',
                      flexShrink: 0,
                      p: 0.5,
                      borderRadius: 999,
                      bgcolor: 'action.hover',
                      alignSelf: { xs: 'flex-start', md: 'center' },
                    }}
                  >
                    <Box
                      sx={{
                        position: 'absolute',
                        top: 4,
                        bottom: 4,
                        left: 4,
                        width: 'calc(50% - 4px)',
                        borderRadius: 999,
                        bgcolor: 'background.paper',
                        boxShadow: 2,
                        transform: mode === 'selected' ? 'translateX(100%)' : 'translateX(0)',
                        transition: 'transform 750ms cubic-bezier(0.4, 0, 0.2, 1)',
                      }}
                    />
                    {(['browse', 'selected'] as const).map((m) => (
                      <ButtonBase
                        key={m}
                        onClick={() => setMode(m)}
                        sx={{
                          zIndex: 1,
                          minWidth: 108,
                          px: 1.75,
                          py: 0.75,
                          borderRadius: 999,
                          fontSize: 13,
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          color: mode === m ? 'text.primary' : 'text.secondary',
                          transition: 'color 200ms',
                        }}
                      >
                        {m === 'browse' ? 'Browse' : `Selected (${preset.skillsToBuy.length})`}
                      </ButtonBase>
                    ))}
                  </Box>
                </Stack>
              </Box>

              {/* Sliding viewport: Browse panel and Selected panel side by side in a 2×-wide track */}
              <Box sx={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
                <Box
                  sx={{
                    display: 'flex',
                    width: '200%',
                    height: '100%',
                    transform: mode === 'selected' ? 'translateX(-50%)' : 'translateX(0)',
                    transition: 'transform 750ms cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                >
                  {/* Panel A: Browse (all skills, category filters, pagination) */}
                  <Box sx={{ width: '50%', height: '100%', overflow: 'auto', px: 2, pb: 2, display: 'flex', flexDirection: 'column' }}>
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Tooltip title={`${skills.length} skills total`}>
                    <Chip
                      icon={<SelectAllIcon fontSize="small" />}
                      label="All types"
                      size="small"
                      color={!selectedCategories.length ? 'primary' : 'default'}
                      onClick={() => setSelectedCategories([])}
                    />
                  </Tooltip>
                  {categories.map((cat) => (
                    <Tooltip
                      key={cat.id}
                      title={cat.sample ? `${cat.sample}${cat.count ? ` (${cat.count})` : ''}` : cat.label}
                    >
                      <Box
                        onClick={() => {
                          setSelectedCategories((prev) =>
                            prev.includes(cat.id)
                              ? prev.filter((id) => id !== cat.id)
                              : [...prev, cat.id]
                          )
                        }}
                        sx={{
                          width: 48,
                          height: 48,
                          borderRadius: 2,
                          border: '2px solid',
                          borderColor: selectedCategories.includes(cat.id)
                            ? theme.palette.primary.main
                            : theme.palette.divider,
                          bgcolor: selectedCategories.includes(cat.id)
                            ? `${theme.palette.primary.main}15`
                            : 'background.paper',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          p: 0.5,
                          transition: 'all 0.2s',
                          '&:hover': {
                            borderColor: theme.palette.primary.main,
                            bgcolor: `${theme.palette.primary.main}08`,
                          },
                        }}
                      >
                        <Box
                          component="img"
                          src={cat.icon}
                          sx={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                          }}
                        />
                      </Box>
                    </Tooltip>
                  ))}
                  {!!selectedCategories.length && (
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        mt: 2,
                        mb: 1,
                      }}
                    >
                      <Button
                        variant="contained"
                        color="error"
                        startIcon={<ClearAllIcon fontSize="small" />}
                        onClick={() => setSelectedCategories([])}
                      >
                        Clear
                      </Button>
                    </Box>
                  )}
                    </Stack>

                    <Box sx={{ flex: 1, overflow: 'auto', mt: 2 }}>
                {filtered.length === 0 ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', p: 4 }}>
                    <Typography variant="body2" color="text.secondary" align="center">
                      No skills found
                    </Typography>
                  </Box>
                ) : (
                  <Grid container spacing={1.5}>
                    {paginated.map(renderSkillCard)}
                  </Grid>
                )}
                    </Box>

                    {filtered.length > PAGE_SIZE && (
                      <Stack direction="row" spacing={1} justifyContent="center" alignItems="center" sx={{ mt: 2 }}>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => setPage((prev) => Math.max(0, prev - 1))}
                          disabled={page === 0}
                        >
                          Previous
                        </Button>
                        <Typography variant="caption" color="text.secondary">
                          Page {page + 1} of {totalPages}
                        </Typography>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => setPage((prev) => Math.min(totalPages - 1, prev + 1))}
                          disabled={page >= totalPages - 1}
                        >
                          Next
                        </Button>
                      </Stack>
                    )}
                  </Box>

                  {/* Panel B: Selected (only the picked skills, filtered by the shared search) */}
                  <Box sx={{ width: '50%', height: '100%', overflow: 'auto', p: 2, display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
                      {preset.skillsToBuy.length} skill{preset.skillsToBuy.length === 1 ? '' : 's'} selected
                    </Typography>
                    {selectedSkillObjs.length === 0 ? (
                      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, p: 4 }}>
                        <Typography variant="body2" color="text.secondary" align="center">
                          {preset.skillsToBuy.length === 0
                            ? 'No skills selected yet. Switch to Browse to add some.'
                            : 'No selected skills match your search.'}
                        </Typography>
                      </Box>
                    ) : (
                      <Grid container spacing={1.5}>
                        {selectedSkillObjs.map(renderSkillCard)}
                      </Grid>
                    )}
                  </Box>
                </Box>
              </Box>
            </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  )
}
