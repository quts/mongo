# Planning UI visual reference

The planning HUD follows the user's supplied UI concept and the local tland visual language: cream panels, brown outlines, rounded Huninn type, compact status pills, map controls, illustrated construction tabs and contextual selection cards. The always-visible dashboard sidebar has been removed.

Screenshots are captured from the real Nginx production bundle, not mockups:

- `desktop.png`: Chromium, 1440 × 1000, opening island.
- `phone.png`: WebKit, 390 × 844, DPR 3, opening island.
- `landscape.png`: WebKit, 844 × 390, DPR 3, HQ selection.
- `tablet.png`: WebKit, 1024 × 768, DPR 2, opening island.

The island remains the versioned test LandMask. Trees, flowers, grass grain, shore faces and gabled buildings are render-only scenery. They do not change land eligibility, occupancy, costs, simulation state or save schema. The opening state has no prebuilt village or residents. Exploration, satisfaction and inventory are not represented by nonfunctional controls or invented metrics.

The concept's fully illustrated world and exploration camera are not delivered by this planning UI change. These screenshots are browser automation evidence, not a physical iPhone/Android acceptance test. LAN HTTP remains a read-only preview under the approved secure-origin persistence rules.

Reference inspected: local tland commit `44e1c186c13708176c46bbff5711a49d65d4adc1`, including its HUD, safe-area rules, font, palette and orthographic camera sizing. Only the OFL-licensed unmodified font is copied; see [asset licenses](../../../ASSET_LICENSES.md).
