export function deduplicate<T>(array: T[], compare?: (a: T, b: T) => boolean) {
  if (!compare) {
    return Array.from(new Set(array));
  }
  return array.filter((item, index, self) => self.findIndex((t) => compare(t, item)) === index);
}
