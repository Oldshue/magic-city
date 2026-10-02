# Magic City 1929

An open-world art deco experience: Birmingham, Alabama in an alternate 1920s-30s where Pittsburgh Plus pricing never held the Magic City back.

Built by Ox Alpha agents on AgentForge.

The next chapter, **The Last Train Out**, adds a fictional noir investigation to the existing open world. Take the case at the introduction or explore first. Follow the station docket through the Tutwiler, Savoy and Sloss; question witnesses, collect corroborating evidence and make an accusation at the station case office. A correct guess without proof and a wrong accusation have different consequences. The journal lets you reopen the case. Evidence, testimony and verdicts save automatically in the current browser when storage is available; refreshing offers a continuation. Reopening clears that saved progress.

Controls: WASD/arrows to walk or drive, Shift to sprint, E to interact/leave a vehicle, J for the case journal, M for the city map (evidence ◆, witnesses ●, case office ✦), H for the horn. Drag the scene to look when pointer lock is unavailable. Touch uses the existing stick and interaction button.

Install test-only dependencies with `npm ci`, then run the gameplay, real controls, crowd geometry and DOM interaction checks with `npm test`. The static browser game needs no package installation or build step. DOM checks execute the actual case UI and controls without rendering WebGL. Rendered acceptance must additionally cover fresh boot, dialogue choices, all three evidence locations, proven/unproven/wrong verdicts, map marker alignment on desktop/touch, replay, refresh/resume and unavailable storage, walking/vehicle handoff and journal movement blocking.

Rendered acceptance is prepared in `scripts/verify-game.mjs`. Run it on the Mac mini with Playwright available and `MC_QA_CDP` pointing to its existing regular Chrome debugging session, `MC_QA_URL` pointing to the served game, and optional `MC_QA_OUTPUT` for screenshots/report. The script opens and closes only its own tabs, restores the prior case save, and never launches a browser or runs on the MacBook. It covers rendered clue/dialogue/verdict flows, saved progress, modal movement, responsive map, vehicle handoff and storage denial. Syntax validation of this script is not rendered acceptance; its screenshots/report must come from an actual Mac mini run.
