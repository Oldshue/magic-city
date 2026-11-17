# Magic City 1929

This repository is the source for the original browser game set in alternate-history Birmingham. Preserve the existing controls, investigation saves, and day/night, walking, driving, and patrol loops while improving how the city looks and plays.

- Use `npm ci` and `npm test` for source and interaction checks. Serve the repository root over HTTP to run the game locally. See the README for rendered gameplay checks.
- For world and renderer changes, verify the affected route in Chrome at 1920×1080. Record whether it was a moving or stationary sample and check both daylight and night when relevant.
- On handoff, give the next agent the pushed branch and commit, the playable build when published, the checks that actually ran, and the next concrete change in the commit or pull request. Publish verified releases through the existing GitHub Pages deployment from `main`.
