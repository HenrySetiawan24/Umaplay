export type SkillRarity = 'normal' | 'gold' | 'unique'

export type Skill = {
  name: string
  description?: string
  icon_filename?: string
  color_class?: string
  rarity?: SkillRarity
  grade_symbol?: string
  category?: string
}

export type RaceInstance = {
  year_label: string
  year_int: number
  date_text: string
  month: number
  day: number
  surface: string
  course_hint?: string
  location?: string
  distance_category: string
  distance_text: string
  distance_m: number
  banner_url?: string
  public_banner_path?: string
  ribbon_src?: string
  ribbon_code?: string
  rank: 'PRE-OP' | 'EX' | 'OP' | 'G3' | 'G2' | 'G1' | string
}

export type RacesMap = Record<string, RaceInstance[]>

export interface CharacterGoal {
  order: number
  turn: number
  year: number
  month: number
  day: number
  race_name: string
  cond_type?: number
  cond_value?: number
}

export interface CharacterEntry {
  char_id: number
  name_en: string
  name_jp: string
  card_id: number
  slug: string
  playable: boolean
  goal_count: number
  image_url: string
  thumb_url: string
  goals: CharacterGoal[]
}

export type CharacterIndex = Record<string, CharacterEntry>
