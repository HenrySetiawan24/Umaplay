import { Autocomplete, Avatar, TextField, Box, Typography } from '@mui/material'
import { useCharactersData } from '@/hooks/useCharactersData'
import { useConfigStore } from '@/store/configStore'
import type { CharacterEntry } from '@/models/datasets'

function proxiedThumbUrl(entry: CharacterEntry): string {
  return `${entry.thumb_url}`
}

function AvatarWithFallback({ entry, sx }: { entry: CharacterEntry; sx?: Record<string, unknown> }) {
  return (
    <Avatar
      src={proxiedThumbUrl(entry)}
      sx={sx}
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = 'none'
      }}
    >
      {entry.name_en.charAt(0)}
    </Avatar>
  )
}

export default function CharacterSelector({ presetId }: { presetId: string }) {
  const preset = useConfigStore((s) => {
    for (const sc of Object.values(s.config.scenarios ?? {})) {
      for (const p of sc.presets ?? []) {
        if (p.id === presetId) return p
      }
    }
    return undefined
  })
  const patchPreset = useConfigStore((s) => s.patchPreset)
  const { data: index, isLoading } = useCharactersData()

  const options: CharacterEntry[] = Object.values(index ?? {})
    .filter((c) => c.playable)
    .sort((a, b) => a.name_en.localeCompare(b.name_en))

  const selected = options.find((c) => c.char_id === preset?.charId) ?? null

  return (
    <Autocomplete
      options={options}
      value={selected}
      getOptionLabel={(opt) => `${opt.name_en} (${opt.name_jp})`}
      renderOption={(props, opt) => (
        <Box component="li" {...props} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AvatarWithFallback entry={opt} sx={{ width: 32, height: 32 }} />
          <Box>
            <Typography variant="body2" fontWeight={600}>{opt.name_en}</Typography>
            <Typography variant="caption" color="text.secondary">{opt.name_jp}</Typography>
          </Box>
        </Box>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Trainee Uma"
          placeholder="Search character..."
          size="small"
        />
      )}
      onChange={(_, value) => patchPreset(presetId, 'charId', value?.char_id ?? null)}
      isOptionEqualToValue={(opt, val) => opt.char_id === val.char_id}
      loading={isLoading}
      size="small"
      sx={{ maxWidth: 400 }}
    />
  )
}
