type ClassValue = string | false | null | undefined;

/** Joins conditional class names. */
export function cn(...classes: ClassValue[]) {
  return classes.filter(Boolean).join(' ');
}
