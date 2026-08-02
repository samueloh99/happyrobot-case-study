export type CanonicalEquipment = 'DRY_VAN' | 'REEFER' | 'FLATBED';

export const CANONICAL_EQUIPMENT_TYPES: readonly CanonicalEquipment[] = ['DRY_VAN', 'REEFER', 'FLATBED'];

const REEFER_KEYWORDS = ['reefer', 'refer', 'refrig', 'chill', 'frozen', 'temp control', 'temperature'];
const FLATBED_KEYWORDS = ['flatbed', 'flat bed', 'flat-bed', 'flats', 'flat'];
const DRY_VAN_KEYWORDS = ['dry_van', 'dry van', 'dry-van', 'dryvan', 'drybox', 'dry box', 'dry', 'van', '53 foot', '53ft', '53-foot', 'trailer'];

const CODE_ALIASES: Record<string, CanonicalEquipment> = {
  v: 'DRY_VAN',
  dv: 'DRY_VAN',
  r: 'REEFER',
  f: 'FLATBED',
  fb: 'FLATBED',
};

const includesAny = (haystack: string, needles: readonly string[]): boolean =>
  needles.some((n) => haystack.includes(n));

export const normalizeEquipment = (raw: string): CanonicalEquipment | null => {
  const key = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!key) return null;

  if (CODE_ALIASES[key]) return CODE_ALIASES[key];

  if (includesAny(key, REEFER_KEYWORDS)) return 'REEFER';
  if (includesAny(key, FLATBED_KEYWORDS)) return 'FLATBED';
  if (includesAny(key, DRY_VAN_KEYWORDS)) return 'DRY_VAN';

  return null;
};
