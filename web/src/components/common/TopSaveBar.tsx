import { Button, CircularProgress, Tooltip } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import SaveIcon from '@mui/icons-material/Save'
import { useConfigSave } from '@/hooks/useConfigSave'

/**
 * Single always-visible save control for the sticky top bar.
 * Config auto-saves on change; this one button both reflects the live status
 * (Saving… / Saved / failed) and acts as the manual save/retry fallback.
 */
export default function TopSaveBar() {
  const { status, error, save } = useConfigSave()

  const { label, icon, color, variant, tip } = (() => {
    switch (status) {
      case 'saving':
        return {
          label: 'Saving…',
          icon: <CircularProgress size={14} color="inherit" />,
          color: 'primary' as const,
          variant: 'outlined' as const,
          tip: 'Saving config to the bot…',
        }
      case 'saved':
        return {
          label: 'Saved',
          icon: <CheckCircleIcon fontSize="small" />,
          color: 'success' as const,
          variant: 'outlined' as const,
          tip: 'Config is saved. Click to save again.',
        }
      case 'error':
        return {
          label: 'Save failed — retry',
          icon: <ErrorOutlineIcon fontSize="small" />,
          color: 'error' as const,
          variant: 'contained' as const,
          tip: error || 'Auto-save failed. Click to retry.',
        }
      default:
        return {
          label: 'Save',
          icon: <SaveIcon fontSize="small" />,
          color: 'primary' as const,
          variant: 'outlined' as const,
          tip: 'Save config to the bot now',
        }
    }
  })()

  return (
    <Tooltip title={tip}>
      <span>
        <Button
          size="small"
          variant={variant}
          color={color}
          disabled={status === 'saving'}
          onClick={() => { void save({ force: true }) }}
          startIcon={icon}
          sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', whiteSpace: 'nowrap' }}
        >
          {label}
        </Button>
      </span>
    </Tooltip>
  )
}
