# OpenLearn v3 — gesture-controlled CT scanner & linear accelerator (prototype)

A separate repository built from [OpenLearn v2](https://github.com/pbasran/OpenLearnV2). **It does not modify or replace the deployed, IRB-approved v1 apps or v2.** Any use with learners as part of a study needs its own review.

**New in v3: Gesture mode.** Press **✋ Gesture** (top bar). The device camera tracks one hand; the same screen shows the 3D machine and updates as you move.

* Pick an axis chip (linac: gantry, collimator, couch height / in-out / lateral / rotation; CT: table in-out, table height, gantry tilt).
* **Pinch** thumb + index finger and **drag left / right** to set that axis. Open the hand to release.
* **Close your fist** (or lose the hand from view) to stop all motion immediately.
* Gestures only set axis *targets*, so v2's speed limits and collision interlocks still apply. Sliders and Go buttons keep working.
* Runs entirely on the device (MediaPipe Hands, WebAssembly, files bundled in `public/mediapipe/hands`, Apache-2.0). No video is stored or sent. Needs HTTPS and camera permission; it hides itself if the camera is blocked.
* Best on a laptop or a tablet on a stand, with the hand well lit and in view of the front camera. Gesture mode is for the on-screen 3D view; it does not run inside WebXR AR.

Status: prototype. The gesture logic and camera wiring are covered by headless tests (`tools/test-gesture-logic.mjs`, `tools/test-gesture-ui.mjs`, using synthetic hand data and a fake camera). It has **not yet been tried with real hands on a real tablet**.

Everything else (AR on Android, life-size iPad AR page at `/ar/`, easter eggs, models) is inherited from v2; see the v2 README for details.

## Run / build
```
npm ci
npm run dev       # http://127.0.0.1:5200
npm run build     # outputs dist/
```
Open source assets: three.js (MIT), MediaPipe Hands (Apache-2.0). Models derive from the original OpenLearn equipment files.

## Things to know
* Educational models only: dose and CT behaviour are simplified teaching models, not clinical tools.
* Not tested against any third-party training product; designed from first principles. A patent search has not been done by counsel; see your technology-transfer office before wider distribution.
