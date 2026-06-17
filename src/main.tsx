import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { useLlmStore } from "./stores/llmStore";
import "./index.css";

useLlmStore.getState().loadConfig();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
