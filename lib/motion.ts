export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
export const DURATION = { fast: 0.2, base: 0.3 } as const;
export const STAGGER = 0.05;
export const MAX_STAGGERED = 8;

export const enter = { duration: DURATION.base, ease: EASE_OUT } as const;
export const quick = { duration: DURATION.fast, ease: EASE_OUT } as const;
