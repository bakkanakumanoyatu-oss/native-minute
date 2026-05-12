import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}", "./services/**/*.{ts,tsx}", "./providers/**/*.{ts,tsx}", "./schemas/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f7f7f9",
          100: "#ececf2",
          200: "#d6d7e2",
          300: "#b1b3c6",
          400: "#7f839f",
          500: "#595d7a",
          600: "#43465e",
          700: "#313345",
          800: "#1f2030",
          900: "#12131f"
        },
        accent: {
          50: "#eefbf8",
          100: "#d5f4ee",
          200: "#a8e7db",
          300: "#70d5c4",
          400: "#3bc0aa",
          500: "#1ca08a",
          600: "#148071",
          700: "#12665c",
          800: "#115148",
          900: "#0d3f39"
        }
      },
      boxShadow: {
        soft: "0 12px 40px rgba(18, 19, 31, 0.12)"
      }
    }
  },
  plugins: []
};

export default config;
