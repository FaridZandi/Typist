// Browser entry point. Kept separate from main.js so the app module can be
// imported and initialised explicitly by tests without side effects on import.

import { initTypingApp } from "./main.js";
import { installDataPortability } from "./data-portability.js";

initTypingApp();
installDataPortability();
