/** @type {import('tailwindcss').Config} */
// MedContractIntel brand tokens v2. Source of truth: /Users/ambamplify/MedContractIntel/med-contract-ops/state/brand-palette.md
// v2 (2026-04-23): removed all blue; dark-green primary, dark-gold secondary, teal accent.
export default {
  content: ["./client/**/*.{html,tsx,ts}"],
  theme: {
    extend: {
      colors: {
        // Primary — Deep Forest Green (dark-green per owner directive)
        brand: {
          DEFAULT: "#0f3d2e",
          dark: "#0a2d20",
          mid: "#1f6e43",
        },
        // Secondary — Heritage Dark Gold
        gold: {
          DEFAULT: "#b8973b",
          bright: "#c9a84c",
          dark: "#8f7020",
        },
        // Accent — Teal (replaces all blue)
        teal: {
          DEFAULT: "#1a9090",
          light: "#25b0a3",
        },
        // Warm Cream background
        cream: "#faf7f0",
        // Ink (green-shifted near-black)
        ink: "#0a1f14",
        muted: "#5a6b60",
      },
    },
  },
  plugins: [],
};
