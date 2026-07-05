window.serverBlocks = [];
window.serverItems = [];
window.serverTextures = [];
window.serverMusicList = [];
window.serverEntityModels = [];
window.serverParticles = [];
window.blockTexturesOnly = [];
window.itemTexturesOnly = [];
window.particleTexturesOnly = [];
window.allSearchableItems = [];
window.dropdownsGenerated = false;
window.VERSION_PATH = "0.3.0";

window.hasUnsavedChanges = false;
window.currentPanelName = null;
window.editingId = null;

window.projectData = {
    blocks: [],
    items: [],
    recipes: {},
    biomes: [],
    entities: [],
    particles: []
};

window.metricsExpandedState = false;
window.metricCounts = { blocks: 0, items: 0, blockTex: 0, itemTex: 0, music: 0, entities: 0, particles: 0 };

async function loadServerAssets() {
    const statusEl = document.getElementById('folderStatus');
    if (statusEl) {
        statusEl.innerText = "Connecting to 0.3.0 database...";
        statusEl.className = "status-badge";
    }

    try {
        const [blocksRes, itemsRes, texturesRes, recipesRes, musicRes, entitiesRes, particlesRes] = await Promise.all([
            fetch(`${window.VERSION_PATH}/blocks.json`),
            fetch(`${window.VERSION_PATH}/items.json`),
            fetch(`${window.VERSION_PATH}/textures.json`),
            fetch(`${window.VERSION_PATH}/recipes.json`).catch(() => null),
            fetch(`${window.VERSION_PATH}/music.json`).catch(() => null),
            fetch(`${window.VERSION_PATH}/entity_models.json`).catch(() => null),
            fetch(`${window.VERSION_PATH}/particles.json`).catch(() => null)
        ]);

        if (!blocksRes.ok || !itemsRes.ok || !texturesRes.ok) {
            throw new Error("One or more manifests are missing on the server.");
        }

        window.serverBlocks = await blocksRes.json();
        window.serverItems = await itemsRes.json();
        const rawTexturesList = await texturesRes.json();

        window.serverRecipesList = [];
        if (recipesRes && recipesRes.ok) window.serverRecipesList = await recipesRes.json();

        window.serverMusicList = [];
        if (musicRes && musicRes.ok) {
            const rawTracks = await musicRes.json();
            window.serverMusicList = rawTracks.map(track => `cubyz:${track}`);
        }

        window.serverEntityModels = [];
        if (entitiesRes && entitiesRes.ok) {
            window.serverEntityModels = await entitiesRes.json();
        }

        window.serverParticles = [];
        if (particlesRes && particlesRes.ok) {
            window.serverParticles = await particlesRes.json();
        }

        updateSearchableItems();

        window.blockTexturesOnly = [];
        window.itemTexturesOnly = [];
        window.particleTexturesOnly = [];

        window.serverTextures = rawTexturesList.map(fullTexturePath => {
            let shortName = fullTexturePath;
            let isBlockTexture = false;
            let isEntityTexture = false;
            let isParticleTexture = false;

            if (shortName.includes("items/")) {
                shortName = shortName.replace("items/textures/", "").replace("items/", "");
            } else if (shortName.includes("blocks/")) {
                shortName = shortName.replace("blocks/textures/", "").replace("blocks/", "");
                isBlockTexture = true;
            } else if (shortName.includes("entityModels/")) {
                isEntityTexture = true;
            } else if (shortName.includes("particles/")) {
                shortName = shortName.replace("particles/textures/", "").replace("particles/", "");
                isParticleTexture = true;
            }

            const textureObject = {
                name: shortName,
                dataUrl: `${window.VERSION_PATH}/${fullTexturePath}.png`,
                isCustom: false,
                isBlockType: isBlockTexture,
                isEntityType: isEntityTexture,
                isParticleType: isParticleTexture
            };

            if (isBlockTexture) {
                window.blockTexturesOnly.push(textureObject);
            } else if (isParticleTexture) {
                window.particleTexturesOnly.push(textureObject);
            } else if (!isBlockTexture && !isEntityTexture && !isParticleTexture) {
                window.itemTexturesOnly.push(textureObject);
            }

            return textureObject;
        });

        window.metricCounts = {
            blocks: window.serverBlocks.length,
            items: window.serverItems.length,
            blockTex: window.blockTexturesOnly.length,
            itemTex: window.itemTexturesOnly.length,
            music: window.serverMusicList.length,
            entities: window.serverEntityModels.length,
            particles: window.serverParticles.length
        };

        window.renderMetricsUI();
        rebuildDropdowns();
        if (typeof window.updateSidebarProjectTree === 'function') window.updateSidebarProjectTree();
    } catch (err) {
        console.error("Failed to load server database metrics:", err);
        if (statusEl) {
            statusEl.innerText = `Database load failed: ${err.message}`;
            statusEl.style.backgroundColor = "#722323";
        }
    }
}
window.loadServerAssets = loadServerAssets;

window.renderMetricsUI = function() {
    const statusEl = document.getElementById('folderStatus');
    if (!statusEl) return;

    statusEl.className = `status-container ${window.metricsExpandedState ? "expanded-metrics" : ""}`;

    const hiddenPills = window.metricsExpandedState ? `
    <span class="metric-hidden-pill status-pill">Blocks: ${window.metricCounts.blocks}</span>
    <span class="metric-hidden-pill status-pill">Items: ${window.metricCounts.items}</span>
    <span class="metric-hidden-pill status-pill">Block Tex: ${window.metricCounts.blockTex}</span>
    <span class="metric-hidden-pill status-pill">Item Tex: ${window.metricCounts.itemTex}</span>
    <span class="metric-hidden-pill status-pill">Music: ${window.metricCounts.music}</span>
    <span class="metric-hidden-pill status-pill">Entities: ${window.metricCounts.entities}</span>
    <span class="metric-hidden-pill status-pill">Particles: ${window.metricCounts.particles}</span>
    ` : "";

    statusEl.innerHTML = `${hiddenPills}<span class="status-pill version-active" style="margin-left: auto; cursor: pointer;">v${window.VERSION_PATH} ${window.metricsExpandedState ? '→' : '←'}</span>`;
};

window.toggleMetricsPanel = function() {
    window.metricsExpandedState = !window.metricsExpandedState;
    window.renderMetricsUI();
};

function updateSearchableItems() {
    const addonName = document.getElementById('addonName').value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "") || 'custom_addon';
    const customBlockIds = window.projectData.blocks.map(b => `${addonName}:${b.id}`);
    const customItemIds = window.projectData.items.map(i => `${addonName}:${i.id}`);

    window.allSearchableItems = [
        ...new Set([
            ...window.serverBlocks,
            ...window.serverItems,
            ...window.serverMusicList,
            ...customBlockIds,
            ...customItemIds
        ])
    ].sort();
}
window.updateSearchableItems = updateSearchableItems;

function markFormAsDirty() {
    if (window.isInitializingPanel) return;
    window.hasUnsavedChanges = true;
    if (typeof window.updateSidebarProjectTree === 'function') window.updateSidebarProjectTree();
}
window.markFormAsDirty = markFormAsDirty;
window.renderDropdownOptions = (dropdownId, searchId) => {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;
    dropdown.innerHTML = '';

    let list = window.blockTexturesOnly;
    if (dropdownId.startsWith('item')) list = window.itemTexturesOnly;
    else if (dropdownId.startsWith('particle')) list = window.particleTexturesOnly;

    const textures = [
        ...window.serverTextures.filter(t => t.isCustom && (
            dropdownId.startsWith('particle') ? t.isParticleType :
            dropdownId.startsWith('item') ? (!t.isBlockType && !t.isEntityType && !t.isParticleType) : t.isBlockType
        )),
        ...list
    ];

    textures.forEach(tex => {
        const opt = document.createElement('div');
        opt.className = 'dropdown-option';
        opt.style = 'padding: 6px 12px; display: flex; align-items: center; gap: 10px; cursor: pointer;';
        opt.setAttribute('data-search', tex.name.toLowerCase().trim());
        opt.innerHTML = `<img src="${tex.dataUrl}" style="width:20px; height:20px; image-rendering:pixelated; background:#000; border-radius:2px;"><span>${tex.name} ${tex.isCustom ? '(Custom)' : ''}</span>`;

        opt.onmousedown = (e) => {
            e.preventDefault();
            const input = document.getElementById(searchId);
            if (input) {
                input.value = tex.name;
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
            dropdown.style.display = 'none';
            if (typeof window.updateBlockFacePreviews === 'function') window.updateBlockFacePreviews();
        };
            dropdown.appendChild(opt);
    });
};

window.rebuildDropdowns = () => {
    ['top', 'front', 'left', 'right', 'up', 'bottom', 'itemIcon', 'itemTexture', 'particleTexture'].forEach(side => {
        window.renderDropdownOptions(`${side}Dropdown`, `${side}Search`);
    });
    if (typeof window.renderDropOptions === 'function') window.renderDropOptions();
    window.dropdownsGenerated = true;
};
window.deletedAddonElements = { blocks: [], items: [], recipes: [], biomes: [], entities: [], particles: [] };

window.updateSidebarProjectTree = function() {
    const panels = { blocks: '📦', items: '💎', biomes: '🌍', entities: '👾', particles: '✨' };

    Object.keys(panels).forEach(pName => {
        const cont = document.getElementById(`sidebar${pName.charAt(0).toUpperCase() + pName.slice(1)}Tree`);
        if (!cont) return;

        const dataList = window.projectData[pName] || [];
        if (!dataList.length) {
            cont.innerHTML = '<span style="color: #666; font-style: italic;">None saved yet</span>';
        } else {
            cont.innerHTML = dataList.map(item => {
                const sub = item.subFolder ? `<span style="color: #6a6a6a; font-size: 11px;">${item.subFolder}/</span>` : "";
                return `<div class="sidebar-tree-row" style="display: flex; justify-content: space-between; align-items: center; padding: 4px 6px; background: #222; border-radius: 3px; margin-bottom: 2px; cursor: pointer;">
                <div onclick="loadStudioPanel('${pName}', null, '${item.id}')" style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px;">
                ${panels[pName]} ${sub}${item.id}
                </div>
                </div>`;
            }).join('');
        }

        if (window.hasUnsavedChanges && window.currentPanelName === pName) {
            const cur = document.getElementById(`${pName.slice(0, -1)}Id`)?.value.trim() || 'new_element';
            cont.innerHTML += `<div style="padding: 4px 6px; background: #2c251e; border-radius: 3px; border-left: 3px solid #ff9800; color: #ff9800;">✍️ ${cur} <span style="font-size:10px; float:right;">●</span></div>`;
        }
    });

    const recCont = document.getElementById('sidebarRecipesTree');
    if (recCont) {
        const recKeys = Object.keys(window.projectData.recipes || {});
        if (!recKeys.length) recCont.innerHTML = '<span style="color: #666; font-style: italic;">None saved yet</span>';
        else {
            recCont.innerHTML = recKeys.map(k => `<div class="sidebar-tree-row" style="display: flex; padding: 4px 6px; background: #222; border-radius: 3px; margin-bottom: 2px; cursor: pointer;" onclick="loadStudioPanel('recipes', null, '${k}')">📜 ${k}</div>`).join('');
        }
        if (window.hasUnsavedChanges && window.currentPanelName === 'recipes') {
            const curRec = document.getElementById('recipeFilename')?.value.trim() || 'new_recipe';
            recCont.innerHTML += `<div style="padding: 4px 6px; background: #2c251e; border-radius: 3px; border-left: 3px solid #ff9800; color: #ff9800;">✍️ ${curRec} <span style="font-size:10px; float:right;">●</span></div>`;
        }
    }
};
document.addEventListener("DOMContentLoaded", loadServerAssets);
