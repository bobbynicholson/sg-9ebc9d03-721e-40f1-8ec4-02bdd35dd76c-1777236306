// Import first in runtime entry points, before application modules can log.
import { installConsoleRedaction } from "@/lib/consoleRedaction";
installConsoleRedaction();
