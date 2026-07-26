export const ACHIEVEMENT_ICON_FILES = {
  godlike: 'godlike.webp',
  tactician: 'tactician.webp',
  underdog: 'underdog.webp',
  dominator: 'dominator.webp',
  close_call: 'close-call.webp',
  flexible_strategist: 'flexible-strategist.webp',
  stabilizer: 'stabilizer.webp',
  strike_fist: 'strike-fist.webp',
  no_one_left: 'no-one-left.webp',
  mentor: 'mentor.webp',
  backbone: 'backbone.webp',
  squad_armor_piercer: 'squad-armor-piercer.webp',
  locomotive: 'locomotive.webp',
  last_stand: 'last-stand.webp',
  reviver: 'reviver.webp',
  armor_piercer: 'armor-piercer.webp',
  survivor: 'survivor.webp',
  clean_work: 'clean-work.webp',
  against_odds: 'against-odds.webp',
  butcher: 'butcher.webp',
  versatile: 'versatile.webp'
} as const;

function buildPublicAssetUrl(baseUrl: string, assetPath: string): string {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '');
  const normalizedAssetPath = assetPath.trim().replace(/^\/+/, '');
  return `${normalizedBaseUrl}/${normalizedAssetPath}`;
}

export function resolveAchievementIconUrl(code: string, baseUrl: string): string | null {
  const iconFile = ACHIEVEMENT_ICON_FILES[code as keyof typeof ACHIEVEMENT_ICON_FILES];
  return iconFile
    ? buildPublicAssetUrl(baseUrl, `achievements/${iconFile}`)
    : null;
}
