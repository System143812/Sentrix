/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172033",
        line: "#d9e1ee",
        mist: "#f5f7fb",
        ocean: "#0f766e",
        signal: "#2563eb",
        "signal-dark": "#1d4ed8",
      },
    },
  },
  plugins: [],
};
