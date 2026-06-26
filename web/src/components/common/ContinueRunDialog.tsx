import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Paper,
  Chip,
} from '@mui/material'
import type { RunRecord } from '@/services/historyApi'

export default function ContinueRunDialog({
  open,
  records,
  onContinue,
  onFresh,
  onCancel,
}: {
  open: boolean
  records: RunRecord[]
  onContinue: (id: string) => void
  onFresh: () => void
  onCancel: () => void
}) {
  if (!records.length) return null

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Incomplete run found</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          A previous run did not finish. Would you like to continue it or start fresh?
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {records.map((r) => (
            <Paper
              key={r.id}
              variant="outlined"
              sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer', '&:hover': { borderColor: 'primary.main' } }}
              onClick={() => onContinue(r.id)}
            >
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" fontWeight={600}>
                  {r.uma_name || r.preset_name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {new Date(r.start_time).toLocaleString()} &middot; Turn {r.final_turn ?? '?'} &middot; {r.scenario}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {r.final_fans != null && (
                  <Chip label={`${r.final_fans.toLocaleString()} fans`} size="small" variant="outlined" />
                )}
                {r.final_rank && (
                  <Chip label={r.final_rank} size="small" color="primary" variant="outlined" />
                )}
                <Chip label={`${r.races_attempted.length} races`} size="small" variant="outlined" />
              </Box>
            </Paper>
          ))}
        </Box>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="outlined" onClick={onFresh}>Start Fresh</Button>
      </DialogActions>
    </Dialog>
  )
}
