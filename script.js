const canvas = document.getElementById("canvas")
const ctx = canvas.getContext("2d")
ctx.imageSmoothingEnabled = false;

const colorPalette = {
    ground: "#040D12",
    backdrop: "#183D3D",
}
/*

{
    ground: "#17153B",
    backdrop: "#2E236C",
}
    {
    ground: "#181C14",
    backdrop: "#3C3D37",
}

*/

const audio = {
    music: new Audio('./audio/bluesmoke.mp3'),

    jump: new Audio('./audio/jump.mp3'),
    dash: new Audio('./audio/dash.mp3'),
    recharge: new Audio('./audio/recharge.mp3'),
    land: new Audio('./audio/land.mp3'),
    hit: new Audio('./audio/hit.mp3'),
}
for (let i in audio) {
    const snd = audio[i]
    snd.preservesPitch = false
}
function playSnd(name) {
    const snd = audio[name]
    snd.currentTime = 0
    snd.playbackRate = 0.8 + Math.random() * 0.4
    snd.play()
}

const music = audio.music
music.volume = localStorage.getItem("musicVol") || 0.5
music.loop = true
async function tryPlayAudio() {
    try {
        await music.play();
        console.log('Audio is playing!');
    } catch (err) {
        console.warn('Autoplay prevented, waiting for user interaction...');
        // Retry after user interacts
        document.addEventListener('click', retryOnUserAction, { once: true });
    }
}

function retryOnUserAction() {
    music.play().then(() => {
        console.log('Audio started after user interaction');
    }).catch(err => {
        console.error('Still failed to play:', err);
    });
}
tryPlayAudio()

class vec {
    constructor(x, y) {
        this.x = x
        this.y = y
    }
    div(num) {
        this.x /= num
        this.y /= num
        return this
    }
    mul(num) {
        this.x *= num
        this.y *= num
        return this
    }
    add(vecB) {
        this.x += vecB.x
        this.y += vecB.y
        return this
    }
    sub(vecB) {
        this.x -= vecB.x
        this.y -= vecB.y
        return this
    }
    abs() {
        this.x = Math.abs(this.x)
        this.y = Math.abs(this.y)
        return this
    }
    normalize() {
        const len = Math.hypot(this.x, this.y);
        if (len === 0) return this
        this.x /= len
        this.y /= len
        return this
    }
    getMagnitude() {
        return Math.hypot(this.x, this.y);
    }
    lerp(vecB, t) {
        this.x += (vecB.x - this.x) * t
        this.y += (vecB.y - this.y) * t
    }
    clone() {
        return new vec(this.x, this.y)
    }

}

class baseTile {
    constructor(pos, scale) {
        this.pos = pos.clone()
        this.scale = scale.clone()
    }
}

const cw = 1280
const ch = 1792
const tiles = [
    new baseTile(new vec(cw * 0.5, ch * 0.9), new vec(128, 18)),
    new baseTile(new vec(cw * 0.1, ch * 0.8), new vec(128, 32)),
    new baseTile(new vec(cw * 0.8, ch * 0.6), new vec(18, 200)),
    new baseTile(new vec(cw * 0.5, ch * 0.6), new vec(128, 18)),
    new baseTile(new vec(cw * 0.6, ch * 0.7), new vec(170, 18)),
]
let timerStart = performance.now()
const GRAV = 12
let ZOOM = 1

const moveAndCollide = function () {
    this.pos.x += this.vel.x;
    let collidedX = false;
    let collidedY = false;
    const ogYVel = this.vel.y

    // --- X-axis collision ---
    for (const tile of tiles) {
        const pxM = this.pos.x + this.size;
        const pyM = this.pos.y + this.size;

        const tx = tile.pos.x;
        const ty = tile.pos.y;
        const txM = tx + tile.scale.x;
        const tyM = ty + tile.scale.y;

        if (pyM > ty && this.pos.y < tyM) { // Y overlap
            if (pxM > tx && this.pos.x < txM) { // X overlap
                if (this.vel.x > 0) this.pos.x = tx - this.size;
                else if (this.vel.x < 0) this.pos.x = txM;
                this.vel.x *= -0.7;
                collidedX = true;
            }
        }
    }

    // --- Y-axis movement ---
    this.pos.y += this.vel.y;

    // --- Y-axis collision ---
    for (const tile of tiles) {
        const pxM = this.pos.x + this.size;
        const pyM = this.pos.y + this.size;

        const tx = tile.pos.x;
        const ty = tile.pos.y;
        const txM = tx + tile.scale.x;
        const tyM = ty + tile.scale.y;

        if (pxM > tx && this.pos.x < txM) { // X overlap
            if (pyM > ty && this.pos.y < tyM) { // Y overlap
                if (this.vel.y > 0) this.pos.y = ty - this.size;
                else if (this.vel.y < 0) this.pos.y = tyM;
                this.vel.y = 0;
                collidedY = true;
            }
        }
    }

    // --- World bounds ---
    const handleCollision = (p, v, min, max, size, zeroY = false) =>
        p < min ? [min, v * -0.7, true] :
            p + size > max ? [max - size, zeroY ? 0 : v * -0.7, true] :
                [p, v, false];

    // X bounds
    let collidedBoundsX;
    [this.pos.x, this.vel.x, collidedBoundsX] = handleCollision(this.pos.x, this.vel.x, 0, cw, this.size);

    // Y bounds
    let collidedBoundsY;
    [this.pos.y, this.vel.y, collidedBoundsY] = handleCollision(this.pos.y, this.vel.y, 0, ch, this.size, true);

    // Combine collisions
    collidedX = collidedX || collidedBoundsX;
    collidedY = collidedY || collidedBoundsY;

    let collideGround = (ogYVel > 0 && plr.vel.y === 0);

    // Return collision info
    return [collideGround, collidedX || collidedY];
};
const plr = {
    pos: new vec(cw / 2, ch - 32),
    vel: new vec(0, 0),
    moveVec: new vec(0, 0),
    size: 32,

    airSpeed: 5,
    walkSpeed: 15,
    jumpPower: 5,
    dashPower: 4,

    groundFriction: 0.01,
    airFriction: 0.3,

    flightTime: 0,
    isFlying: false,
    dashCooldown: 0,
    onGround: true,
    didCollide: false,
    dashActive: true,
    coyoteTime: 0,
    input: {
        w: false,
        s: false,
        a: false,
        d: false,
        space: false,
    },
}
plr.moveAndCollide = moveAndCollide

const cam = {
    pos: plr.pos.clone()
}

let lastTime = performance.now()
let running = true

function jump() {
    if (plr.onGround || plr.coyoteTime > 0) {
        plr.vel.y -= plr.jumpPower
        plr.onGround = false
        playSnd("jump")
    } else {
        if (!plr.dashActive) { return }
        plr.dashActive = false
        plr.vel.mul(0.5)
        plr.vel.add(plr.moveVec.clone().mul(plr.dashPower))
        plr.onGround = false
        plr.flightTime = 0.2

        playSnd("dash")
    }
}

function update(dt) {

    cam.pos.lerp(plr.pos.clone().add(new vec(plr.size, plr.size).div(2)).add(plr.vel.clone().mul(10)).add(new vec(-canvas.width, -canvas.height).div(2).div(ZOOM)),
        1 - Math.pow(1 - 0.99, dt)
    )

    const velDamp = plr.onGround ? plr.groundFriction : plr.airFriction
    const moveMult = plr.onGround ? plr.walkSpeed : plr.airSpeed

    plr.moveVec = new vec(
        (plr.input.d ? 1 : 0) + (plr.input.a ? -1 : 0),
        (plr.input.w ? -1 : 0) + (plr.input.s ? 1 : 0)
    ).normalize()

    plr.vel.x += plr.moveVec.x * moveMult * dt

    if (plr.flightTime <= 0) {
        plr.vel.y += GRAV * dt
    } else {
        plr.flightTime -= dt
    }

    if (plr.coyoteTime > 0) { plr.coyoteTime -= dt }

    plr.vel.mul(Math.pow(velDamp, dt))

    const [onGround, didCollide] = plr.moveAndCollide()
    if (onGround) {
        if (!plr.dashActive) {
            playSnd("recharge")
        }
        if (!plr.onGround) {
            playSnd("land")
        }

        plr.dashActive = true
        plr.coyoteTime = 0.1
    }
    if (didCollide) {
        if (!plr.didCollide && !onGround) {
            playSnd("hit")
        }
        plr.flightTime = 0
    }


    plr.onGround = onGround
    plr.didCollide = didCollide
}

function drawRect(pos, scale) {
    ctx.fillRect(
        (pos.x - cam.pos.x) * ZOOM,
        (pos.y - cam.pos.y) * ZOOM,
        scale.x * ZOOM,
        scale.y * ZOOM
    )
}

function clear() {
    ctx.fillStyle = colorPalette.ground
    ctx.fillRect(0, 0, canvas.width, canvas.height)
}
function render(dt, now) {
    ctx.fillStyle = colorPalette.backdrop
    drawRect(new vec(0, 0), new vec(cw, ch))

    ctx.fillStyle = plr.dashActive ? "#FFCC00" :
        plr.flightTime > 0 ? "#fff" : "#8222ffff"

    drawRect(plr.pos, new vec(plr.size, plr.size))

    ctx.fillStyle = colorPalette.ground
    for (let i in tiles) {
        const tile = tiles[i]
        drawRect(tile.pos, tile.scale)
    }

    ctx.fillStyle = "white"
    //ctx.textAlign = "center"
    //ctx.textBaseline = "middle"
    ctx.font = "20px Patrick Hand SC"
    //ctx.fillText("fps: " + Math.round(1 / (dt || 0.016)), 10, 20)
    ctx.fillText("time: " + Math.round((now - timerStart) / 10) / 100, canvas.width / 2 - 30, 20)
}

function frame(now) {
    if (!running) return
    const dt = Math.min((now - lastTime) / 1000, 0.05) // clamp to avoid big jumps
    lastTime = now

    clear()
    update(dt)
    render(dt, now)

    requestAnimationFrame(frame)
}

requestAnimationFrame(frame)

window.addEventListener("keydown", (e) => {
    if (e.key === "r") { timerStart = performance.now() }
    if (e.code === "Space" && !plr.input.space) {
        plr.input.space = true
        jump()
    }
    if (e.key === "w") { plr.input.w = true }
    if (e.key === "s") { plr.input.s = true }
    if (e.key === "a") { plr.input.a = true }
    if (e.key === "d") { plr.input.d = true }
})

window.addEventListener("keyup", (e) => {
    if (e.key === "w") { plr.input.w = false }
    if (e.key === "s") { plr.input.s = false }
    if (e.key === "a") { plr.input.a = false }
    if (e.key === "d") { plr.input.d = false }
    if (e.code === "Space") { plr.input.space = false }
})

window.addEventListener("wheel", (e) => {
    ZOOM = Math.min(Math.max(ZOOM - Math.sign(e.deltaY) * 0.1, 0.2), 2)

    cam.pos = plr.pos.clone().add(new vec(plr.size, plr.size).div(2))
        .add(plr.vel.clone().mul(10))
        .add(new vec(-canvas.width, -canvas.height).div(2)
            .div(ZOOM)
        )
})



//////////////////

const musicSlider = document.getElementById("musicSlider");
musicSlider.value = music.volume * 100
musicSlider.addEventListener("input", () => {
    music.volume = Number(musicSlider.value) / 100
})
musicSlider.addEventListener("change", () => {
    localStorage.setItem("musicVol", String(Number(musicSlider.value) / 100));
})
