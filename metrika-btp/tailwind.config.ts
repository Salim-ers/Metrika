import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "2rem", screens: { "2xl": "1400px" } },
    extend: {
      colors: {
        // ── Identité de marque Metrika ──────────────────────────
        navy: {
          50: "#eef2f9",
          100: "#d7e0f0",
          200: "#aebfe0",
          300: "#7e96c9",
          400: "#4f6aac",
          500: "#33497f",
          600: "#1f335f",
          700: "#14233f", // marine principal
          800: "#0c1830",
          900: "#0a1a35",
          950: "#02193b", // marine profond (logo)
        },
        gold: {
          50: "#fdf8ec",
          100: "#faedc9",
          200: "#f4d98f",
          300: "#edc155",
          400: "#e7ad33",
          500: "#e1a532", // doré principal (logo)
          600: "#c4861f",
          700: "#9c641b",
          800: "#814f1d",
          900: "#6e421d",
        },
        // ── Tokens sémantiques (shadcn/ui) ──────────────────────
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        success: { DEFAULT: "hsl(var(--success))", foreground: "hsl(var(--success-foreground))" },
        warning: { DEFAULT: "hsl(var(--warning))", foreground: "hsl(var(--warning-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          muted: "hsl(var(--sidebar-muted))",
          accent: "hsl(var(--sidebar-accent))",
          border: "hsl(var(--sidebar-border))",
        },
      },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(2,25,59,0.04), 0 8px 24px -12px rgba(2,25,59,0.12)",
        "card-hover": "0 2px 4px rgba(2,25,59,0.06), 0 16px 40px -16px rgba(2,25,59,0.22)",
        gold: "0 8px 28px -10px rgba(225,165,50,0.55)",
      },
      backgroundImage: {
        "navy-grain":
          "radial-gradient(circle at 20% 0%, rgba(225,165,50,0.10), transparent 45%), radial-gradient(circle at 100% 100%, rgba(31,51,95,0.55), transparent 55%)",
      },
      keyframes: {
        "fade-up": { from: { opacity: "0", transform: "translateY(12px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.22,1,0.36,1) both",
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
