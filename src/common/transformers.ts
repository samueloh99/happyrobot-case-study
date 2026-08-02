export const emptyToUndef = ({ value }: { value: unknown }): unknown =>
  value === '' || value === null ? undefined : value;

export const stringToInt = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'string') {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : value;
  }
  return value;
};

export const stringToOptionalInt = ({ value }: { value: unknown }): unknown => {
  if (value === '' || value === null || value === undefined) return undefined;
  return stringToInt({ value });
};
