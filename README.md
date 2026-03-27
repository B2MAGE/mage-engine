#MAGE Engine - 
Modular Architecture for Graphics and Effects
This module serves as the main entry point for the MAGE Engine, providing
initialization and access to core components like the engine and controls.

```javascript
import { initMAGE } from './mage-engine.mjs';

Create a MAGE object with the desired configuration options. For example:
const {engine, controls} = initMAGE({
  canvas,
  withControls = true,
  autoStart = false,
  options = { log: true },
})
```

The returned object includes the initialized engine and controls (if created) for further use in your application.
i.e.
```javascript
engine.start() -> Starts rendering inside the canvas element (begins as default preset)
engine.loadPreset(MAGEPreset.SOME_PRESET_JSON) -> Loads a preset from a JSON object or URL
engine.loadAudio('path/to/audio/file.mp3') -> Loads audio from a URL or file
engine.play() -> Plays the currently loaded audio (if not already playing)
engine.pause() -> Pauses the currently playing audio
engine.toPreset() -> returns the current preset as a MAGEPreset instance
```
*/
