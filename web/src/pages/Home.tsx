import { Container, Stack, Box, Tabs, Tab, Paper, TextField, MenuItem, useTheme, useMediaQuery } from '@mui/material'
import GeneralForm from '@/components/general/GeneralForm'
import TopSaveBar from '@/components/common/TopSaveBar'
import { useEffect, useRef, useState } from 'react'
import { useConfigStore } from '@/store/configStore'
import { useNavPrefsStore } from '@/store/navPrefsStore'
import PresetsTabs from '@/components/presets/PresetsTabs'
import { PresetSettingsSection, PresetEventSection, PresetSkillsSchedulerSection, PresetRaceSchedulerSection } from '@/components/presets/PresetPanel'
import ShopPrefs from '@/components/nav/ShopPrefs'
import TeamTrialsPrefs from '@/components/nav/TeamTrialsPrefs'
import DailyActionsBar from '@/components/nav/DailyActionsBar'
import RunHistory from '@/components/history/RunHistory'
import LogsView from '@/components/logviewer/LogsView'
import BotControl from '@/components/common/BotControl'

type TabKey = 'scenario' | 'daily_trials' | 'history' | 'logs'

const TAB_ITEMS: { value: TabKey; label: string }[] = [
  { value: 'scenario', label: 'Scenario setup' },
  { value: 'daily_trials', label: 'Daily & Trials' },
  { value: 'history', label: 'Run History' },
  { value: 'logs', label: 'Logs' },
]

export default function Home() {
  const saveLocal = useConfigStore((s) => s.saveLocal)
  const config = useConfigStore((s) => s.config)
  const theme = useTheme()
  const isWide = useMediaQuery(theme.breakpoints.up(1400))
  const isMd = useMediaQuery(theme.breakpoints.up('md'))
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))
  const [tab, setTab] = useState<TabKey>('scenario')
  const configLoadedRef = useRef(false)

  useEffect(() => {
    const configState = useConfigStore.getState()
    if (!configLoadedRef.current) {
      configState.loadLocal()
      configLoadedRef.current = true
    }

    const navState = useNavPrefsStore.getState()
    if (!navState.loaded && !navState.loading) {
      navState.load().catch(() => {})
    }
  }, [])

  // auto-save (debounced) whenever config changes
  useEffect(() => {
    const t = setTimeout(() => saveLocal(), 300)
    return () => clearTimeout(t)
  }, [config, saveLocal])

  return (
    <Container maxWidth={false} sx={{ py: 4, px: { xs: 2, sm: 3 } }}>
      <Stack spacing={3}>
        <Paper
          elevation={1}
          sx={{
            borderRadius: 3,
            overflow: 'hidden',
            position: 'sticky',
            top: 8,
            zIndex: (theme) => theme.zIndex.appBar,
            bgcolor: (theme) => theme.palette.mode === 'dark' ? theme.palette.background.paper : '#ffffff',
            border: (theme) => `1px solid ${theme.palette.divider}`,
            background: (theme) =>
              theme.palette.mode === 'dark'
                ? theme.palette.background.paper
                : 'linear-gradient(to bottom, #ffffff 0%, #fafafa 100%)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.75, sm: 1.5 }, pr: { xs: 1, sm: 2 } }}>
            {isXs ? (
              <TextField
                select
                size="small"
                value={tab}
                onChange={(e) => setTab(e.target.value as TabKey)}
                sx={{
                  flex: 1,
                  minWidth: 0,
                  mx: 1,
                  my: 1,
                  '& .MuiInputBase-input': { fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, fontSize: 13 },
                }}
              >
                {TAB_ITEMS.map((t) => (
                  <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                ))}
              </TextField>
            ) : (
            <Tabs
              value={tab}
              onChange={(_, next) => setTab(next)}
              variant="scrollable"
              scrollButtons="auto"
              allowScrollButtonsMobile
              sx={{
                flex: 1,
                minWidth: 0,
                px: { xs: 1, sm: 2 },
              '& .MuiTab-root': {
                minHeight: 56,
                textTransform: 'uppercase',
                fontWeight: 700,
                letterSpacing: 1,
                fontSize: { xs: 13, sm: 14 },
                px: { xs: 2.5, sm: 3.5 },
                py: 1.5,
                transition: 'all 0.2s ease-in-out',
                borderRadius: 2,
                mx: 0.5,
                '&:hover': {
                  bgcolor: (theme) =>
                    theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                },
              },
              '& .MuiTabs-indicator': {
                display: 'flex',
                justifyContent: 'center',
                height: 3,
                bottom: 8,
              },
              '& .MuiTabs-indicatorSpan': {
                maxWidth: 40,
                width: '100%',
                borderRadius: 999,
                backgroundColor: (theme) => theme.palette.primary.main,
                boxShadow: (theme) => `0 0 8px ${theme.palette.primary.main}40`,
              },
              '& .MuiTab-root.Mui-selected': {
                color: (theme) => theme.palette.primary.main,
                fontWeight: 800,
              },
              '& .MuiTab-root:not(.Mui-selected)': {
                color: (theme) => theme.palette.text.secondary,
              },
            }}
            TabIndicatorProps={{ children: <span className="MuiTabs-indicatorSpan" /> }}
            textColor="primary"
            indicatorColor="primary"
          >
            <Tab value="scenario" label="Scenario setup" />
            <Tab value="daily_trials" label="Daily &amp; Trials" />
            <Tab value="history" label="Run History" />
            <Tab value="logs" label="Logs" />
          </Tabs>
            )}
          <DailyActionsBar />
          <TopSaveBar />
          <Box sx={{ ml: { xs: 1, sm: 2 }, flexShrink: 0 }}>
            <BotControl />
          </Box>
          </Box>
        </Paper>

        <Box sx={{ display: tab === 'scenario' ? 'block' : 'none' }}>
          <Box
            sx={{
              display: 'grid',
              gap: 3,
              gridTemplateColumns: isWide
                ? { xs: '1fr', md: 'minmax(300px, 420px) minmax(420px, 2fr) minmax(360px, 2fr)' }
                : { xs: '1fr', md: '1fr 1fr' },
              alignItems: 'start',
              '& > .col': { minWidth: 0, width: '100%' },
            }}
          >
            {/* Column 1 (xs: General+Tabs+Settings+Strategy+Skills; medium: General+Tabs+Skills; wide: General+Tabs) */}
            <Box className="col" sx={{
              gridColumn: { xs: '1 / -1', md: 1 },
            }}>
              <Stack spacing={3}>
                <GeneralForm />
                <PresetsTabs />
                {!isMd && <PresetSettingsSection />}
                {!isWide && <PresetSkillsSchedulerSection />}
              </Stack>
            </Box>

            {/* Column 2 (wide only): Settings + Skills */}
            {isWide && (
              <Box className="col">
                <Stack spacing={3}>
                  <PresetSettingsSection />
                  <PresetSkillsSchedulerSection />
                </Stack>
              </Box>
            )}

            {/* Column 2/3 (medium: Preset+Strategy+Event+RaceSched; wide: Strategy+Event+RaceSched) */}
            <Box className="col" sx={{
              gridColumn: { xs: '1 / -1', md: isWide ? 3 : 2 },
            }}>
              <Stack spacing={3}>
                {isMd && !isWide && <PresetSettingsSection />}
                <PresetEventSection />
                <PresetRaceSchedulerSection />
              </Stack>
            </Box>
          </Box>
        </Box>
        <Box sx={{ display: tab === 'daily_trials' ? 'block' : 'none' }}>
          <Box sx={{
            display: 'grid',
            gap: 3,
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
            alignItems: 'start',
          }}>
            <ShopPrefs />
            <TeamTrialsPrefs />
          </Box>
        </Box>
        <Box sx={{ display: tab === 'history' ? 'block' : 'none' }}>
          <RunHistory />
        </Box>
        <Box sx={{ display: tab === 'logs' ? 'block' : 'none' }}>
          <LogsView />
        </Box>
      </Stack>
    </Container>
  )
}
