{
  "version": "2.0.0",
  "visualizer": {
    "shader": "\n      let size = input()\n      let pointerDown = input()\n      time = .3*time\n\t  size *= 1.3\n      rotateY(mouse.x * -2 * PI / 2 * (1+nsin(time)))\n      rotateX(mouse.y * 2 * PI / 2 * (1+nsin(time)))\n      metal(.5*size)\n      let rayDir = normalize(getRayDirection())\n      let clampedColor = vec3(rayDir.x+.2, rayDir.y+.25, rayDir.z+.2)\n      color(clampedColor)\n\n      rotateY(sin(getRayDirection().y*8*(ncos(sin(time)))+size))\n\t  rotateX(cos((getRayDirection().x*16*nsin(time)+size)))\n\t  rotateZ(ncos((getRayDirection().z*4*cos(time)+size)))\n      boxFrame(vec3(size), size*.1)\n      shine(0.8*size)\n      blend(nsin(time*(size))*0.1+0.1)\n      sphere(size/2-pointerDown*.3)\n      blend(ncos((time*(size)))*0.1+0.1)\n      boxFrame(vec3(size-.075*pointerDown), size)\n      ",
    "skyboxPreset": 0,
    "scale": 10
  },
  "controls": {
    "target0": {
      "x": 0,
      "y": 0,
      "z": 0
    },
    "position0": {
      "x": -5.072476482807518,
      "y": 3.367778697655204e-16,
      "z": -2.126025007229303
    },
    "zoom0": 1
  },
  "intent": {
    "time_multiplier": 1,
    "minimizing_factor": 0.8,
    "power_factor": 8,
    "pointerDownMultiplier": 0,
    "base_speed": 0.2,
    "easing_speed": 0.6,
    "camTilt": 0,
    "autoRotate": true,
    "autoRotateSpeed": 0.2,
    "fov": 75
  },
  "fx": {
    "passOrder": [
      "glitchPass",
      "bloom",
      "RGBShift",
      "dotShader",
      "technicolorShader",
      "luminosityShader",
      "afterImagePass",
      "sobelShader",
      "colorifyShader",
      "halftonePass",
      "gammaCorrectionShader",
      "kaleidoShader",
      "copyShader",
      "bleachBypassShader",
      "toonShader",
      "outputPass"
    ],
    "bloom": {
      "enabled": false,
      "strength": 1,
      "radius": 0.2,
      "threshold": 0.1
    },
    "toneMapping": {
      "method": 0,
      "exposure": 1.5
    },
    "passes": {
      "rgbShift": false,
      "dot": false,
      "technicolor": false,
      "luminosity": false,
      "afterImage": false,
      "sobel": false,
      "glitch": false,
      "colorify": false,
      "halftone": false,
      "gammaCorrection": false,
      "kaleid": false,
      "outputPass": true
    },
    "params": {
      "rgbShift": {
        "amount": 0.005,
        "angle": 0
      },
      "afterImage": {
        "damp": 0.96
      },
      "colorify": {
        "color": 16777215
      },
      "kaleid": {
        "sides": 6,
        "angle": 0
      }
    }
  },
  "state": {
    "time_multiplier": 1,
    "mouse": {
      "x": -1.1946533878004721,
      "y": 0.8784640884798908,
      "z": 0
    },
    "currMouse": {
      "x": -1.1946875000000001,
      "y": 0.87796875,
      "z": 0
    },
    "size": 0.021142517639995383,
    "pointerDown": 0.68618940391,
    "pointerDownMultiplier": 0,
    "currPointerDown": 0,
    "currAudio": 0.021134737730759755,
    "time": 31.839099999966074,
    "volume_multiplier": 0,
    "minimizing_factor": 0.8,
    "power_factor": 8,
    "base_speed": 0.2,
    "easing_speed": 0.6,
    "camTilt": 0
  }
}