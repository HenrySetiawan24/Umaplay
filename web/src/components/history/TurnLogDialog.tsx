import { useRef, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Box,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import type { RunRecord, TurnLogEntry } from '@/services/historyApi'

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

const actionLabel: Record<string, string> = {
  to_training: 'Train',
  to_race: 'Race',
  to_rest: 'Rest',
  to_recreation: 'Recreatn',
  raced: 'Raced',
  rested: 'Rested',
  infirmary: 'Infirm',
  continue: 'Wait',
  training_ready: 'Train✓',
}

export default function TurnLogDialog({
  open,
  record,
  onClose,
}: {
  open: boolean
  record: RunRecord | null
  onClose: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollPosRef = useRef(0)

  const handleScroll = () => {
    if (scrollRef.current) {
      scrollPosRef.current = scrollRef.current.scrollTop
    }
  }

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollPosRef.current
    }
  })

  if (!record) return null
  const log = record.turn_log ?? []

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" fontWeight={700}>
          Turn Log — {record.uma_name || record.preset_name}
        </Typography>
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        {log.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
            No turn log data recorded.
          </Typography>
        ) : (
          <TableContainer ref={scrollRef} onScroll={handleScroll} component={Paper} variant="outlined" sx={{ maxHeight: 500 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Turn</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Action</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Detail</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>SPD</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>STA</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>PWR</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>GUTS</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>WIT</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Energy</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Mood</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Pts</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {log.map((entry: TurnLogEntry, i: number) => {
                  const actionKey = entry.action.toLowerCase()
                  return (
                    <TableRow key={i} hover>
                      <TableCell>{entry.turn}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                        {entry.date_key}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={actionLabel[actionKey] || entry.action.replace('to_', '')}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            color: '#fff',
                            bgcolor: actionColor[actionKey] || '#757575',
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                          {entry.reason && (
                            <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 180 }}>
                              {entry.reason}
                            </Typography>
                          )}
                          {entry.training_type && !entry.reason?.includes(entry.training_type) && (
                            <Typography variant="caption" color="primary" fontWeight={600}>
                              {entry.training_type}
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>{entry.stats?.SPD ?? '—'}</TableCell>
                      <TableCell>{entry.stats?.STA ?? '—'}</TableCell>
                      <TableCell>{entry.stats?.PWR ?? '—'}</TableCell>
                      <TableCell>{entry.stats?.GUTS ?? '—'}</TableCell>
                      <TableCell>{entry.stats?.WIT ?? '—'}</TableCell>
                      <TableCell align="right">
                        {entry.energy != null ? (
                          <Typography
                            variant="body2"
                            sx={{ color: entry.energy < 30 ? 'error.main' : entry.energy < 50 ? 'warning.main' : 'inherit' }}
                          >
                            {entry.energy}%
                          </Typography>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        {entry.mood && entry.mood !== 'UNKNOWN' ? (
                          <Chip label={entry.mood} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />
                        ) : '—'}
                      </TableCell>
                      <TableCell align="right">{entry.skill_pts ?? '—'}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
    </Dialog>
  )
}
