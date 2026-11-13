/** Demo-only (PAC-83 §3.3): "Connect Zoom" in a demo stays local. */
import { mockZoomConnect } from "./clientMocks";

export function demoZoomConnect(): string {
  mockZoomConnect();
  return "Zoom connected (demo)";
}
