export const PLACEHOLDER = `/placeholder_card.png`; // add a neutral image; UI will fallback to this on final error.

/**
 * Sx for an <img> (or a Box component="img") that fills its container's
 * width, up to `maxHeight`. Past that, the browser caps by height instead
 * and scales width down to match (native max-width+max-height letterboxing,
 * no JS/measurement needed) so a wide container never stretches the image
 * taller than intended -- aspect ratio is always preserved, image is
 * centered when narrower than the container.
 */
export function capHeightImgSx(maxHeight: number) {
  return {
    display: 'block',
    maxWidth: '100%',
    maxHeight,
    width: 'auto',
    height: 'auto',
    margin: '0 auto',
    objectFit: 'contain',
  } as const
}

export const supportTypeIcons: Record<string, string> = {
  SPD: '/icons/support_card_type_spd.png',
  STA: '/icons/support_card_type_sta.png',
  PWR: '/icons/support_card_type_pwr.png',
  GUTS: '/icons/support_card_type_guts.png',
  WIT: '/icons/support_card_type_wit.png',
  PAL: '/icons/support_card_type_friend.png',
  GRP: '/icons/support_card_type_group.png',
  None: '/icons/support_card_type_wit.png', // fallback
}

export const supportRarityIcons: Record<string, string> = {
  SSR: '/icons/support_rarity_ssr.png',
  SR: '/icons/support_rarity_sr.png',
  R: '/icons/support_rarity_r.png',
}

export function supportImageCandidates(name: string, rarity: any, attr: any) {
  const base = `/events/support`
  const NAME = name
  const ATTR = (attr || 'None').toUpperCase()
  const RAR  = rarity || 'None'
  return [
    `${base}/${NAME}_${ATTR}_${RAR}.png`,
  ]
}

export function scenarioImageCandidates(name: string) {
  const base = `/events/scenario`
  return [
    `${base}/${name}.png`,
  ]
}

export function traineeImageCandidates(name?: string, thumbUrl?: string | null) {
  const candidates: string[] = [`/events/trainee/${name}_profile.png`]
  if (thumbUrl) candidates.push(thumbUrl)
  return candidates
}

