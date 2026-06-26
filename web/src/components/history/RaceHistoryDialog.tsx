import {
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Typography,
  Chip,
  Paper,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CancelIcon from '@mui/icons-material/Cancel'
import { useQuery } from '@tanstack/react-query'
import { fetchRaces } from '@/services/api'
import { BADGE_ICON } from '@/constants/ui'
import type { RunRecord, RaceAttempt } from '@/services/historyApi'

const surfaceColor: Record<string, string> = { Turf: '#2e7d32', Dirt: '#bf8f4a', Varies: '#757575' }

function imgEncoded(path: string | undefined): string {
  return path ? path.replace(/ /g, '%20') : ''
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

  if (!record) return null

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" fontWeight={700}>
          Races — {record.uma_name || record.preset_name}
        </Typography>
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 1.5, pt: 1 }}>
          {record.races_attempted.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ gridColumn: '1 / -1', textAlign: 'center', py: 4 }}>
              No race data recorded.
            </Typography>
          )}
          {record.races_attempted.map((attempt: RaceAttempt, i: number) => {
            const info = lookupRace(attempt.race_name)
            const badge = info.rank ? BADGE_ICON[info.rank] : null
            return (
              <Paper
                key={i}
                variant="outlined"
                sx={{
                  p: 1.5,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0.75,
                  borderColor: attempt.won ? 'success.main' : 'error.main',
                  borderWidth: attempt.won ? 2 : 1,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {attempt.won
                    ? <CheckCircleIcon color="success" fontSize="small" />
                    : <CancelIcon color="error" fontSize="small" />
                  }
                  <Typography variant="body2" fontWeight={600} noWrap sx={{ flex: 1 }}>
                    {attempt.race_name}
                  </Typography>
                </Box>
                {info.banner && (
                  <Box
                    component="img"
                    src={imgEncoded(info.banner)}
                    alt=""
                    sx={{
                      width: '100%',
                      aspectRatio: '2 / 1',
                      objectFit: 'cover',
                      borderRadius: 1,
                    }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                )}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                  {badge && (
                    <Box component="img" src={badge} alt={info.rank} sx={{ height: 16 }} />
                  )}
                  {info.surface && (
                    <Chip
                      label={info.surface}
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: '0.6rem',
                        color: '#fff',
                        bgcolor: surfaceColor[info.surface] || '#757575',
                      }}
                    />
                  )}
                  {info.distance && (
                    <Chip label={info.distance} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />
                  )}
                  {info.location && (
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {info.location}
                    </Typography>
                  )}
                </Box>
                <Typography variant="caption" color="text.disabled">
                  {new Date(attempt.timestamp).toLocaleString()}
                </Typography>
              </Paper>
            )
          })}
        </Box>
      </DialogContent>
    </Dialog>
  )
}
