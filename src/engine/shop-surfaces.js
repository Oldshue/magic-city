import * as THREE from '../../vendor/three.module.min.js';

export function mappedSurface(material,metres) {
  material.userData.metresPerTile = metres;
  return material;
}

export function mapShopUV(geometry,metres) {
  const {uv,position,normal} = geometry.attributes;
  for (let i=0;i<position.count;i++) {
    const end = Math.abs(normal.getX(i))>.5;
    const horizontal = Math.abs(normal.getY(i))>.5;
    uv.setXY(i,(end?position.getZ(i):position.getX(i))/metres,
      (horizontal?position.getZ(i):position.getY(i))/metres);
  }
}

function configure(texture,srgb=false) {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  if (srgb) texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}

async function photographed(loader,name,metres,options) {
  const phases = ['color','normal','roughness'];
  const loaded = await Promise.allSettled(phases.map(channel=>loader.loadAsync('./data/art/'+name+'-'+channel+'.jpg')));
  const [map,normalMap,roughnessMap] = loaded.map(outcome=>outcome.status==='fulfilled' ? outcome.value : null);
  if (map) configure(map,true);
  if (normalMap) configure(normalMap);
  if (roughnessMap) configure(roughnessMap);
  return mappedSurface(new THREE.MeshStandardMaterial({...options,map,normalMap,roughnessMap}),metres);
}

function tiles(palette,rows,columns,step,coating) {
  const size = 256;
  function surface() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    return canvas;
  }
  const pigment = surface(), relief = surface();
  const p = pigment.getContext('2d'), r = relief.getContext('2d');
  p.fillStyle = '#514840'; p.fillRect(0,0,size,size);
  r.fillStyle = '#565656'; r.fillRect(0,0,size,size);
  const w = size/columns, h = size/rows;
  for (let row=0;row<rows;row++) {
    for (let col=-1;col<columns;col++) {
      const base=palette[((row+col)%palette.length+palette.length)%palette.length];
      const shade=(row*17+(col+1)*11)%7-3;
      const x=(col+(row%2)*step)*w+1.25, y=row*h+1.25;
      p.fillStyle = 'rgb('+base.map(value=>value+shade).join(',')+')';
      p.fillRect(x,y,w-2.5,h-2.5);
      p.strokeStyle = 'rgba(251,238,219,.13)';
      p.strokeRect(x+.75,y+.75,w-4,h-4);
      r.fillStyle = '#c8c8c8'; r.fillRect(x+.4,y+.4,w-3.3,h-3.3);
    }
  }
  return mappedSurface(new THREE.MeshStandardMaterial({
    map:configure(new THREE.CanvasTexture(pigment),true),
    bumpMap:configure(new THREE.CanvasTexture(relief)),bumpScale:.009,roughness:coating,
  }),.96);
}

export async function loadShopSurfaces(environment) {
  const loader = new THREE.TextureLoader();
  const [brick,marble,walnut] = await Promise.all([
    photographed(loader,'brick-wall-001',2.4,{
      color:0xd6b4a0,roughness:.97,normalScale:new THREE.Vector2(.47,.47),
    }),
    photographed(loader,'counter-marble',1.5,{
      color:0xf3dfbf,roughness:.71,envMap:environment,envMapIntensity:.42,normalScale:new THREE.Vector2(.35,.35),
    }),
    photographed(loader,'counter-wood',.62,{
      color:0xe9c7a0,roughness:.77,envMap:environment,envMapIntensity:.26,normalScale:new THREE.Vector2(.58,.58),
    }),
  ]);
  return {brick,marble,walnut,
    jade:tiles([[42,75,65],[39,69,63],[44,77,67]],6,3,.5,.46),
    milk:tiles([[211,194,155],[220,207,173],[214,199,161]],6,3,.5,.50),
    checker:tiles([[213,197,162],[36,54,49]],6,6,0,.49),
    lunchFloor:tiles([[206,195,168],[145,123,101],[194,181,148],[125,91,74]],6,6,0,.61),
  };
}
