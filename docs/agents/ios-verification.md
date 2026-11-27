# Native iPhone verification

Reuse the one booted iPhone simulator. Open Cashflow with fixtures so a UI pass can start at the relevant screen without signing in or importing bank data.

1. Run `pnpm qa:install` on the first pass or after a native change. If app config or a native plugin changed, run `pnpm exec expo prebuild --platform ios` first to update the generated project. The helper builds the debug app for the booted simulator, installs it, and points it to fixture Metro on 8097.
2. Run `pnpm qa` and leave it running during the pass. Other fixtures: `pnpm qa payday` (the salary arrived today, cash left from earlier cycles), `pnpm qa nobank` (the bank sent no balances), `pnpm qa empty` (first-cycle empty state). Restart Metro when changing fixtures. All fixtures use fake data and skip auth and bank sync.
3. Open a scene with `pnpm qa:open budgets|shared|budget-detail|shared-detail|cycle|spending`. Accept the initial iOS Open prompt if it appears. Use `agent-device open com.sevastian.cashflow --platform ios --foreground`, then drive the native controls. Confirm Metro on 8097 received the bundle request.
4. Capture a screenshot of each changed state and verify its controls with `agent-device snapshot -i`. Record what you did and where the evidence is. Walk forward, Back, and re-entry. For forms, bring up the keyboard and check that the field and save action remain reachable. Try large text and Reduce Motion when they affect the flow.
5. Close your agent-device session and stop the fixture Metro you started.

## Budget pass

- Budgets is the first tab. It opens on the current salary cycle with Personal selected. Check "Left in budgets" and "In the bank" sit together. In `budgets` the personal balance is fresh and the joint balance is three days old (amber "Last synced"). Switch to Shared: the joint top-ups count in neither budget, joint purchases count in full. Go to an older cycle: the bank line says it is today's balance, not the cycle's. In `nobank` the line says there is no balance instead of 0. In `payday` the new cycle starts with the usual limits and nothing spent.
- Open Cycle. It opens on the current salary cycle. Drag to the previous cycle, then go back once more. The next older dot grows in if there is older data, and the extra dots shrink away again as you come forward. Each number burns in with a heat sweep when its page lands, then settles into its ink. Return to current and open Budget status on its right.
- Open Budgets. Expand and collapse a parent. Open a child, then Back. The child uses its parent's colour and shows its spending for that cycle. Tap Previous cycle and verify the dates and amounts change. Check the ends of history.
- Open Where it went. Tap a category and check that its total agrees with the charge list. The Leisure fixture contains one purchase split between Coffee and Gifts. Check that Coffee shows only its share. The report also has an Uncategorized row.
- Open the budget editor and check the keyboard, layout and dismissed state. Fixture mode is read-only. Verify real writes in an isolated test environment when changing persistence.

The simulator can verify layout, gestures and navigation. Check physical haptics on an iPhone when modifying their feel. Keep screenshots and videos from personal accounts private.
