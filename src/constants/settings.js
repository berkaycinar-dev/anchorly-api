export const THEMES = [
  "gray",
  "purple",
  "blue",
  "red",
  "green",
  "pink",
  "black",
];

export const LANGUAGES = ["tr", "en"];

export const FONT_FAMILIES = ["Inter", "Poppins", "Manrope"];

export const WEEK_START_DAYS = ["monday", "sunday"];

export const DASHBOARD_CARD_SIZES = ["small", "wide"];

export const DASHBOARD_CARD_ID_MAX_LENGTH = 40;

export const DASHBOARD_LAYOUT_MAX_CARDS = 20;

export const TIMEZONE_MAX_LENGTH = 64;

export const DEFAULT_SETTINGS = {
  theme: "gray",
  language: "tr",
  fontFamily: "Inter",
  weekStartDay: "monday",
  timezone: "UTC",
  dashboardLayout: [
    { id: "todayRing", size: "small" },
    { id: "weeklyRoutine", size: "small" },
    { id: "upcoming", size: "wide" },
  ],
};
