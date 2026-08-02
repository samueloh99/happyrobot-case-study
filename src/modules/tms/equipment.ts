export type CanonicalEquipment = 'DRY_VAN' | 'REEFER' | 'FLATBED';

export const CANONICAL_EQUIPMENT_TYPES: readonly CanonicalEquipment[] = ['DRY_VAN', 'REEFER', 'FLATBED'];

const ALIASES: Record<string, CanonicalEquipment> = {
  dry_van: 'DRY_VAN',
  'dry van': 'DRY_VAN',
  'dry-van': 'DRY_VAN',
  dryvan: 'DRY_VAN',
  dry: 'DRY_VAN',
  van: 'DRY_VAN',
  vans: 'DRY_VAN',
  drybox: 'DRY_VAN',
  'dry box': 'DRY_VAN',
  '53 foot': 'DRY_VAN',
  '53ft': 'DRY_VAN',
  '53-foot': 'DRY_VAN',
  trailer: 'DRY_VAN',
  v: 'DRY_VAN',
  dv: 'DRY_VAN',

  reefer: 'REEFER',
  reefers: 'REEFER',
  refer: 'REEFER',
  refrigerated: 'REEFER',
  'temp control': 'REEFER',
  'temperature controlled': 'REEFER',
  'temp controlled': 'REEFER',
  chill: 'REEFER',
  chilled: 'REEFER',
  frozen: 'REEFER',
  r: 'REEFER',

  flatbed: 'FLATBED',
  flatbeds: 'FLATBED',
  flat: 'FLATBED',
  flats: 'FLATBED',
  'flat bed': 'FLATBED',
  'flat-bed': 'FLATBED',
  f: 'FLATBED',
  fb: 'FLATBED',
};

export const normalizeEquipment = (raw: string): CanonicalEquipment | null => {
  const key = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  return ALIASES[key] ?? null;
};
