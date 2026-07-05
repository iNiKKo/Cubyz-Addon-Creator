async function importExistingAddon(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];

    try {
        const zip = await JSZip.loadAsync(file);
        let namespaceName = file.name.replace('.zip', '').toLowerCase().replace(/[^a-z0-9_]/g, "");

        for (const path of Object.keys(zip.files)) {
            const parts = path.split('/');
            if (parts.length > 1 && parts[0] !== "__MACOSX") {
                namespaceName = parts[0];
                break;
            }
        }

        document.getElementById('addonName').value = namespaceName;

        window.projectData.blocks = [];
        window.projectData.items = [];
        window.projectData.recipes = {};
        window.projectData.biomes = [];
        window.projectData.entities = [];
        window.projectData.particles = [];

        for (const [path, zipEntry] of Object.entries(zip.files)) {
            if (zipEntry.dir || !path.endsWith('.png')) continue;

            const filename = path.split('/').pop().replace('.png', '');
            const isBlockType = path.includes('/blocks/');
            const isEntityType = path.includes('/entityModels/');
            const isParticleType = path.includes('/particles/');

            const base64Data = await zipEntry.async("base64");
            const dataUrl = `data:image/png;base64,${base64Data}`;
            const rawFileBlob = await zipEntry.async("blob");

            if (!window.serverTextures.some(t => t.name === filename)) {
                window.serverTextures.unshift({
                    name: filename,
                    dataUrl: dataUrl,
                    isCustom: true,
                    isBlockType: isBlockType,
                    isEntityType: isEntityType,
                    isParticleType: isParticleType,
                    rawFile: new File([rawFileBlob], `${filename}.png`, { type: "image/png" })
                });
            }
        }

        if (typeof window.rebuildDropdowns === 'function') window.rebuildDropdowns();

        const parseIntegerToHexColor = (numStr, defaultHex) => {
            if (!numStr) return defaultHex;
            let val = parseInt(numStr.trim(), 0);
            if (isNaN(val)) return defaultHex;
            return "#" + (val & 0xFFFFFF).toString(16).padStart(6, '0');
        };

        const extractVal = (contentStr, key, fallback) => {
            const match = contentStr.match(new RegExp(`\\.${key}\\s*=\\s*([^,\\r\\n]+)`));
            return match ? match[1].trim().replace(/^["']|["']$/g, '') : fallback;
        };

        const extractMinMax = (contentStr, key) => {
            const regex = new RegExp(`\\.${key}\\s*=\\s*\\.\\{\\s*\\.min\\s*=\\s*([^,\\s}]+)\\s*,\\s*\\.max\\s*=\\s*([^,\\s}]+)`);
            const match = contentStr.match(regex);
            return match ? { min: parseFloat(match[1]), max: parseFloat(match[2]) } : { min: 0, max: 0 };
        };

        for (const [path, zipEntry] of Object.entries(zip.files)) {
            if (zipEntry.dir) continue;
            const nameToken = path.split('/').pop().replace('.zig.zon', '');

            const parts = path.split('/');
            let extractedSubFolder = "";
            const catIndex = parts.findIndex(p => p === 'blocks' || p === 'items' || p === 'recipes' || p === 'biomes' || p === 'entityModels' || p === 'particles');
            if (catIndex !== -1 && parts.length > catIndex + 2) {
                extractedSubFolder = parts.slice(catIndex + 1, parts.length - 1).join('/');
            }

            if (path.includes('/blocks/') && path.endsWith('.zig.zon')) {
                const content = await zipEntry.async("string");
                const loadedRotation = extractVal(content, 'rotation', 'cubyz:stairs');
                const loadedBaseTexture = content.match(/\.texture\s*=\s*"[^:]+:([^"]+)"/)?.[1] || "stone";

                const getSideTex = (sideKey) => {
                    const sideMatch = content.match(new RegExp(`\\.${sideKey}\\s*=\\s*"[^:]+:([^"]+)"`));
                    return sideMatch ? sideMatch[1] : "";
                };

                let parsedTags = [];
                const tagsMatch = content.match(/\.tags\s*=\s*\.\{\s*([\s\S]*?)\}/);
                if (tagsMatch) {
                    parsedTags = tagsMatch[1].split(',')
                        .map(t => t.trim().replace(/^\./, ''))
                        .filter(t => t.length > 0)
                        .map(t => `.${t}`);
                }

                window.projectData.blocks.push({
                    id: nameToken,
                    subFolder: extractedSubFolder,
                    health: extractVal(content, 'blockHealth', '1'),
                    resistance: extractVal(content, 'blockResistance', '0'),
                    rotation: loadedRotation,
                    collide: !content.includes(".collide = false"),
                    transparent: content.includes(".transparent = true"),
                    replaceable: content.includes(".replaceable = true"),
                    degradable: content.includes(".degradable = true"),
                    viewThrough: content.includes(".viewThrough = true"),
                    alwaysViewThrough: content.includes(".alwaysViewThrough = true"),
                    hasBackFace: content.includes(".hasBackFace = true"),
                    allowOres: content.includes(".allowOres = true"),
                    friction: extractVal(content, 'friction', '20'),
                    bounciness: extractVal(content, 'bounciness', '0.0'),
                    density: extractVal(content, 'density', '1.2'),
                    terminalVelocity: extractVal(content, 'terminalVelocity', '90'),
                    mobility: extractVal(content, 'mobility', '1.0'),
                    emittedLightColor: parseIntegerToHexColor(extractVal(content, 'emittedLight', '0'), '#000000'),
                    absorbedLightColor: parseIntegerToHexColor(extractVal(content, 'absorbedLight', '16777215'), '#ffffff'),
                    dropAuto: !content.includes(".drops ="),
                    dropSearch: content.match(/\.items\s*=\s*\.\{\s*\.\{\s*items\s*=\s*\.\{\s*"([^"]+)"/)?.[1] || "",
                    hasItemIcon: content.includes(".item ="),
                    itemIconSearch: content.match(/\.item\s*=\s*\{\s*\.texture\s*=\s*"([^"]+)\.png"/)?.[1] || "",
                    baseTexture: loadedBaseTexture,
                    callbacks: {
                        touchType: content.includes(".onTouch") ? "hurt" : "none",
                        touchMode: content.includes(".damageType = .heal") ? "heal" : "damage",
                        touchDps: parseFloat(content.match(/\.dps\s*=\s*([^,\r\n]+)/)?.[1]) || 0.6,
                        touchVariant: content.match(/\.damageType\s*=\s*\.([^,\r\n]+)/)?.[1] || "heat",
                        updateType: content.match(/\.onUpdate\s*=\s*\{\s*\.type\s*=\s*\.([^,\r\n]+)/)?.[1] || "none",
                        tickType: content.match(/\.onTick\s*=\s*\{\s*\.type\s*=\s*\.([^,\r\n]+)/)?.[1] || "none",
                        breakType: content.match(/\.onBreak\s*=\s*\{\s*\.type\s*=\s*\.([^,\r\n]+)/)?.[1] || "none",
                        interactType: content.match(/\.onInteract\s*=\s*\.([^,\r\n]+)/)?.[1] || "none",
                        interactWindowName: content.match(/\.onInteract\s*=\s*\{\s*[\s\S]*?\.name\s*=\s*"([^"]+)"/)?.[1] || "crafting_table"
                    },
                    sides: {
                        front: getSideTex('texture2'),
                        left: getSideTex('texture5'),
                        right: getSideTex('texture4'),
                        up: getSideTex('texture0'),
                        bottom: getSideTex('texture1')
                    },
                    tags: parsedTags
                });

            } else if (path.includes('/items/') && path.endsWith('.zig.zon')) {
                const content = await zipEntry.async("string");
                let parsedTags = [];
                const tagsMatch = content.match(/\.tags\s*=\s*\.\{\s*([\s\S]*?)\}/);
                if (tagsMatch) {
                    parsedTags = tagsMatch[1].split(',')
                        .map(t => t.trim().replace(/^\./, ''))
                        .filter(t => t.length > 0)
                        .map(t => `.${t}`);
                }

                window.projectData.items.push({
                    id: nameToken,
                    subFolder: extractedSubFolder,
                    stackSize: extractVal(content, 'stackSize', '120'),
                    foodValue: parseFloat(extractVal(content, 'food', '0.0')),
                    blockPlacement: extractVal(content, 'block', ''),
                    tags: parsedTags,
                    texture: extractVal(content, 'texture', 'stone').replace('.png', ''),
                    colors: ["0xffffffff"],
                    baseColor: "#9c9c9c",
                    material: {
                        durability: content.match(/\.durability\s*=\s*([^,\r\n]+)/)?.[1] || "250",
                        swingSpeed: content.match(/\.swingSpeed\s*=\s*([^,\r\n]+)/)?.[1] || "1.0",
                        textureRoughness: content.match(/\.textureRoughness\s*=\s*([^,\r\n]+)/)?.[1] || "0.0",
                        massDamage: content.match(/\.massDamage\s*=\s*([^,\r\n]+)/)?.[1] || "2.0",
                        hardnessDamage: content.match(/\.hardnessDamage\s*=\s*([^,\r\n]+)/)?.[1] || "2.0",
                        modifierType: content.match(/\.id\s*=\s*\.([^,\r\n]+)/)?.[1] || "none",
                        modifierStrength: content.match(/\.strength\s*=\s*([^,\r\n]+)/)?.[1] || "1.0"
                    }
                });

            } else if (path.includes('/entityModels/') && path.endsWith('.zig.zon')) {
                const content = await zipEntry.async("string");
                let parsedTags = [];
                const tagsMatch = content.match(/\.tags\s*=\s*\.\{\s*([\s\S]*?)\}/);
                if (tagsMatch) {
                    parsedTags = tagsMatch[1].split(',')
                        .map(t => t.trim().replace(/^\./, ''))
                        .filter(t => t.length > 0);
                }

                window.projectData.entities.push({
                    id: nameToken,
                    height: extractVal(content, 'height', '2.0'),
                    coordinateSystem: content.includes('.coordinateSystem = .left_handed_y_up') ? '.left_handed_y_up' : '.right_handed_z_up',
                    model: extractVal(content, 'model', '').replace(/^[^:]+:/, ''),
                    defaultTexture: extractVal(content, 'defaultTexture', '').replace(/^[^:]+:/, ''),
                    tags: parsedTags
                });

            } else if (path.includes('/particles/') && path.endsWith('.zig.zon')) {
                const content = await zipEntry.async("string");
                const speedRange = extractMinMax(content, 'speed');
                const lifeRange = extractMinMax(content, 'lifeTime');
                const densityRange = extractMinMax(content, 'density');
                const rotRange = extractMinMax(content, 'rotationVelocity');
                const dragRange = extractMinMax(content, 'dragCoefficient');
                const directionVectorMatch = content.match(/\.direction\s*=\s*\.\{\s*([^,\s}]+)\s*,\s*([^,\s}]+)\s*,\s*([^,\s}]+)\s*\}/);

                window.projectData.particles.push({
                    id: nameToken,
                    texture: extractVal(content, 'texture', '').replace(/^[^:]+:/, ''),
                    hasEmission: content.includes('_emission'),
                    speedMin: speedRange.min,
                    speedMax: speedRange.max,
                    lifeMin: lifeRange.min,
                    lifeMax: lifeRange.max,
                    densityMin: densityRange.min,
                    densityMax: densityRange.max,
                    rotVelMin: rotRange.min,
                    rotVelMax: rotRange.max,
                    dragMin: dragRange.min,
                    dragMax: dragRange.max,
                    randomRotate: !content.includes('.randomRotate = false'),
                    collides: !content.includes('.collides = false'),
                    shape: extractVal(content, 'shape', 'point'),
                    shapeRadius: extractVal(content, 'radius', '1.0'),
                    shapeSize: extractVal(content, 'size', '1.0'),
                    mode: extractVal(content, 'mode', 'spread'),
                    dirX: directionVectorMatch ? directionVectorMatch[1] : "0.0",
                    dirY: directionVectorMatch ? directionVectorMatch[2] : "0.0",
                    dirZ: directionVectorMatch ? directionVectorMatch[3] : "1.0"
                });

            } else if (path.includes('/recipes/') && path.endsWith('.zig.zon')) {
                const nameToken = path.split('/').pop().replace('.zig.zon', '').replace('_recipes', '');
                const content = await zipEntry.async("string");
                let inputsParsed = [];
                const inputsMatch = content.match(/\.inputs\s*=\s*\.\{\s*([\s\S]*?)\}/);
                if (inputsMatch) {
                    inputsParsed = inputsMatch[1].split(',')
                        .map(i => i.trim().replace(/"/g, ''))
                        .filter(i => i.length > 0);
                }

                window.projectData.recipes[nameToken] = [{
                    inputs: inputsParsed,
                    output: extractVal(content, 'output', '').replace(/"/g, '')
                }];

            } else if (path.includes('/biomes/') && path.endsWith('.zig.zon')) {
                const content = await zipEntry.async("string");
                const parsedStructures = [];
                let startIdx = content.indexOf('.structures');

                if (startIdx !== -1) {
                    let openBrace = content.indexOf('{', startIdx);
                    if (openBrace !== -1) {
                        let idx = openBrace + 1, braceCount = 1, structuresText = "";
                        while (idx < content.length && braceCount > 0) {
                            let char = content[idx];
                            if (char === '{') braceCount++;
                            if (char === '}') braceCount--;
                            if (braceCount > 0) structuresText += char;
                            idx++;
                        }

                        let sIdx = 0;
                        while (sIdx < structuresText.length) {
                            let openObj = structuresText.indexOf('.{', sIdx);
                            if (openObj === -1) break;

                            let subCount = 1, subIdx = openObj + 2, objText = "";
                            while (subIdx < structuresText.length && subCount > 0) {
                                let c = structuresText[subIdx];
                                if (c === '{') subCount++;
                                if (c === '}') subCount--;
                                if (subCount > 0) objText += c;
                                subIdx++;
                            }

                            const lines = objText.split('\n');
                            let attrs = {};
                            lines.forEach(line => {
                                const match = line.trim().match(/^\.(\w+)\s*=\s*(.+?)(?:,)?$/);
                                if (match) {
                                    let val = match[2].trim();
                                    if (val.endsWith(',')) val = val.slice(0, -1).trim();
                                    attrs[match[1].trim()] = val.replace(/^["']|["']$/g, '').replace(/^\.\{\s*["']?|["']?\s*\}$/g, '');
                                }
                            });

                            if (attrs.id) {
                                let structObj = { id: attrs.id, chance: parseFloat(attrs.chance) || 0.05 };
                                if (attrs.id === 'cubyz:simple_tree') {
                                    structObj.log = attrs.log || 'cubyz:oak_log';
                                    structObj.leaves = attrs.leaves || 'cubyz:leaves/oak';
                                    structObj.height = parseInt(attrs.height) || 6;
                                    structObj.height_variation = parseInt(attrs.height_variation) || 3;
                                    structObj.leafRadius = parseFloat(attrs.leafRadius) || 2;
                                } else if (attrs.id === 'cubyz:simple_vegetation') {
                                    structObj.block = attrs.block || 'cubyz:fern';
                                    structObj.height = parseInt(attrs.height) || 1;
                                } else if (attrs.id === 'cubyz:flower_patch') {
                                    structObj.block = attrs.block || attrs.blocks || 'cubyz:daffodil';
                                    structObj.width = parseInt(attrs.width) || 10;
                                    structObj.variation = parseInt(attrs.variation) || 6;
                                    structObj.density = parseFloat(attrs.density) || 0.3;
                                    structObj.priority = 0.1;
                                } else if (attrs.id === 'cubyz:boulder') {
                                    structObj.block = attrs.block || 'cubyz:slate/cobble';
                                    structObj.size = parseInt(attrs.size) || 5;
                                    structObj.size_variance = parseInt(attrs.size_variance) || 4;
                                } else if (attrs.id === 'cubyz:ground_patch') {
                                    structObj.block = attrs.block || 'cubyz:gravel';
                                    structObj.width = parseInt(attrs.width) || 5;
                                    structObj.depth = parseInt(attrs.depth) || 2;
                                    structObj.smoothness = parseFloat(attrs.smoothness) || 0.2;
                                } else if (attrs.id === 'cubyz:fallen_tree') {
                                    structObj.log = attrs.log || 'cubyz:oak_log';
                                    structObj.height = parseInt(attrs.height) || 6;
                                    structObj.height_variation = parseInt(attrs.height_variation) || 3;
                                } else if (attrs.id === 'cubyz:sbb') {
                                    structObj.structure = attrs.structure || '';
                                    structObj.placeMode = attrs.placeMode || '.degradable';
                                }
                                parsedStructures.push(structObj);
                            }
                            sIdx = subIdx;
                        }
                    }
                }

                let climate = "temperate", humidity = "neitherWetNorDry", zone = "inland", growth = "balanced", elevationType = "balanced";
                const properties = [];
                const propMatch = content.match(/\.properties\s*=\s*\.\{\s*([\s\S]*?)\}/);
                if (propMatch) {
                    const props = propMatch[1].split(',').map(p => p.trim().replace(/^\./, '')).filter(p => p.length > 0);
                    props.forEach(p => {
                        properties.push('.' + p);
                        if (['hot', 'temperate', 'cold'].includes(p)) climate = p;
                        if (['wet', 'neitherWetNorDry', 'dry'].includes(p)) humidity = p;
                        if (['inland', 'land', 'ocean'].includes(p)) zone = p;
                        if (['barren', 'balanced', 'overgrown'].includes(p)) growth = p;
                        if (['mountain', 'lowTerrain', 'antiMountain', 'balanced'].includes(p)) elevationType = p;
                    });
                }

                let surfaceBlock = "cubyz:grass", subBlock = "cubyz:soil";
                const groundMatch = content.match(/\.ground_structure\s*=\s*\.\{\s*([\s\S]*?)\}/);
                if (groundMatch) {
                    const lines = groundMatch[1].split(',').map(l => l.trim().replace(/^"|"$/g, '')).filter(l => l.length > 0);
                    if (lines[0]) surfaceBlock = lines[0].replace(/^[\d\s]+to[\d\s]+|^\d+\s+/, '');
                    if (lines[1]) subBlock = lines[1].replace(/^[\d\s]+to[\d\s]+|^\d+\s+/, '');
                }

                window.projectData.biomes.push({
                    id: nameToken,
                    subFolder: extractedSubFolder,
                    chance: extractVal(content, 'chance', '1.0'),
                    interpolation: extractVal(content, 'interpolation', '.square'),
                    minRadius: extractVal(content, 'minRadius', '256'),
                    maxRadius: extractVal(content, 'maxRadius', '320'),
                    smoothBeaches: content.includes('.smoothBeaches = true'),
                    minHeight: extractVal(content, 'minHeight', '20'),
                    maxHeight: extractVal(content, 'maxHeight', '40'),
                    minHeightLimit: extractVal(content, 'minHeightLimit', '7'),
                    maxHeightLimit: extractVal(content, 'maxHeightLimit', '50'),
                    roughness: extractVal(content, 'roughness', '1.0'),
                    hills: extractVal(content, 'hills', '0.0'),
                    mountains: extractVal(content, 'mountains', '0.0'),
                    soilCreep: extractVal(content, 'soilCreep', '1.0'),
                    keepOriginalTerrain: extractVal(content, 'keepOriginalTerrain', '1.0'),
                    surfaceBlock, subBlock,
                    stoneBlock: extractVal(content, 'stoneBlock', 'cubyz:slate/base'),
                    isCave: content.includes('.isCave = true'),
                    caves: extractVal(content, 'caves', '1.0'),
                    caveRadiusFactor: extractVal(content, 'caveRadiusFactor', '1.0'),
                    crystals: extractVal(content, 'crystals', '0'),
                    music: extractVal(content, 'music', 'cubyz:sunrise'),
                    fogDensity: extractVal(content, 'fogDensity', '1.5'),
                    isValidPlayerSpawn: !content.includes('.validPlayerSpawn = false') && !content.includes('.isValidPlayerSpawn = false'),
                    skyColorHex: "#75b2ff", fogColorHex: "#e2f2ff",
                    skyColorVector: ".{ 0.46, 0.70, 1.00 }", fogColorVector: ".{ 0.89, 0.95, 1.00 }",
                    properties, structures: parsedStructures,
                    climate, humidity, zone, growth, elevationType
                });
            }
        }

        if (typeof window.updateSearchableItems === 'function') window.updateSearchableItems();
        if (typeof window.updateSidebarProjectTree === 'function') window.updateSidebarProjectTree();
        alert(`Successfully imported "${file.name}"!`);
    } catch (e) {
        alert(`Failed parsing addon zip payload: ${e.message}`);
    }
}
window.importExistingAddon = importExistingAddon;
