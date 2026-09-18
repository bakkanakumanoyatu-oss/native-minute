import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { startDynamicType } from "./lib/dynamic-type";
import "./styles.css";
import "./app-theme.css";

document.documentElement.classList.add("mobile-theme");
const stopDynamicType = startDynamicType(document.documentElement);
if (import.meta.hot) import.meta.hot.dispose(stopDynamicType);

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Mobile application root is missing.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
