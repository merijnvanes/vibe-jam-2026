// ============================================================
// PROCEDURAL MAP GENERATOR — constraint-verified auto-tiling
//
// CORE RULE: Every cell's 3x3 neighborhood contains at most
// 2 distinct terrain types. This guarantees each transition
// tile bridges exactly 2 terrains.
//
// PROCESS:
// 1. Generate abstract terrain zones
// 2. Validate 3x3 constraint, fix violations
// 3. Build tile layers with per-cell verification
// ============================================================

// --- Noise ---
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function makeNoise2D(seed){const rng=mulberry32(seed);const p=[];for(let i=0;i<256;i++)p[i]=i;for(let i=255;i>0;i--){const j=(rng()*(i+1))|0;[p[i],p[j]]=[p[j],p[i]];}for(let i=0;i<256;i++)p[256+i]=p[i];const g=[];for(let i=0;i<256;i++){const a=rng()*Math.PI*2;g[i]=[Math.cos(a),Math.sin(a)];}function fade(t){return t*t*t*(t*(t*6-15)+10);}function dot(gi,x,y){return g[gi%256][0]*x+g[gi%256][1]*y;}return function(x,y){const xi=Math.floor(x)&255,yi=Math.floor(y)&255,xf=x-Math.floor(x),yf=y-Math.floor(y),u=fade(xf),v=fade(yf);const aa=p[p[xi]+yi],ab=p[p[xi]+yi+1],ba=p[p[xi+1]+yi],bb=p[p[xi+1]+yi+1];return(dot(aa,xf,yf)+(dot(ba,xf-1,yf)-dot(aa,xf,yf))*u)+((dot(ab,xf,yf-1)+(dot(bb,xf-1,yf-1)-dot(ab,xf,yf-1))*u)-(dot(aa,xf,yf)+(dot(ba,xf-1,yf)-dot(aa,xf,yf))*u))*v;};}
function fbm(n,x,y,o,l,g){let v=0,a=1,f=1,m=0;for(let i=0;i<o;i++){v+=n(x*f,y*f)*a;m+=a;a*=g;f*=l;}return v/m;}

// --- Blob lookup ---
const COLS=24;
const BLOB={
  "0_3":{64:[0,0],80:[1,0],88:[2,0],72:[3,0],91:[4,0],216:[5,0],120:[6,0],94:[7,0],208:[8,0],250:[9,0],248:[10,0],104:[11,0],66:[0,1],82:[1,1],90:[2,1],74:[3,1],210:[4,1],254:[5,1],251:[6,1],106:[7,1],214:[8,1],126:[9,1],123:[11,1],2:[0,2],18:[1,2],26:[2,2],10:[3,2],86:[4,2],223:[5,2],127:[6,2],75:[7,2],222:[8,2],219:[10,2],107:[11,2],0:[0,3],16:[1,3],24:[2,3],8:[3,3],122:[4,3],30:[5,3],27:[6,3],218:[7,3],22:[8,3],31:[9,3],95:[10,3],11:[11,3],255:[12,0]},
  "1_3":{64:[0,4],80:[1,4],88:[2,4],72:[3,4],91:[4,4],216:[5,4],120:[6,4],94:[7,4],208:[8,4],250:[9,4],248:[10,4],104:[11,4],66:[0,5],82:[1,5],90:[2,5],74:[3,5],210:[4,5],254:[5,5],251:[6,5],106:[7,5],214:[8,5],126:[9,5],123:[11,5],2:[0,6],18:[1,6],26:[2,6],10:[3,6],86:[4,6],223:[5,6],127:[6,6],75:[7,6],222:[8,6],219:[10,6],107:[11,6],0:[0,7],16:[1,7],24:[2,7],8:[3,7],122:[4,7],30:[5,7],27:[6,7],218:[7,7],22:[8,7],31:[9,7],95:[10,7],11:[11,7],255:[12,1]},
  "1_0":{64:[12,4],80:[13,4],88:[14,4],72:[15,4],91:[16,4],216:[17,4],120:[18,4],94:[19,4],208:[20,4],250:[21,4],248:[22,4],104:[23,4],66:[12,5],82:[13,5],90:[14,5],74:[15,5],210:[16,5],254:[17,5],251:[18,5],106:[19,5],214:[20,5],126:[21,5],123:[23,5],2:[12,6],18:[13,6],26:[14,6],10:[15,6],86:[16,6],223:[17,6],127:[18,6],75:[19,6],222:[20,6],219:[22,6],107:[23,6],0:[12,7],16:[13,7],24:[14,7],8:[15,7],122:[16,7],30:[17,7],27:[18,7],218:[19,7],22:[20,7],31:[21,7],95:[22,7],11:[23,7],255:[12,1]},
  "2_3":{64:[0,8],80:[1,8],88:[2,8],72:[3,8],91:[4,8],216:[5,8],120:[6,8],94:[7,8],208:[8,8],250:[9,8],248:[10,8],104:[11,8],66:[0,9],82:[1,9],90:[2,9],74:[3,9],210:[4,9],254:[5,9],251:[6,9],106:[7,9],214:[8,9],126:[9,9],123:[11,9],2:[0,10],18:[1,10],26:[2,10],10:[3,10],86:[4,10],223:[5,10],127:[6,10],75:[7,10],222:[8,10],219:[10,10],107:[11,10],0:[0,11],16:[1,11],24:[2,11],8:[3,11],122:[4,11],30:[5,11],27:[6,11],218:[7,11],22:[8,11],31:[9,11],95:[10,11],11:[11,11],255:[12,2]},
  "2_0":{64:[12,8],80:[13,8],88:[14,8],72:[15,8],91:[16,8],216:[17,8],120:[18,8],94:[19,8],208:[20,8],250:[21,8],248:[22,8],104:[23,8],66:[12,9],82:[13,9],90:[14,9],74:[15,9],210:[16,9],254:[17,9],251:[18,9],106:[19,9],214:[20,9],126:[21,9],123:[23,9],2:[12,10],18:[13,10],26:[14,10],10:[15,10],86:[16,10],223:[17,10],127:[18,10],75:[19,10],222:[20,10],219:[22,10],107:[23,10],0:[12,11],16:[13,11],24:[14,11],8:[15,11],122:[16,11],30:[17,11],27:[18,11],218:[19,11],22:[20,11],31:[21,11],95:[22,11],11:[23,11],255:[12,2]},
};
function toIdx(cr){return cr[1]*COLS+cr[0];}

// Available transition pairs (from tileset)
const TRANSITIONS = {
  '0_3': true, '1_3': true, '1_0': true, '2_3': true, '2_0': true,
};
// Check if transition tile exists for terrain pair
function hasTransition(a, b) {
  return TRANSITIONS[a+'_'+b] || TRANSITIONS[b+'_'+a];
}

// --- STEP 1: Generate terrain ---
function generateTerrain(W, H, seed) {
  const n1=makeNoise2D(seed),n2=makeNoise2D(seed+1000),n3=makeNoise2D(seed+2000);
  const t=[];
  for(let y=0;y<H;y++) t[y]=new Array(W).fill(0);

  // Water
  for(let y=0;y<H;y++) for(let x=0;x<W;x++)
    if(fbm(n3,x*0.06,y*0.06,3,2,0.5)>0.25) t[y][x]=3;

  // Sand near water
  for(let pass=0;pass<3;pass++){
    const s=t.map(r=>[...r]);
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
      if(s[y][x]!==0) continue;
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
        const nx=x+dx,ny=y+dy;
        if(nx>=0&&nx<W&&ny>=0&&ny<H&&(s[ny][nx]===3||(pass>0&&s[ny][nx]===2)))
          {t[y][x]=2;dy=2;break;}
      }
    }
  }

  // Sand patches inland
  for(let y=0;y<H;y++) for(let x=0;x<W;x++)
    if(t[y][x]===0&&fbm(n1,x*0.04+50,y*0.04+50,3,2,0.5)>0.32) t[y][x]=2;

  // Dirt paths
  const mainY=Math.round(H*0.45);
  for(let x=0;x<W;x++){
    const w=Math.round(fbm(n2,x*0.06,0,2,2,0.5)*1.5);
    for(let dy=0;dy<=1;dy++){const py=mainY+w+dy; if(py>=0&&py<H&&t[py][x]===0) t[py][x]=1;}
  }
  const vx=Math.round(W*0.35);
  for(let y=3;y<H-3;y++){
    const w=Math.round(fbm(n1,0,y*0.06,2,2,0.5)*1);
    for(let dx=0;dx<=1;dx++){const px=vx+w+dx; if(px>=0&&px<W&&t[y][px]===0) t[y][px]=1;}
  }

  return t;
}

// --- STEP 2: Validate & fix 3x3 constraint ---
// Rule: each cell's 3x3 neighborhood has ≤2 distinct terrain types.
// Also: for each pair of terrains in the neighborhood, a transition must exist.
// Fix strategy: if invalid, convert cell to a terrain that resolves the conflict.
function getNeighborTypes(t,x,y,W,H){
  const types=new Set();
  for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
    const nx=x+dx,ny=y+dy;
    if(nx>=0&&nx<W&&ny>=0&&ny<H) types.add(t[ny][nx]);
  }
  return types;
}

function fixTerrain(t,W,H){
  // Fix strategy: grass(0) has transitions to ALL other terrains,
  // so converting a problem cell to grass always creates valid pairs.
  // But we also need to fix the NEIGHBORS that become invalid after our fix.
  let totalFixes=0, iterations=0;
  do {
    let fixes=0;
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
      const types=getNeighborTypes(t,x,y,W,H);

      let bad=false;
      if(types.size>2) bad=true;
      if(types.size===2){
        const [a,b]=[...types];
        if(!hasTransition(a,b)) bad=true;
      }

      if(bad){
        if(t[y][x]!==0){
          // Convert this cell to grass
          t[y][x]=0; fixes++; totalFixes++;
        } else {
          // Cell is already grass but neighborhood has 3+ types.
          // Find the least common non-grass terrain in neighborhood and convert it.
          const counts={};
          for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
            const nx=x+dx,ny=y+dy;
            if(nx>=0&&nx<W&&ny>=0&&ny<H&&t[ny][nx]!==0){
              counts[t[ny][nx]]=(counts[t[ny][nx]]||0)+1;
            }
          }
          // Convert the least frequent non-grass neighbor to grass
          let minT=-1,minC=99;
          for(const [tt,cc] of Object.entries(counts))
            if(cc<minC){minC=cc;minT=parseInt(tt);}
          if(minT>=0){
            for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
              const nx=x+dx,ny=y+dy;
              if(nx>=0&&nx<W&&ny>=0&&ny<H&&t[ny][nx]===minT){
                t[ny][nx]=0; fixes++; totalFixes++;
              }
            }
          }
        }
      }
    }
    iterations++;
    if(fixes===0) break;
  } while(iterations<50);
  console.log(`Terrain fixes: ${totalFixes} cells fixed in ${iterations} iterations`);
}

// --- STEP 3: Build tile layers ---
function blobMask(x,y,W,H,isSame){
  const n=y>0&&isSame(x,y-1),s=y<H-1&&isSame(x,y+1);
  const w=x>0&&isSame(x-1,y),e=x<W-1&&isSame(x+1,y);
  return(n&&w&&x>0&&y>0&&isSame(x-1,y-1)?1:0)|(n?2:0)|
    (n&&e&&x<W-1&&y>0&&isSame(x+1,y-1)?4:0)|(w?8:0)|(e?16:0)|
    (s&&w&&x>0&&y<H-1&&isSame(x-1,y+1)?32:0)|(s?64:0)|
    (s&&e&&x<W-1&&y<H-1&&isSame(x+1,y+1)?128:0);
}

function selectTile(key,mask){
  const tile=BLOB[key][mask]||BLOB[key][255];
  return tile?toIdx(tile):toIdx([12,3]);
}

function buildLayers(terrain,W,H){
  const water=[],grass=[],sand=[],dirt=[];
  for(let y=0;y<H;y++){
    water[y]=new Array(W).fill(toIdx([12,3]));
    grass[y]=new Array(W).fill(-1);
    sand[y]=new Array(W).fill(-1);
    dirt[y]=new Array(W).fill(-1);
  }

  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    const t=terrain[y][x];

    // Grass layer: covers all non-water cells, transitions to water
    if(t!==3){
      const mask=blobMask(x,y,W,H,(nx,ny)=>terrain[ny][nx]!==3);
      grass[y][x]=selectTile("0_3",mask);
    }

    // Sand layer: sand cells, pick transition based on what "other" is
    if(t===2){
      // Determine the "other" terrain in this cell's neighborhood
      const types=getNeighborTypes(terrain,x,y,W,H);
      types.delete(2); // remove self
      // If water is in neighborhood → sand→water, else → sand→grass
      const key=types.has(3)?"2_3":"2_0";
      const mask=blobMask(x,y,W,H,(nx,ny)=>terrain[ny][nx]===2);
      sand[y][x]=selectTile(key,mask);
    }

    // Dirt layer: dirt cells, pick transition based on what "other" is
    if(t===1){
      const types=getNeighborTypes(terrain,x,y,W,H);
      types.delete(1);
      const key=types.has(3)?"1_3":types.has(0)?"1_0":"1_0";
      const mask=blobMask(x,y,W,H,(nx,ny)=>terrain[ny][nx]===1);
      dirt[y][x]=selectTile(key,mask);
    }
  }

  return {waterLayer:water,grassLayer:grass,sandLayer:sand,dirtLayer:dirt};
}

// --- STEP 4: Verify ---
function verify(terrain,W,H){
  let violations=0;
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    const types=getNeighborTypes(terrain,x,y,W,H);
    if(types.size>2) {
      violations++;
      if(violations<=5) console.error(`VIOLATION [${x},${y}]: ${types.size} types: {${[...types].join(',')}}`);
    }
    if(types.size===2){
      const [a,b]=[...types];
      if(!hasTransition(a,b)){
        violations++;
        if(violations<=5) console.error(`NO TRANSITION [${x},${y}]: ${a}↔${b}`);
      }
    }
  }
  console.log(violations===0
    ? 'VERIFY: all cells have ≤2 terrain types with valid transitions ✓'
    : `VERIFY: ${violations} violations remaining`);
}

// --- Main ---
function generateMap(width,height,seed){
  seed=seed||42;
  const W=width,H=height;
  const terrain=generateTerrain(W,H,seed);
  fixTerrain(terrain,W,H);
  verify(terrain,W,H);
  const layers=buildLayers(terrain,W,H);

  let spawnX=Math.round(W*0.35),spawnY=Math.round(H*0.45);
  for(let dy=-3;dy<=3;dy++) for(let dx=-3;dx<=3;dx++){
    const sx=spawnX+dx,sy=spawnY+dy;
    if(sx>=0&&sx<W&&sy>=0&&sy<H&&terrain[sy][sx]===1){spawnX=sx;spawnY=sy;}
  }

  return {width,height,layers,terrain,spawnX,spawnY};
}
