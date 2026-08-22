export const NEWSROOM_THEMES = [
  {
    id: "newsroom",
    label: "Newsroom",
    description: "Deep forest green. The default.",
    scheme: "Dark",
  },
  { id: "slate", label: "Slate", description: "Cool blue-grey, same depth.", scheme: "Dark" },
  {
    id: "daylight",
    label: "Daylight",
    description: "Light, with the green kept.",
    scheme: "Light",
  },
  { id: "newsprint", label: "Newsprint", description: "Warm paper neutral.", scheme: "Light" },
] as const;

export type NewsroomThemeId = (typeof NEWSROOM_THEMES)[number]["id"];

export const DEFAULT_THEME: NewsroomThemeId = "newsroom";
export const THEME_STORAGE_KEY = "storyrail:newsroom-theme:v1";

export function isNewsroomTheme(value: unknown): value is NewsroomThemeId {
  return NEWSROOM_THEMES.some((theme) => theme.id === value);
}

/** Reading and writing browser storage can throw outright in some privacy modes. */
export function readStoredTheme(): NewsroomThemeId {
  try {
    const stored = globalThis.localStorage?.getItem(THEME_STORAGE_KEY);
    return isNewsroomTheme(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(theme: NewsroomThemeId): void {
  try {
    globalThis.document?.documentElement.setAttribute("data-theme", theme);
  } catch {
    /* nothing to apply outside a document */
  }
  try {
    globalThis.localStorage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* the choice simply will not persist */
  }
}
