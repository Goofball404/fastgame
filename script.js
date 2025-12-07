const canvas = document.getElementById("canvas")
const ctx = canvas.getContext("2d")
ctx.imageSmoothingEnabled = false;

const colorPalette = {
    ground: "#040D12",
    backdrop: "#183D3D",
}
/*

{
    ground: "#040D12",
    backdrop: "#183D3D",

    ground: "#17153B",
    backdrop: "#2E236C",

    ground: "#181C14",
    backdrop: "#3C3D37",

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
        console.log('Music is playing!');
    } catch (err) {
        console.warn('Music autoplay prevented, waiting for user interaction...');
        // Retry after user interacts
        document.addEventListener('click', retryOnUserAction, { once: true });
    }
}

function retryOnUserAction() {
    music.play().then(() => {
        console.log('Music started after user interaction');
    }).catch(err => {
        console.error('Still failed to play music:', err);
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
    gridSnap() {
        this.x = Math.round(this.x / 32) * 32
        this.y = Math.round(this.y / 32) * 32
        return this
    }
    lerp(vecB, t) {
        this.x += (vecB.x - this.x) * t
        this.y += (vecB.y - this.y) * t
    }
    set(vecB) {
        this.x = vecB.x
        this.y = vecB.y
        return this
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
    new baseTile(new vec(cw * 0.5, ch * 0.9).gridSnap(), new vec(128, 32)),
    new baseTile(new vec(cw * 0.1, ch * 0.8).gridSnap(), new vec(128, 32)),
    new baseTile(new vec(cw * 0.8, ch * 0.6).gridSnap(), new vec(32, 200)),
    new baseTile(new vec(cw * 0.5, ch * 0.6).gridSnap(), new vec(128, 32)),
    new baseTile(new vec(cw * 0.6, ch * 0.7).gridSnap(), new vec(170, 32)),
]
let timerStart = performance.now()
let timerActive = false
const GRAV = 12
let ZOOM = 1


class player {
    constructor() {
        this.pos = new vec(cw / 2, ch - 32)
        this.vel = new vec(0, 0)
        this.moveVec = new vec(0, 0)
        this.size = 32

        this.airSpeed = 5
        this.walkSpeed = 15
        this.jumpPower = 5
        this.dashPower = 4

        this.groundFriction = 0.01
        this.airFriction = 0.3

        this.flightTime = 0
        this.isFlying = false
        this.dashCooldown = 0
        this.onGround = true
        this.didCollide = false
        this.dashActive = true
        this.coyoteTime = 0
        this.input = {
            w: false,
            s: false,
            a: false,
            d: false,
            space: false,
        }
    }
    moveAndCollide() {
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
    }
}
let plr = new player
let selectedObj = null
let editMode = false

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
    plr.moveVec = new vec(
        (plr.input.d ? 1 : 0) + (plr.input.a ? -1 : 0),
        (plr.input.w ? -1 : 0) + (plr.input.s ? 1 : 0)
    ).normalize()

    if (editMode) {
        cam.pos.add(plr.moveVec.clone().mul(2))
        selectedObj.pos.set(cam.pos).add(new vec(canvas.width, canvas.height).div(2)).gridSnap()
        return
    }

    cam.pos.lerp(plr.pos.clone().add(new vec(plr.size, plr.size).div(2)).add(plr.vel.clone().mul(10)).add(new vec(-canvas.width, -canvas.height).div(2).div(ZOOM)),
        1 - Math.pow(1 - 0.99, dt)
    )

    const velDamp = plr.onGround ? plr.groundFriction : plr.airFriction
    const moveMult = plr.onGround ? plr.walkSpeed : plr.airSpeed

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
        Math.round((pos.x - cam.pos.x) * ZOOM),
        Math.round((pos.y - cam.pos.y) * ZOOM),
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
        plr.flightTime > 0 ? "#fff" : "#a944e4ff"

    drawRect(plr.pos, new vec(plr.size, plr.size))

    ctx.fillStyle = colorPalette.ground
    for (let i in tiles) {
        const tile = tiles[i]
        drawRect(tile.pos, tile.scale)
    }

    ctx.fillStyle = "white"
    //ctx.textAlign = "center"
    //ctx.textBaseline = "middle"
    ctx.font = "20px Roboto Mono"
    const txt = timerActive ? Math.round((now - timerStart) / 10) / 100 : "..."
    ctx.fillText("time: " + txt, canvas.width / 2 - 30, 20)
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
    if (e.key === "r") { reset() }
    if (e.code === "Space" && !plr.input.space) {
        plr.input.space = true
        jump()
    }
    if (e.key === "w") { plr.input.w = true; if (!timerActive) { startTimer() } }
    if (e.key === "s") { plr.input.s = true; if (!timerActive) { startTimer() } }
    if (e.key === "a") { plr.input.a = true; if (!timerActive) { startTimer() } }
    if (e.key === "d") { plr.input.d = true; if (!timerActive) { startTimer() } }
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



/////////////

function reset() {
    plr = new player()
    timerActive = false
}
function startTimer() {
    timerStart = performance.now()
    timerActive = true
}
reset()


//////////////////

const musicSlider = document.getElementById("musicSlider");
musicSlider.value = music.volume * 100
musicSlider.addEventListener("input", () => {
    music.volume = Number(musicSlider.value) / 100
})
musicSlider.addEventListener("change", () => {
    localStorage.setItem("musicVol", String(Number(musicSlider.value) / 100));
})


/////////////

const explorerContent = document.getElementById("explorerContent");
function updateExplorer() {
    explorerContent.innerHTML = ""

    function newExplorerElement(obj, i) {
        const div = document.createElement("div")
        div.textContent = i + " " + "Tile"
        div.classList.add("explorerElement")

        const delBtn = document.createElement("button")
        delBtn.textContent = "X"
        delBtn.classList.add("red")

        const selBtn = document.createElement("button")
        selBtn.textContent = "Sel"
        selBtn.classList.add("blue")

        const p = document.createElement("p")
        p.textContent = Math.round(obj.pos.x) + ", " + Math.round(obj.pos.y)
        p.classList.add("subtext")

        explorerContent.appendChild(div)
        div.appendChild(selBtn)
        div.appendChild(delBtn)
        div.appendChild(p)

        delBtn.addEventListener("click", () => {
            tiles.splice(i, 1)
            updateExplorer()
        })
        selBtn.addEventListener("click", () => {
            selectedObj = obj
            cam.pos.set(selectedObj.pos).sub(new vec(canvas.width, canvas.height).div(2))
            editMode = true
        })
    }

    for (let i in tiles) {
        const obj = tiles[i]
        newExplorerElement(obj, i)
    }


    const btn = document.createElement("button")
    btn.textContent = "New Tile"
    btn.addEventListener("click", () => {
        tiles.push(
            new baseTile(cam.pos.clone().add(new vec(canvas.width / 2, canvas.height / 2)),
                new vec(32, 32))
        )
        updateExplorer()
    })
    explorerContent.appendChild(btn)

    const btn2 = document.createElement("button")
    btn2.textContent = "Unselect"
    btn2.addEventListener("click", () => {
        selectedObj = null
        editMode = false
    })
    explorerContent.appendChild(btn2)
}
updateExplorer()

