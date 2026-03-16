{
  "version": "2.0.0",
  "visualizer": {
    "shader": "\n          setMaxIterations(134);\n          setStepSize(0.8419557604208707);\n      \n          let size = input();\n          let pointerDown = input();\n          time *= 0.4229567511894168; // Randomize time multiplier between 0.1 and 1\n          rotateY(mouse.x * -5 * PI / 2 + time - (pointerDown + 0.1));\n          rotateX(mouse.y * 5 * PI / 2 + time);\n      \n          // Set color\n          color(0.32920755230212917, 0.5043095640544508, 0.26575309845171);\n      \n          // Get the current coordinate space once and store in s\n          let s = getSpace();\n      \n          // Add rotations\n          rotateX(getRayDirection().y * 1.4464630014419924 + time);\n          rotateY(getRayDirection().x * 1.4498031990746498 + time);\n          rotateZ(getRayDirection().z * 1.3861954676406127 + time);\n      \n          // Apply metal and shine\n          metal(0.6746175596462811 * size);\n          shine(0.34815140879150924);\n      \n          // Render the shapes\n          boxFrame(vec3(size * 0.945840323634641 - pointerDown * 0.05), size * 0.945840323634641 - pointerDown * 0.05 * 0.1);\nexpand(noise(s * 0.2650943233731633) * 0.03224899579818741); torus(size * 0.6542295922333147 - pointerDown * 0.05, size * 0.6542295922333147 - pointerDown * 0.05 / 4);\nboxFrame(vec3(size * 0.6580502687436584 - pointerDown * 0.05), size * 0.6580502687436584 - pointerDown * 0.05 * 0.1);\nboxFrame(vec3(size * 0.8204477237712443 - pointerDown * 0.05), size * 0.8204477237712443 - pointerDown * 0.05 * 0.1);\n      \n          // Apply blending\n          blend(nsin(time * size) * 0.10041286263718391);\n      \n          // Extra shape\n          sphere(size / 3);\n        ",
    "skyboxPreset": 1,
    "scale": 10
  },
  "controls": {
    "target0": {
      "x": 0,
      "y": 0,
      "z": 0
    },
    "position0": {
      "x": -4.521467174758916,
      "y": 50.88296308796932,
      "z": -27.930651812875322
    },
    "zoom0": 1
  },
  "intent": {
    "time_multiplier": 1,
    "minimizing_factor": 1.2429347826086956,
    "power_factor": 5.891304347826087,
    "pointerDownMultiplier": 0,
    "base_speed": 0.3002173913043478,
    "easing_speed": 0.21315217391304347,
    "camTilt": 0,
    "autoRotate": true,
    "autoRotateSpeed": 8.23586956521739,
    "fov": 156.65217391304347
  },
  "fx": {
    "bloom": {
      "enabled": true,
      "strength": 0.3,
      "radius": 1.0039130434782608,
      "threshold": 0.5434782608695652
    },
    "toneMapping": {
      "method": 1,
      "exposure": 12.739130434782622
    },
    "passes": {
      "rgbShift": false,
      "dot": false,
      "technicolor": false,
      "luminosity": false,
      "afterImage": false,
      "sobel": true,
      "glitch": false,
      "colorify": true,
      "halftone": true,
      "gammaCorrection": true,
      "kaleid": false,
      "outputPass": true
    }
  }
}
