import { createRoot } from "react-dom/client";
import App from "./App";
// Initialize the shared Supabase client and validate its configuration at startup.
import "./models/supabase";
import "./styles/index.css";
createRoot(document.getElementById("root")!).render(<App />);
