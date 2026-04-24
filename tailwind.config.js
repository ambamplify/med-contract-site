/** @type {import('tailwindcss').Config} */
// MedContractIntel brand tokens v3. Source of truth: /Users/ambamplify/MedContractIntel/med-contract-ops/state/brand-palette.md
// v3 (2026-04-23 PM): single-tier near-black forest green primary + bronzed gold + vivid teal.
export default {
  content: ["./client/**/*.{html,tsx,ts}"],
  theme: {
    extend: {
      colors: {
        // Primary — Near-black forest green. Single tier; darker variant for hover only.
        brand: {
          DEFAULT: "#061e15",
          dark: "#02110a",
          mid: "#061e15",
        },
        // Secondary — Bronzed heritage gold (less yellow, more metallic)
        gold: {
          DEFAULT: "#9c7e2e",
          bright: "#b89a3e",
          dark: "#6e5a20",
        },
        // Accent — Vivid teal
        teal: {
          DEFAULT: "#1db5b5",
          light: "#2dd4bf",
        },
        // Warm Cream background
        cream: "#f7f4ec",
        // Ink (green-shifted near-black)
        ink: "#0a1f14",
        muted: "#5a6b60",
      },
    },
  },
  plugins: [],
};
