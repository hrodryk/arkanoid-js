const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));

const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const livesEl = document.getElementById('lives');
const overlayEl = document.getElementById('overlay');
const startPanel = document.getElementById('start');
const gameoverPanel = document.getElementById('gameover');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');

const BASE_W = 960;
const BASE_H = 540;
const PADDLE_BASE_W = 100;
const PADDLE_H = 14;
const BALL_R = 7;
const MAX_LIVES = 3;

const input = {
  left: false,
  right: false,
  mouseX: null,
  mouseTs: 0,
};

const sounds = {
  bounce: createSound(180, 'triangle'),
  brick: createSound(380, 'sawtooth'),
  power: createSound(240, 'square'),
  lose: createSound(120, 'sine'),
  start: createSound(220, 'square'),
};
let audioCtx = null;
function createSound(freq, type='sine'){
  return () => {
    if(!audioCtx) return;
    const duration = 0.08;
    const now = audioCtx.currentTime;
    const oscillator = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(audioCtx.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  };
}

function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }
function rand(min, max){ return Math.random() * (max - min) + min; }
function choice(arr){ return arr[Math.floor(Math.random() * arr.length)]; }

let state = 'start';
let score = 0;
let level = 1;
let lives = MAX_LIVES;
let bricks = [];
let balls = [];
let paddle = null;
let powerups = [];
let lastTime = 0;
let scale = 1;

function createLevel(levelNum){
  const cols = 12;
  const rows = clamp(4 + levelNum, 4, 10);
  const margin = 30;
  const brickW = (BASE_W - margin * 2) / cols;
  const brickH = 22;
  const patterns = ['solid','checker','stairs','holes'];
  const pattern = choice(patterns);
  const arr = [];
  for(let r=0; r<rows; r++){
    for(let c=0; c<cols; c++){
      let visible = true;
      if(pattern === 'checker') visible = (r + c) % 2 === 0;
      if(pattern === 'stairs') visible = c >= r;
      if(pattern === 'holes') visible = !(r % 3 === 1 && c % 4 === 2);
      if(!visible) continue;
      const strength = 1 + Math.floor(levelNum/3);
      const x = margin + c * brickW;
      const y = 80 + r * brickH;
      const color = `hsl(${(c*20 + r*10)%360} 70% 60%)`;
      arr.push({x,y,w:brickW-6,h:brickH-6,strength,color,alive:true});
    }
  }
  return arr;
}

function resetPaddle(){
  paddle = {
    x: (BASE_W - PADDLE_BASE_W)/2,
    y: BASE_H - 50,
    w: PADDLE_BASE_W,
    h: PADDLE_H,
    speed: 540,
  };
}

function spawnBall(sticky=false){
  const speed = 360 + level*10;
  const angle = rand(-0.7, -2.44);
  const vx = Math.cos(angle) * speed;
  const vy = Math.sin(angle) * speed;
  balls.push({x: paddle.x + paddle.w/2, y: paddle.y - BALL_R - 2, vx, vy, r: BALL_R, sticky});
}

function spawnPowerup(x, y){
  const types = ['multiball','paddle_big','paddle_small','speed_up','speed_down','life'];
  const type = choice(types);
  const size = 20;
  const speed = 140;
  powerups.push({x,y,w:size,h:size,type,vy:speed,active:true});
}

function applyPowerup(type){
  switch(type){
    case 'multiball':
      if(balls.length){
        const b = balls[0];
        for(let i=0;i<2;i++){
          const angle = rand(-0.5, -2.6);
          const speed = Math.hypot(b.vx,b.vy);
          balls.push({x:b.x,y:b.y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,r:BALL_R,sticky:false});
        }
      }
      sounds.power();
      break;
    case 'paddle_big':
      paddle.w = clamp(paddle.w * 1.4, 70, 220);
      sounds.power();
      break;
    case 'paddle_small':
      paddle.w = clamp(paddle.w * 0.75, 70, 220);
      sounds.power();
      break;
    case 'speed_up':
      balls.forEach(b => { b.vx*=1.15; b.vy*=1.15; });
      sounds.power();
      break;
    case 'speed_down':
      balls.forEach(b => { b.vx*=0.85; b.vy*=0.85; });
      sounds.power();
      break;
    case 'life':
      lives = clamp(lives+1, 1, 6);
      sounds.power();
      break;
  }
}

function setup(){
  score = 0;
  level = 1;
  lives = MAX_LIVES;
  bricks = createLevel(level);
  powerups = [];
  resetPaddle();
  balls = [];
  spawnBall(true);
}

function nextLevel(){
  level += 1;
  bricks = createLevel(level);
  balls = [];
  spawnBall(true);
  levelEl.textContent = level;
}

function loseLife(){
  lives -= 1;
  livesEl.textContent = lives;
  sounds.lose();
  balls = [];
  if(lives <= 0){
    state = 'gameover';
    showPanel('gameover');
    document.getElementById('finalScore').textContent = score;
  } else {
    spawnBall(true);
  }
}

function resizeCanvas(){
  const wrap = document.getElementById('canvas-wrap');
  const rect = wrap.getBoundingClientRect();
  const targetW = Math.min(rect.width - 8, BASE_W);
  const targetH = targetW * (BASE_H/BASE_W);
  canvas.style.width = `${targetW}px`;
  canvas.style.height = `${targetH}px`;
  scale = targetW / BASE_W;
  canvas.width = Math.floor(BASE_W * dpr);
  canvas.height = Math.floor(BASE_H * dpr);
  ctx.setTransform(dpr*scale,0,0,dpr*scale,0,0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

window.addEventListener('keydown', (e)=>{
  if(e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') input.left = true;
  if(e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') input.right = true;
  if(e.key.toLowerCase() === 'p') togglePause();
});
window.addEventListener('keyup', (e)=>{
  if(e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') input.left = false;
  if(e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') input.right = false;
});
canvas.addEventListener('mousemove', (e)=>{
  const rect = canvas.getBoundingClientRect();
  input.mouseX = (e.clientX - rect.left) / scale;
  input.mouseTs = performance.now();
});
canvas.addEventListener('mouseleave', ()=>{
  input.mouseX = null;
});

function togglePause(){
  if(state === 'play'){ state = 'paused'; }
  else if(state === 'paused'){ state = 'play'; requestAnimationFrame(loop); }
}

function showPanel(name){
  startPanel.classList.remove('visible');
  gameoverPanel.classList.remove('visible');
  overlayEl.classList.remove('hidden');
  if(name === 'start') startPanel.classList.add('visible');
  if(name === 'gameover') gameoverPanel.classList.add('visible');
}
function hidePanels(){
  startPanel.classList.remove('visible');
  gameoverPanel.classList.remove('visible');
  overlayEl.classList.add('hidden');
}

startBtn.addEventListener('click', ()=>{
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  sounds.start();
  setup();
  scoreEl.textContent = score;
  levelEl.textContent = level;
  livesEl.textContent = lives;
  state = 'play';
  hidePanels();
  requestAnimationFrame(loop);
});
restartBtn.addEventListener('click', ()=>{
  restart();
});
function restart(){
  setup();
  scoreEl.textContent = score;
  levelEl.textContent = level;
  livesEl.textContent = lives;
  state = 'play';
  hidePanels();
  requestAnimationFrame(loop);
}

function circleRectCollision(cx, cy, r, rx, ry, rw, rh){
  const closestX = clamp(cx, rx, rx+rw);
  const closestY = clamp(cy, ry, ry+rh);
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx*dx + dy*dy <= r*r;
}

function reflectBall(ball, rx, ry, rw, rh){
  const cx = ball.x;
  const cy = ball.y;
  const leftDist = Math.abs(cx - rx);
  const rightDist = Math.abs(cx - (rx+rw));
  const topDist = Math.abs(cy - ry);
  const bottomDist = Math.abs(cy - (ry+rh));
  const minDist = Math.min(leftDist, rightDist, topDist, bottomDist);
  if(minDist === leftDist || minDist === rightDist){
    ball.vx *= -1;
  } else {
    ball.vy *= -1;
  }
}

function update(dt){
  const dir = (input.right?1:0) - (input.left?1:0);
  const usingKeyboard = input.left || input.right;
  const mouseFresh = input.mouseX !== null && (performance.now() - input.mouseTs) < 150;
  if(usingKeyboard){
    paddle.x += dir * paddle.speed * dt;
    paddle.x = clamp(paddle.x, 0, BASE_W - paddle.w);
  } else if(mouseFresh){
    const targetX = clamp(input.mouseX - paddle.w/2, 0, BASE_W - paddle.w);
    paddle.x += (targetX - paddle.x) * 12 * dt;
    paddle.x = clamp(paddle.x, 0, BASE_W - paddle.w);
  }

  for(const ball of balls){
    if(ball.sticky){
      ball.x = paddle.x + paddle.w/2;
      ball.y = paddle.y - ball.r - 2;
      ball.sticky = false;
    }
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if(ball.x - ball.r <= 0){ ball.x = ball.r; ball.vx *= -1; sounds.bounce(); }
    if(ball.x + ball.r >= BASE_W){ ball.x = BASE_W - ball.r; ball.vx *= -1; sounds.bounce(); }
    if(ball.y - ball.r <= 0){ ball.y = ball.r; ball.vy *= -1; sounds.bounce(); }

    if(ball.y - ball.r > BASE_H){
      balls = balls.filter(b => b !== ball);
      if(balls.length === 0){ loseLife(); }
      continue;
    }

    if(circleRectCollision(ball.x, ball.y, ball.r, paddle.x, paddle.y, paddle.w, paddle.h)){
      const hit = (ball.x - (paddle.x + paddle.w/2)) / (paddle.w/2);
      const speed = Math.hypot(ball.vx, ball.vy);
      const angle = -Math.PI/2 + hit * (Math.PI/3);
      ball.vx = Math.cos(angle) * speed;
      ball.vy = Math.sin(angle) * speed;
      ball.y = paddle.y - ball.r - 2;
      sounds.bounce();
    }
  }

  for(const brick of bricks){
    if(!brick.alive) continue;
    for(const ball of balls){
      if(circleRectCollision(ball.x, ball.y, ball.r, brick.x, brick.y, brick.w, brick.h)){
        reflectBall(ball, brick.x, brick.y, brick.w, brick.h);
        brick.strength -= 1;
        if(brick.strength <= 0){
          brick.alive = false;
          score += 10;
          scoreEl.textContent = score;
          if(Math.random() < 0.18){ spawnPowerup(brick.x + brick.w/2 - 10, brick.y + brick.h/2 - 10); }
        }
        sounds.brick();
        break;
      }
    }
  }

  for(const p of powerups){
    if(!p.active) continue;
    p.y += p.vy * dt;
    if(circleRectCollision(p.x+p.w/2, p.y+p.h/2, p.w/2, paddle.x, paddle.y, paddle.w, paddle.h)){
      p.active = false;
      applyPowerup(p.type);
    }
    if(p.y > BASE_H + 30){ p.active = false; }
  }

  if(bricks.every(b => !b.alive)){
    nextLevel();
  }
}

function draw(){
  ctx.clearRect(0,0,BASE_W,BASE_H);
  ctx.save();
  ctx.globalAlpha = 0.08;
  for(let x=0; x<BASE_W; x+=40){
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,BASE_H); ctx.strokeStyle='#fff'; ctx.stroke();
  }
  for(let y=0; y<BASE_H; y+=40){
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(BASE_W,y); ctx.strokeStyle='#fff'; ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = '#3fd6ff';
  ctx.fillRect(paddle.x, paddle.y, paddle.w, paddle.h);

  for(const b of balls){
    ctx.beginPath();
    ctx.fillStyle = '#ffca3a';
    ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
    ctx.fill();
  }

  for(const br of bricks){
    if(!br.alive) continue;
    const glow = Math.min(10, br.strength*3);
    ctx.save();
    ctx.shadowColor = br.color;
    ctx.shadowBlur = glow;
    ctx.fillStyle = br.color;
    ctx.fillRect(br.x, br.y, br.w, br.h);
    ctx.restore();
  }

  for(const p of powerups){
    if(!p.active) continue;
    ctx.save();
    const colorMap = {
      multiball:'#7bf', paddle_big:'#6f6', paddle_small:'#f66', speed_up:'#fd0', speed_down:'#0cf', life:'#f9a'
    };
    ctx.fillStyle = colorMap[p.type] || '#fff';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = '#021220';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const label = {
      multiball:'M', paddle_big:'B', paddle_small:'S', speed_up:'↑', speed_down:'↓', life:'♥'
    }[p.type] || '?';
    ctx.fillText(label, p.x + p.w/2, p.y + p.h/2);
    ctx.restore();
  }

  if(state === 'paused'){
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.4)';
    ctx.fillRect(0,0,BASE_W,BASE_H);
    ctx.fillStyle = '#fff';
    ctx.font = '24px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Paused - Press P to resume', BASE_W/2, BASE_H/2);
    ctx.restore();
  }
}

function loop(t){
  if(state !== 'play'){ return; }
  const dt = Math.min(0.033, (t - lastTime)/1000 || 0.016);
  lastTime = t;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

showPanel('start');