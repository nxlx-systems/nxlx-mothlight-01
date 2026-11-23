/*{
    "ISFVSN": "2",
    "DESCRIPTION": "Mothlight.Colour, the last stage: colours the picture by brightness, sets its brightness and contrast, and can send out plain mono or a hard matte for masking.",
    "CREDIT": "NXLX.Systems and contributors",
    "CATEGORIES": [
        "Filter",
        "Color"
    ],
    "COST": "low: one texture read and one colour map a pixel",
    "INPUTS": [
        {
            "NAME": "inputImage",
            "TYPE": "image"
        },
        {
            "NAME": "palette",
            "LABEL": "Palette",
            "TYPE": "long",
            "VALUES": [0, 1, 2, 3],
            "LABELS": ["Original", "Spectrum", "Two tone", "Heat"],
            "DEFAULT": 1
        },
        {
            "NAME": "hue",
            "LABEL": "Hue",
            "TYPE": "float",
            "MIN": 0.0,
            "MAX": 1.0,
            "DEFAULT": 0.55
        },
        {
            "NAME": "spread",
            "LABEL": "Range",
            "TYPE": "float",
            "MIN": 0.0,
            "MAX": 1.5,
            "DEFAULT": 0.7
        },
        {
            "NAME": "sat",
            "LABEL": "Saturation",
            "TYPE": "float",
            "MIN": 0.0,
            "MAX": 1.5,
            "DEFAULT": 1.0
        },
        {
            "NAME": "bright",
            "LABEL": "Brightness",
            "TYPE": "float",
            "MIN": 0.0,
            "MAX": 2.0,
            "DEFAULT": 1.1
        },
        {
            "NAME": "contrast",
            "LABEL": "Contrast",
            "TYPE": "float",
            "MIN": 0.0,
            "MAX": 3.0,
            "DEFAULT": 1.25
        },
        {
            "NAME": "mode",
            "LABEL": "Output mode",
            "TYPE": "long",
            "VALUES": [0, 1, 2],
            "LABELS": ["Colour", "Mono", "Matte"],
            "DEFAULT": 0
        },
        {
            "NAME": "invert",
            "LABEL": "Invert",
            "TYPE": "long",
            "VALUES": [0, 1],
            "LABELS": ["Off", "On"],
            "DEFAULT": 0
        },
        {
            "NAME": "matte",
            "LABEL": "Matte level",
            "TYPE": "float",
            "MIN": 0.0,
            "MAX": 1.0,
            "DEFAULT": 0.5
        },
        {
            "NAME": "soft",
            "LABEL": "Matte softness",
            "TYPE": "float",
            "MIN": 0.0,
            "MAX": 0.5,
            "DEFAULT": 0.04
        }
    ]
}*/
// SPDX-FileCopyrightText: 2026 NXLX.Systems and contributors
// SPDX-License-Identifier: Apache-2.0
// An original shader written for Mothlight No.01 and nxlx.mastercontrol.

// Everything before this stage works in brightness, so this is the only place colour is decided. It runs after the
// feedback loop, so nothing here can flip from frame to frame.

const float TAU = 6.2831853;

// a fully bright colour at any hue, so a palette never dims the picture
vec3 wheel(float h) {
    vec3 c = 0.5 + 0.5 * cos(TAU * (h + vec3(0.0, 0.33, 0.67)));
    return c / max(c.r, max(c.g, c.b));
}

vec3 hueTurn(vec3 c, float a) {
    float cs = cos(a * TAU);
    float sn = sin(a * TAU);
    vec3 k = vec3(0.57735);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    vec3 c = IMG_THIS_NORM_PIXEL(inputImage).rgb;
    c = clamp((c - 0.5) * contrast + 0.5, 0.0, 1.0);
    float x = dot(c, vec3(0.299, 0.587, 0.114));

    vec3 col = hueTurn(c, hue);
    if (palette == 1) {
        col = wheel(x * spread + hue) * sqrt(x);
    }
    if (palette == 2) {
        col = mix(wheel(hue), wheel(hue + spread * 0.5), x) * smoothstep(0.0, 0.2, x);
    }
    if (palette == 3) {
        col = hueTurn(clamp(vec3(x * 3.0, x * 3.0 - 1.0, x * 3.0 - 2.0), 0.0, 1.0), hue - 0.55);
    }
    float grey = dot(col, vec3(0.299, 0.587, 0.114));
    col = clamp(mix(vec3(grey), col, sat) * bright, 0.0, 1.0);

    if (mode == 1) {
        col = vec3(clamp(x * bright, 0.0, 1.0));
    }
    if (mode == 2) {
        col = vec3(smoothstep(matte - soft - 0.002, matte + soft + 0.002, x));
    }
    if (invert == 1) {
        col = 1.0 - col;
    }
    gl_FragColor = vec4(col, 1.0);
}
