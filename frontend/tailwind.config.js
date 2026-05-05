/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: [
          "JetBrains Mono",
          "Fira Code",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      colors: {
        terminal: {
          bg: "#05070d",
          panel: "#0a0f1a",
          border: "#13202e",
          neon: "#00f6ff",
          alert: "#ff2d6f",
          warn: "#ffb347",
          ok: "#39ff7a",
          dim: "#5f7a99",
        },
      },
      boxShadow: {
        neon: "0 0 12px rgba(0, 246, 255, 0.45), 0 0 32px rgba(0, 246, 255, 0.18)",
        alert:
          "0 0 12px rgba(255, 45, 111, 0.55), 0 0 32px rgba(255, 45, 111, 0.18)",
        ok: "0 0 12px rgba(57, 255, 122, 0.5), 0 0 32px rgba(57, 255, 122, 0.18)",
      },
      keyframes: {
        flicker: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.85" },
        },
        scanline: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
        pulseAlert: {
          "0%, 100%": { boxShadow: "0 0 0 rgba(255, 45, 111, 0)" },
          "50%": { boxShadow: "0 0 24px rgba(255, 45, 111, 0.7)" },
        },
      },
      animation: {
        flicker: "flicker 2.4s infinite",
        scanline: "scanline 6s linear infinite",
        pulseAlert: "pulseAlert 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
