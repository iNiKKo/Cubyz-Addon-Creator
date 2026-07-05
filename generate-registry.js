const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '0.3.0');
const targets = {
    blocks: ['.zig.zon'], items: ['.zig.zon'], recipes: ['.zig.zon'],
    biomes: ['.zig.zon'], sbb: ['.zig.zon'], models: ['.obj', '.json', '.gltf'],
    music: ['.ogg'], particles: ['.zig.zon']
};

function crawl(src, base, extList) {
    if (!fs.existsSync(src)) return [];
    return fs.readdirSync(src, { withFileTypes: true }).reduce((acc, item) => {
        if (item.name.startsWith('.')) return acc;
        const full = path.join(src, item.name);
        if (item.isDirectory()) return acc.concat(crawl(full, base, extList));

        const ext = path.extname(item.name).toLowerCase();
        if (extList.includes('.zig.zon') && item.name.endsWith('.zig.zon')) {
            acc.push(path.relative(base, full).slice(0, -8).replace(/\\/g, '/'));
        } else if (extList.some(e => item.name.endsWith(e))) {
            acc.push(path.relative(base, full).slice(0, -ext.length).replace(/\\/g, '/'));
        }
        return acc;
    }, []);
}

function run() {
    console.log(`Scanning registries in: ${dir}`);
    const reg = { textures: [], items: [], music: [], entityModels: [], particles: [] };

    Object.entries(targets).forEach(([name, exts]) => {
        const fileList = crawl(path.join(dir, name), path.join(dir, name), exts).sort();
        fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(fileList, null, 2));
        console.log(`Saved ${fileList.length} paths to ${name}.json`);

        if (reg[name] !== undefined) reg[name] = fileList;
    });

        const entitiesDir = path.join(dir, 'entityModels');
        if (fs.existsSync(entitiesDir)) {
            reg.entityModels = fs.readdirSync(entitiesDir)
            .filter(f => f.endsWith('.zig.zon'))
            .map(f => f.replace('.zig.zon', ''))
            .sort();
        }
        fs.writeFileSync(path.join(dir, 'entity_models.json'), JSON.stringify(reg.entityModels, null, 2));
        console.log(`Saved ${reg.entityModels.length} entities to entity_models.json`);

        ['items', 'blocks', 'entityModels', 'particles'].forEach(pfx => {
            const tDir = path.join(dir, pfx, 'textures');
            if (fs.existsSync(tDir)) {
                crawl(tDir, tDir, ['.png']).forEach(t => reg.textures.push(`${pfx}/textures/${t}`));
            }
        });
        reg.textures.sort();

        fs.writeFileSync(path.join(dir, 'textures.json'), JSON.stringify(reg.textures, null, 2));
        fs.writeFileSync(path.join(dir, 'registry.json'), JSON.stringify(reg, null, 2));
        console.log(`Saved textures list and master registry file.`);
}

run();
