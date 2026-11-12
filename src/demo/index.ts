/**
 * PAC-83 (contract §4.2): the demo bundle's sentinel. The demo label renders
 * it (`data-demo-bundle`), so it is present in every non-production build and
 * absent from a production one; `make demo-check` searches both.
 */
export const DEMO_BUNDLE_MARKER = "paceday-demo-bundle-v1";
