import { useEffect, useState, useCallback } from 'react'
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  CircularProgress,
  Alert,
  Tooltip,
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import VisibilityIcon from '@mui/icons-material/Visibility'
import { fetchHistory, deleteHistory, type RunRecord } from '@/services/historyApi'
import RaceHistoryDialog from './RaceHistoryDialog'

const statusChip = (record: RunRecord) => {
  if (record.completed) return <Chip label="Completed" color="success" size="small" variant="outlined" />
  if (record.error === "stopped") return <Chip label="Stopped" color="warning" size="small" variant="outlined" />
  if (record.error) return <Chip label="Error" color="error" size="small" variant="filled" />
  return <Chip label="Running?" color="info" size="small" variant="outlined" />
}

export default function RunHistory() {
  const [records, setRecords] = useState<RunRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogRecord, setDialogRecord] = useState<RunRecord | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchHistory()
      setRecords(data.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime()))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load history')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id: string) => {
    try {
      await deleteHistory(id)
      setRecords((prev) => prev.filter((r) => r.id !== id))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete record')
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return <Alert severity="error" sx={{ maxWidth: 600, mx: 'auto' }}>{error}</Alert>
  }

  if (records.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography variant="body1" color="text.secondary">
          No run history yet. Complete a scenario run to see it here.
        </Typography>
      </Box>
    )
  }

  const formatFans = (n: number | null) => {
    if (n == null) return '—'
    return n.toLocaleString()
  }

  const fmtTime = (iso: string | null) => {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleString()
  }

  const fmtDuration = (start: string, end: string | null) => {
    if (!end) return '—'
    const ms = new Date(end).getTime() - new Date(start).getTime()
    if (ms < 0) return '—'
    const sec = Math.floor(ms / 1000)
    const min = Math.floor(sec / 60)
    const hr = Math.floor(min / 60)
    if (hr > 0) return `${hr}h ${min % 60}m ${sec % 60}s`
    if (min > 0) return `${min}m ${sec % 60}s`
    return `${sec}s`
  }

  return (
    <>
      <TableContainer component={Paper} variant="outlined" sx={{ width: '100%' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', py: 1.5 }}>Start</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', py: 1.5 }}>End</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', py: 1.5 }}>Duration</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', py: 1.5 }}>Scenario</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', py: 1.5 }}>Preset / Uma</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', py: 1.5 }} align="right">Fans</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', py: 1.5 }} align="right">Rank</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', py: 1.5 }} align="right">Turn</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', py: 1.5 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', py: 1.5 }} align="center">Races</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', py: 1.5 }} align="center" />
            </TableRow>
          </TableHead>
          <TableBody>
            {records.map((record) => (
              <TableRow key={record.id} hover sx={{ '& td': { py: 1.5, fontSize: '0.85rem' } }}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {fmtTime(record.start_time)}
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {fmtTime(record.end_time)}
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {fmtDuration(record.start_time, record.end_time)}
                </TableCell>
                <TableCell>
                  <Chip label={record.scenario} size="small" variant="outlined" />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight={500}>
                    {record.uma_name || record.preset_name}
                  </Typography>
                </TableCell>
                <TableCell align="right">{formatFans(record.final_fans)}</TableCell>
                <TableCell align="right">
                  {record.final_rank ? (
                    <Typography fontWeight={700} color="primary">{record.final_rank}</Typography>
                  ) : '—'}
                </TableCell>
                <TableCell align="right">{record.final_turn ?? '—'}</TableCell>
                <TableCell>{statusChip(record)}</TableCell>
                <TableCell align="center">
                  <Typography variant="body2">
                    {record.races_attempted.length}
                  </Typography>
                </TableCell>
                <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                  <Tooltip title="View races">
                    <IconButton
                      size="small"
                      onClick={() => setDialogRecord(record)}
                      disabled={record.races_attempted.length === 0}
                    >
                      <VisibilityIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton size="small" color="error" onClick={() => handleDelete(record.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <RaceHistoryDialog
        open={dialogRecord !== null}
        record={dialogRecord}
        onClose={() => setDialogRecord(null)}
      />
    </>
  )
}
