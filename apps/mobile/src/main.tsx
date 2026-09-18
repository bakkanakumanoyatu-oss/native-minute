import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./app-theme.css";

document.documentElement.classList.add("mobile-theme");

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Mobile application root is missing.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
