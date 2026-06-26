import {
  FormControlLabel, MenuItem, Select, Slider, Box, Stack, Switch, TextField, Typography, Button, Snackbar, Alert,
  Avatar, ToggleButton, ToggleButtonGroup,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Link, Tooltip,
} from '@mui/material'
import Section from '@/components/common/Section'
import { useConfigStore } from '@/store/configStore'
import AdvancedSettings from './AdvancedSettings'
import { checkUpdate, forceUpdate, getVersion, updateFromGithub } from '@/services/api'
import { useEffect, useState } from 'react'

export default function GeneralForm() {
  const { config, setGeneral } = useConfigStore()
  const uiTheme = useConfigStore((s) => s.uiTheme)
  const setUiTheme = useConfigStore((s) => s.setUiTheme)
  const setScenario = useConfigStore((s) => s.setScenario)
  const g = config.general
  const [updating, setUpdating] = useState(false)
  const [snack, setSnack] = useState<{open:boolean; msg:string; severity:'success'|'error'}>({open:false,msg:'',severity:'success'})
  const [update, setUpdate] = useState<{is_update_available:boolean; latest?:string; html_url?:string} | null>(null)
  const [version, setVersion] = useState<string>('—')
  const [confirmForce, setConfirmForce] = useState(false)
  

  useEffect(() => {
    let mounted = true
    checkUpdate().then(info => {
      if (mounted) setUpdate(info)
    }).catch(() => {})
    getVersion().then(v => { if (mounted) setVersion(v.version) }).catch(() => {})
    return () => { mounted = false }
  }, [])
  // small helper map for mode icons (place PNGs under /public/icons/)
  const MODE_ICON: Record<'steam' | 'scrcpy' | 'bluestack' | 'adb', string> = {
    steam: '/icons/mode_steam.png',
    scrcpy: '/icons/mode_scrcpy.png',
    bluestack: '/icons/mode_bluestack.png',
    adb: '/icons/mode_adb.png',
  }

  return (
    <Section title="" sx={{ maxWidth: 820, width: '100%' }}>
      {update && update.is_update_available && (
        <Alert severity="info" sx={{ mt: 1 }}>
          New version available: {update.latest}{' '}
          <Button
            size="small"
            onClick={() => window.open(update.html_url || 'https://github.com/YOUR_GH_USERNAME_OR_ORG/YOUR_REPO_NAME/releases/latest', '_blank')}
          >
            Download
          </Button>
        </Alert>
      )}
      <Box sx={{ border: (t) => `1px solid ${t.palette.divider}`, borderRadius: 1, p: 2 }}>
        <Typography variant="h6" sx={{ mb: 1.5 }}>General configurations</Typography>
      <Stack spacing={1}>
        <Box>
          <Typography variant="body2" color="text.secondary" fontWeight={500} sx={{ mb: 0.5 }}>
            <Tooltip title="Toggle dark/light mode for this configuration UI. (Does not affect in-game visuals.)" arrow>
              <span>UI Theme</span>
            </Tooltip>
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={uiTheme === 'dark'}
                onChange={(e) => setUiTheme(e.target.checked ? 'dark' : 'light')}
              />
            }
            label={uiTheme === 'dark' ? 'Dark' : 'Light'}
          />
        </Box>
        <Box>
          <Typography variant="body2" color="text.secondary" fontWeight={500} sx={{ mb: 0.5 }}>
            <Tooltip title="Select which training scenario the runtime will execute. Event presets still manage their own scenario preferences in the Presets → Events section." arrow>
              <span>Active scenario</span>
            </Tooltip>
          </Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={g.activeScenario}
            onChange={(_, value) => value && setScenario(value)}
            sx={{
              '& .MuiToggleButton-root': {
                px: 1.5,
                py: 0.75,
                textTransform: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                borderRadius: 1,
                borderColor: 'transparent',
              },
              '& .MuiToggleButton-root.Mui-selected': {
                backgroundColor: 'primary.main',
                color: 'primary.contrastText',
                borderColor: 'primary.main',
              },
              '& .MuiToggleButton-root.Mui-selected:hover': {
                backgroundColor: 'primary.main',
              },
            }}
          >
            <ToggleButton
              value="ura"
              aria-label="URA scenario"
              onClick={() => setScenario('ura')}
            >
              <Box
                component="img"
                src="/scenarios/ura_icon.png"
                alt="URA"
                sx={{ width: 20, height: 20, borderRadius: 1 }}
              />
              <span>URA</span>
            </ToggleButton>
            <ToggleButton
              value="unity_cup"
              aria-label="Unity Cup scenario"
              onClick={() => setScenario('unity_cup')}
            >
              <Box
                component="img"
                src="/scenarios/unity_cup_icon.png"
                alt="Unity Cup"
                sx={{ width: 20, height: 20, borderRadius: 1 }}
              />
              <span>Unity Cup</span>
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: { xs: 0, sm: '72px' } }}>
          <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: 'primary.main' }} />
          <Typography variant="caption" color="text.secondary">
            {`Active scenario: ${g.activeScenario === 'unity_cup' ? 'Unity Cup' : 'URA'}${g.scenarioConfirmed ? ' (saved – hotkey will skip the prompt)' : ' (will ask once when starting via hotkey)'}`}
          </Typography>
        </Box>


        <Box>
          <Typography variant="body2" color="text.secondary" fontWeight={500} sx={{ mb: 0.5 }}>
            <Tooltip title="Select the platform/controller the agent should target. Steam mode works on Windows and Linux (via Wine)." arrow>
              <span>Mode</span>
            </Tooltip>
          </Typography>
          <Select
            size="small"
            value={g.mode}
            onChange={(e) => setGeneral({ mode: e.target.value as any })}
            renderValue={(val) => {
              const m = val as 'steam' | 'scrcpy' | 'bluestack' | 'adb'
              return (
                <Stack direction="row" spacing={1} alignItems="center">
                  <Avatar
                    variant="rounded"
                    src={MODE_ICON[m]}
                    alt={m}
                    sx={{ width: 20, height: 20 }}
                  />
                  <span style={{ textTransform: 'none' }}>{m}</span>
                </Stack>
              )
            }}
          >
            {(['steam', 'scrcpy', 'bluestack', 'adb'] as const).map((m) => (
              <MenuItem key={m} value={m}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Avatar
                    variant="rounded"
                    src={MODE_ICON[m]}
                    alt={m}
                    sx={{ width: 20, height: 20 }}
                  />
                  <span style={{ textTransform: 'none' }}>{m}</span>
                </Stack>
              </MenuItem>
            ))}
          </Select>
        </Box>

        {g.mode === 'scrcpy' && (
          <Box>
            <Typography variant="body2" color="text.secondary" fontWeight={500} sx={{ mb: 0.5 }}>
              <Tooltip title="Exact (or unique substring) of the SCRCPY window title to focus and capture." arrow>
                <span>Window title</span>
              </Tooltip>
            </Typography>
            <TextField
              size="small"
              value={g.windowTitle}
              onChange={(e) => setGeneral({ windowTitle: e.target.value })}
              placeholder="Your scrcpy device title (e.g. 23117RA68G)"
            />
          </Box>
        )}

        {g.mode === 'adb' && (
          <Box>
            <Typography variant="body2" color="text.secondary" fontWeight={500} sx={{ mb: 0.5 }}>
              <Tooltip title="ADB device identifier (e.g., localhost:5555). The bot will auto-connect when starting." arrow>
                <span>ADB device</span>
              </Tooltip>
            </Typography>
            <TextField
              size="small"
              value={g.adbDevice ?? 'localhost:5555'}
              onChange={(e) => setGeneral({ adbDevice: e.target.value })}
              placeholder="localhost:5555"
            />
          </Box>
        )}

        {g.mode === 'bluestack' && (
          <>
            <Box>
              <Typography variant="body2" color="text.secondary" fontWeight={500} sx={{ mb: 0.5 }}>
                <Tooltip title="Use ADB commands instead of mouse control. Requires ADB installed and BlueStacks ADB enabled." arrow>
                  <span>Use ADB (no mouse control)</span>
                </Tooltip>
              </Typography>
              <FormControlLabel
                control={
                  <Switch
                    checked={g.useAdb ?? false}
                    onChange={(e) => setGeneral({ useAdb: e.target.checked })}
                  />
                }
                label={g.useAdb ? 'Enabled' : 'Disabled'}
              />
            </Box>
            {g.useAdb && (
              <Box>
                <Typography variant="body2" color="text.secondary" fontWeight={500} sx={{ mb: 0.5 }}>
                  <Tooltip title="ADB device identifier (e.g., localhost:5555)." arrow>
                    <span>ADB device</span>
                  </Tooltip>
                </Typography>
                <TextField
                  size="small"
                  value={g.adbDevice ?? 'localhost:5555'}
                  onChange={(e) => setGeneral({ adbDevice: e.target.value })}
                  placeholder="localhost:5555"
                />
              </Box>
            )}
          </>
        )}

        <Box>
          <Typography variant="body2" color="text.secondary" fontWeight={500} sx={{ mb: 0.5 }}>
            <Tooltip title="Lower-latency settings (might reduce accuracy in edge cases)." arrow>
              <span>Fast mode</span>
            </Tooltip>
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={g.fastMode}
                onChange={(e) => setGeneral({ fastMode: e.target.checked })}
              />
            }
            label={g.fastMode ? 'Enabled' : 'Disabled'}
          />
        </Box>

        {g.fastMode && (
          <Box>
            <Typography variant="body2" color="text.secondary" fontWeight={500} sx={{ mb: 0.5 }}>
              <Tooltip title="When energy drops below this %, skip all training tiles except WIT." arrow>
                <span>Fast mode energy threshold</span>
              </Tooltip>
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Slider
                value={g.fastModeEnergyThreshold ?? 35}
                onChange={(_, v) => setGeneral({ fastModeEnergyThreshold: Number(v) })}
                min={0}
                max={100}
                sx={{ flex: 1 }}
              />
              <Typography variant="body2" sx={{ width: 32, textAlign: 'right' }}>
                {g.fastModeEnergyThreshold ?? 35}%
              </Typography>
            </Box>
          </Box>
        )}

        <Box>
          <Typography variant="body2" color="text.secondary" fontWeight={500} sx={{ mb: 0.5 }}>
            <Tooltip title="When enabled, the bot will immediately retry a failed goal race using an alarm clock. Disable to always continue without retrying." arrow>
              <span>Try again on failed goal</span>
            </Tooltip>
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={g.tryAgainOnFailedGoal}
                onChange={(e) => setGeneral({ tryAgainOnFailedGoal: e.target.checked })}
              />
            }
            label={g.tryAgainOnFailedGoal ? 'Enabled' : 'Disabled'}
          />
        </Box>

        {/* Moved to per-preset Strategy section: prioritizeHint */}
        <Box>
          <Typography variant="body2" color="text.secondary" fontWeight={500} sx={{ mb: 0.5 }}>
            <Tooltip title="Upper bound for allowed failure% on a tile." arrow>
              <span>Max Failure %</span>
            </Tooltip>
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Slider
              value={g.maxFailure}
              onChange={(_, v) => setGeneral({ maxFailure: Number(v) })}
              min={0}
              max={99}
              sx={{ flex: 1 }}
            />
            <Typography variant="body2" sx={{ width: 32, textAlign: 'right' }}>
              {g.maxFailure}
            </Typography>
          </Box>
        </Box>

        <Box>
          <Typography variant="body2" color="text.secondary" fontWeight={500} sx={{ mb: 0.5 }}>
            <Tooltip title="Allows back-to-back racing when conditions are met." arrow>
              <span>Accept consecutive race</span>
            </Tooltip>
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={g.acceptConsecutiveRace}
                onChange={(e) => setGeneral({ acceptConsecutiveRace: e.target.checked })}
              />
            }
            label={g.acceptConsecutiveRace ? 'Enabled' : 'Disabled'}
          />
        </Box>

        <AdvancedSettings />

        {/* Version + Update from GitHub */}
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 0.5 }}>
            Version: <strong>{version}</strong> | Developed by:{' '}
          <Link
            href="https://github.com/Magody/Umaplay"
            target="_blank"
            rel="noopener noreferrer"
            underline="hover"
          >
            Magody
          </Link>
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Button
              size="small"
              variant="contained"
              disabled={updating}
              onClick={async () => {
                try {
                  setUpdating(true)
                  const res = await updateFromGithub()
                  setSnack({ open: true, msg: `Updated successfully (branch: ${res.branch})`, severity: 'success' })
                } catch (e:any) {
                  setSnack({ open: true, msg: e?.message || e?.detail || 'Update failed Check that you are in main branch', severity: 'error' })
                } finally {
                  setUpdating(false)
                }
              }}
            >
              {updating ? 'Updating…' : 'Update from GitHub'}
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="error"
              onClick={() => setConfirmForce(true)}
            >
              Force update
            </Button>
            
          </Box>
          <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 0.5 }}>
            <br></br>
            <strong>Important: RESTART</strong> the cmd / program after updating
          
            
          </Typography>
        </Box>

        {/* Force update confirmation */}
        <Dialog open={confirmForce} onClose={() => setConfirmForce(false)}>
          <DialogTitle>Force update?</DialogTitle>
          <DialogContent>
            <Typography variant="body2">
              This will run a <code>git reset --hard</code> to the remote branch and <code>git pull</code>.
              Any local, uncommitted changes will be lost. Continue?
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmForce(false)}>Cancel</Button>
            <Button
              color="error"
              variant="contained"
              onClick={async () => {
                try {
                  setConfirmForce(false)
                  setUpdating(true)
                  const res = await forceUpdate()
                  setSnack({ open: true, msg: `Force updated (branch: ${res.branch})`, severity: 'success' })
                } catch (e:any) {
                  setSnack({ open: true, msg: e?.message || 'Force update failed', severity: 'error' })
                } finally {
                  setUpdating(false)
                }
              }}
            >
              Yes, force update
            </Button>
          </DialogActions>
        </Dialog>

        

        <Snackbar
          open={snack.open}
          autoHideDuration={2600}
          onClose={() => setSnack(s => ({ ...s, open: false }))}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            onClose={() => setSnack(s => ({ ...s, open: false }))}
            severity={snack.severity}
            variant="filled"
            sx={{ width: '100%' }}
          >
            {snack.msg}
          </Alert>
        </Snackbar>
      </Stack>
      </Box>
    </Section>
  )
}
