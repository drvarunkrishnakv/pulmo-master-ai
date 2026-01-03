const fs = require('fs');
const path = require('path');

const rioPath = path.join(__dirname, 'public/animations/rio.json');
const lottie = JSON.parse(fs.readFileSync(rioPath, 'utf8'));

const colors = {};

function traverse(node) {
    if (!node || typeof node !== 'object') return;

    // Check for color property "k"
    // Properties "c" often denote color in Lottie shapes
    if (node.c && node.c.k && Array.isArray(node.c.k)) {
        const k = node.c.k;
        // Check if it's a simple color array [r,g,b,a] or keyframed
        if (k.length >= 3 && typeof k[0] === 'number') {
            // Simple color
            const hex = rgbToHex(k[0], k[1], k[2]);
            colors[hex] = (colors[hex] || 0) + 1;
        } else if (k.length > 0 && typeof k[0] === 'object') {
            // Keyframed color (less common for static character fills, but possible)
            // Ignoring for now for simplicity, usually base fills are static
        }
    }

    // Recursively check children
    Object.values(node).forEach(traverse);
}

function rgbToHex(r, g, b) {
    const toHex = (c) => {
        const hex = Math.round(c * 255).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    };
    return '#' + toHex(r) + toHex(g) + toHex(b);
}

// Lottie structure usually has "layers" -> "shapes" -> "it" (items)
if (lottie.layers) {
    lottie.layers.forEach(traverse);
}
// Also check assets (precomps)
if (lottie.assets) {
    lottie.assets.forEach(traverse);
}

const sortedColors = Object.entries(colors).sort((a, b) => b[1] - a[1]);
console.log('Colors found:', sortedColors);
