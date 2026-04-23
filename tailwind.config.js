/** @type {import('tailwindcss').Config} */
// MedContractIntel brand tokens. Source of truth: /Users/ambamplify/MedContractIntel/med-contract-ops/state/brand-palette.md
export default {
  content: ["./client/**/*.{html,tsx,ts}"],
  theme: {
    extend: {
      colors: {
        // Primary — Medical Green
        brand: {
          DEFAULT: "#1f6e43",
          dark: "#154d2f",
        },
        // Secondary — Insight Gold (shared with EMCI)
        gold: {
          DEFAULT: "#c9a84c",
          dark: "#a58838",
        },
        // Trust Accent — Clinical Blue
        trust: {
          DEFAULT: "#0f4c75",
          light: "#2b8ac9",
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
