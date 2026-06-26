import { useEffect, useState, useCallback } from 'react'
import { Button, Box, CircularProgress } from '@mui/material'
import { fetchBotStatus, startBot, stopBot } from '@/services/api'
import { fetchIncompleteHistory, type RunRecord } from '@/services/historyApi'
import ContinueRunDialog from './ContinueRunDialog'

export default function BotControl() {
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [incomplete, setIncomplete] = useState<RunRecord[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)

  const poll = useCallback(async () => {
    try {
      const status = await fetchBotStatus()
      setRunning(status.running)
    } catch {
      setRunning(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    poll()
    const id = setInterval(poll, 3000)
    return () => clearInterval(id)
  }, [poll])

  const handleStart = async () => {
    setActionLoading(true)
    try {
      const incompleteRecords = await fetchIncompleteHistory()
      if (incompleteRecords.length > 0) {
        setIncomplete(incompleteRecords)
        setDialogOpen(true)
        setActionLoading(false)
        return
      }
      await startBot()
      setRunning(true)
    } catch {
      // ignore
    }
    setActionLoading(false)
  }

  const handleContinue = async (id: string) => {
    setDialogOpen(false)
    setActionLoading(true)
    try {
      await startBot(id)
      setRunning(true)
    } catch {
      // ignore
    }
    setActionLoading(false)
  }

  const handleFresh = async () => {
    setDialogOpen(false)
    setActionLoading(true)
    try {
      await startBot()
      setRunning(true)
    } catch {
      // ignore
    }
    setActionLoading(false)
  }

  const handleStop = async () => {
    setActionLoading(true)
    try {
      await stopBot()
      setRunning(false)
    } catch {
      // ignore
    }
    setActionLoading(false)
  }

  return (
    <>
      <Button
        variant={running ? 'contained' : 'outlined'}
        color={running ? 'error' : 'success'}
        disabled={loading || actionLoading}
        onClick={running ? handleStop : handleStart}
        startIcon={
          loading ? <CircularProgress size={14} /> :
          <Box sx={{
            width: 10, height: 10, borderRadius: '50%',
            bgcolor: running ? '#ff5252' : '#4caf50',
            boxShadow: running
              ? '0 0 6px #ff5252'
              : '0 0 6px #4caf50',
            flexShrink: 0,
          }} />
        }
        sx={{
          fontWeight: 700,
          borderRadius: 2.5,
          px: 2.5,
          py: 0.75,
          minWidth: 100,
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}
      >
        {actionLoading ? '…' : running ? 'Stop' : 'Start'}
      </Button>
      <ContinueRunDialog
        open={dialogOpen}
        records={incomplete}
        onContinue={handleContinue}
        onFresh={handleFresh}
        onCancel={() => setDialogOpen(false)}
      />
    </>
  )
}
