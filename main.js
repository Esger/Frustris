import Matter from 'matter-js';
import { TETROMINOES, BLOCK_SIZE } from './tetrominoes.js';

// Alias
const { Engine, Render, Runner, Bodies, Composite, Body, Events, Vector, Sleeping } = Matter;

class Frustris {
    constructor() {
        this.container = document.getElementById('game-canvas-container');
        this.scoreElement = document.getElementById('score-val');
        this.highScoreElement = document.getElementById('high-score-val');
        this.pileMeter = document.getElementById('pile-meter');
        this.gameOverScreen = document.getElementById('game-over');
        this.finalScoreElement = document.getElementById('final-score-val');
        this.restartBtn = document.getElementById('restart-btn');

        this.score = 0;
        this.highScore = parseInt(localStorage.getItem('frustris_highscore')) || 0;
        this.currentLevel = 1;
        this.minToClear = 3;
        this.isGameOver = false;
        this.isPaused = false;
        this.hasStarted = false;
        this.activePiece = null;
        this.keys = {};
        this.isTouchingPile = false;
        this.wasMoving = false;
        this.lastActionTime = Date.now();
        this.highScoreBroken = false;
        this.sessionInitialHighScore = this.highScore;

        this.pauseModal = document.getElementById('pause-modal');
        this.resumeBtn = document.getElementById('resume-btn');

        this.width = 400;
        this.height = 700;

        this.initPhysics();
        this.addEventListeners();
        this.updateUI();

    }

    initPhysics() {
        this.engine = Engine.create({
            gravity: { y: 0.3 },
            positionIterations: 6,
            velocityIterations: 6,
            enableSleeping: true
        });

        this.render = Render.create({
            element: this.container,
            engine: this.engine,
            options: {
                width: this.width,
                height: this.height,
                wireframes: false,
                background: 'transparent'
            }
        });

        const wallOptions = {
            isStatic: true,
            render: { fillStyle: 'transparent' },
            friction: 0.5,
            restitution: 0.1
        };
        const ground = Bodies.rectangle(this.width / 2, this.height + 250, this.width * 2, 500, wallOptions);
        const leftWall = Bodies.rectangle(-250, this.height / 2, 500, this.height * 2, wallOptions);
        const rightWall = Bodies.rectangle(this.width + 250, this.height / 2, 500, this.height * 2, wallOptions);

        Composite.add(this.engine.world, [ground, leftWall, rightWall]);

        Render.run(this.render);
        this.runner = Runner.create();
        Runner.run(this.runner, this.engine);
    }

    spawnPiece() {
        if (this.isGameOver || this.activePiece) return;

        const bodies = this.engine.world.bodies;
        const thresholdY = 160;
        let blocked = false;

        for (let i = 0; i < bodies.length; i++) {
            const b = bodies[i];
            if (b.label === 'settled' && b.position.y < thresholdY && b.speed < 0.1) {
                if (Math.abs(b.position.x - this.width / 2) < 100) {
                    blocked = true;
                    break;
                }
            }
        }

        if (blocked) {
            this.triggerGameOver();
            return;
        }

        const types = Object.keys(TETROMINOES);
        const type = types[Math.floor(Math.random() * types.length)];
        const data = TETROMINOES[type];

        const parts = data.shape.map(pos => {
            return Bodies.rectangle(
                pos[0] * BLOCK_SIZE,
                pos[1] * BLOCK_SIZE,
                BLOCK_SIZE - 2,
                BLOCK_SIZE - 2,
                {
                    render: { fillStyle: data.color },
                    chamfer: { radius: 4 },
                    sleepThreshold: 30
                }
            );
        });

        this.activePiece = Body.create({
            parts: parts,
            friction: 0.5,
            restitution: 0.2
        });

        this.activePiece.pieceType = type;
        Body.setPosition(this.activePiece, { x: this.width / 2, y: 50 });
        this.activePiece.label = 'active';
        this.activePiece.spawnTime = Date.now();
        this.activePiece.lastPos = { x: this.width / 2, y: 50 };
        this.activePiece.lastMoveTime = Date.now();
        this.isTouchingPile = false;
        this.lastActionTime = Date.now();

        Composite.add(this.engine.world, this.activePiece);
    }

    addEventListeners() {
        window.addEventListener('keydown', (e) => {
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD', 'Escape'].includes(e.code)) {
                e.preventDefault();
            }

            if (e.code === 'Escape' && !this.isGameOver && this.hasStarted) {
                this.togglePause();
            }
            this.keys[e.code] = true;
        });
        window.addEventListener('keyup', (e) => this.keys[e.code] = false);

        // Prevent context menu (right click) on the game
        window.addEventListener('contextmenu', (e) => e.preventDefault());

        this.restartBtn.addEventListener('click', (e) => {
            e.target.blur();
            location.reload();
        });

        this.resumeBtn.addEventListener('click', (e) => {
            e.target.blur();
            this.togglePause();
        });

        document.getElementById('play-btn').addEventListener('click', (e) => {
            e.target.blur();
            this.startGame();
        });

        document.getElementById('continue-btn-2').addEventListener('click', (e) => {
            e.target.blur();
            this.resumeAfterLevelUp('level-two-splash');
        });

        document.getElementById('continue-btn-3').addEventListener('click', (e) => {
            e.target.blur();
            this.resumeAfterLevelUp('level-three-splash');
        });

        this.initPointerControls();
    }

    startGame() {
        if (this.hasStarted) return;
        this.hasStarted = true;
        document.getElementById('start-splash').classList.add('hidden');
        this.spawnPiece();
        this.startGameLoop();
    }

    initPointerControls() {
        const touchZone = document.getElementById('touch-zone');
        const mobilePause = document.getElementById('mobile-pause');

        let lastX = 0;
        let lastY = 0;
        let hasMoved = false;
        let isDragging = false;

        const onStart = (clientX, clientY) => {
            lastX = clientX;
            lastY = clientY;
            hasMoved = false;
            isDragging = true;
        };

        const onMove = (clientX, clientY) => {
            if (this.isPaused || !this.activePiece || !isDragging) return;

            const dx = clientX - lastX;
            const dy = clientY - lastY;

            const moveSensitivity = 1.0;
            const rotateSensitivity = 0.05;

            if (Math.abs(dx) > 1) {
                const newX = this.activePiece.position.x + (dx * moveSensitivity);
                const clampedX = Math.max(20, Math.min(this.width - 20, newX));
                Body.setPosition(this.activePiece, { x: clampedX, y: this.activePiece.position.y });
                hasMoved = true;
            }

            if (Math.abs(dy) > 1) {
                Body.rotate(this.activePiece, dy * rotateSensitivity);
                hasMoved = true;
            }

            lastX = clientX;
            lastY = clientY;
        };

        const onEnd = () => {
            if (this.isPaused || !this.hasStarted || !isDragging) {
                isDragging = false;
                return;
            }

            if (!hasMoved) {
                this.keys['Space'] = true;
                setTimeout(() => { this.keys['Space'] = false; }, 50);
            }
            isDragging = false;
        };

        // Pointer Events (Unified Mouse/Touch)
        touchZone.addEventListener('pointerdown', (e) => {
            touchZone.setPointerCapture(e.pointerId);
            onStart(e.clientX, e.clientY);
        });

        touchZone.addEventListener('pointermove', (e) => {
            onMove(e.clientX, e.clientY);
        });

        touchZone.addEventListener('pointerup', (e) => {
            touchZone.releasePointerCapture(e.pointerId);
            onEnd();
        });

        touchZone.addEventListener('pointercancel', (e) => {
            touchZone.releasePointerCapture(e.pointerId);
            isDragging = false;
        });

        // Prevention for old mobile browsers / scrolling
        touchZone.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

        mobilePause.addEventListener('click', (e) => {
            e.target.blur();
            if (this.hasStarted) this.togglePause();
        });
    }

    togglePause() {
        if (!this.hasStarted) return;
        this.isPaused = !this.isPaused;
        if (this.isPaused) {
            this.pauseModal.classList.remove('hidden');
            this.runner.enabled = false;
        } else {
            this.pauseModal.classList.add('hidden');
            this.runner.enabled = true;
        }
    }

    handleInput() {
        if (!this.activePiece || this.isGameOver || this.isPaused) return;

        const moveSpeed = 6;
        const rotateSpeed = 0.08;
        let vx = 0;

        if (this.keys['ArrowLeft']) vx = -moveSpeed;
        if (this.keys['ArrowRight']) vx = moveSpeed;

        Body.setVelocity(this.activePiece, { x: vx, y: this.activePiece.velocity.y });

        if (this.keys['KeyA']) Body.rotate(this.activePiece, -rotateSpeed);
        if (this.keys['KeyD']) Body.rotate(this.activePiece, rotateSpeed);
        if (this.keys['ArrowDown']) Body.setVelocity(this.activePiece, { x: this.activePiece.velocity.x, y: 8 });

        if (this.keys['Space']) {
            if (!this.isTouchingPile) {
                Body.setVelocity(this.activePiece, { x: this.activePiece.velocity.x, y: 15 });
            } else {
                Body.setVelocity(this.activePiece, { x: this.activePiece.velocity.x, y: 0.01 });
            }
        }

        const pos = this.activePiece.position;
        if (pos.x < 15) Body.setPosition(this.activePiece, { x: 15, y: pos.y });
        if (pos.x > this.width - 15) Body.setPosition(this.activePiece, { x: this.width - 15, y: pos.y });
    }

    checkSettle() {
        if (this.isPaused || this.isGameOver) return;

        const now = Date.now();

        if (this.activePiece) {
            const bodies = this.engine.world.bodies;
            const obstacles = [];
            for (let i = 0; i < bodies.length; i++) {
                if (bodies[i].label === 'settled' || bodies[i].label === 'ground') {
                    obstacles.push(bodies[i]);
                }
            }

            const isTouching = Matter.Query.collides(this.activePiece, obstacles).length > 0;
            this.isTouchingPile = isTouching;

            const speed = this.activePiece.speed;
            const pos = this.activePiece.position;

            const distMoved = Vector.magnitude(Vector.sub(pos, this.activePiece.lastPos));
            if (distMoved > 2) {
                this.activePiece.lastPos = { x: pos.x, y: pos.y };
                this.activePiece.lastMoveTime = now;
            }
            const timeStagnant = now - this.activePiece.lastMoveTime;

            const isStuck = timeStagnant > 1500 && pos.y > 200;
            const atBottom = pos.y > this.height - 100;

            if ((speed < 1.2 && isTouching) || atBottom || isStuck) {
                this.activePiece.label = 'settled';
                this.activePiece = null;
                this.score += 10;
                this.lastActionTime = now;
                this.updateUI();
                this.checkClears();
                setTimeout(() => this.spawnPiece(), 300);
            }
        }

        const bodies = Composite.allBodies(this.engine.world);
        let movingCount = 0;
        let minY = this.height;

        for (let i = 0; i < bodies.length; i++) {
            const b = bodies[i];
            if (b.label === 'settled') {
                if (b.speed > 1.5) movingCount++;
                if (b.position.y < minY) minY = b.position.y;
            }
        }

        const anyMoving = movingCount > 0;

        if (this.wasMoving && !anyMoving) {
            this.checkClears();
            this.lastActionTime = now;
        }
        this.wasMoving = anyMoving;

        const heightOfPile = this.height - minY;
        const pilePercent = Math.max(0, Math.min(100, (heightOfPile / (this.height * 0.8)) * 100));
        this.pileMeter.style.width = `${pilePercent}%`;
        this.pileMeter.style.background = pilePercent > 85 ? 'var(--danger)' : 'var(--accent-secondary)';

        if (!this.activePiece && !anyMoving && (now - this.lastActionTime > 800)) {
            this.spawnPiece();
        }
    }

    triggerGameOver() {
        if (this.isGameOver) return;
        this.isGameOver = true;
        this.gameOverScreen.classList.remove('hidden');
        this.finalScoreElement.innerText = this.score;
        this.activePiece = null;
    }

    updateUI() {
        this.scoreElement.innerText = this.score.toString().padStart(6, '0');

        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('frustris_highscore', this.highScore);
            // Only shout if we beat a non-zero record from previous sessions
            if (!this.highScoreBroken && this.sessionInitialHighScore > 0 && this.score > this.sessionInitialHighScore) {
                this.highScoreBroken = true;
                this.showSpecialBonus('HIGH SCORE!');
            }
        }

        this.highScoreElement.innerText = this.highScore.toString().padStart(6, '0');

        if (this.currentLevel === 1 && this.score >= 5000) {
            this.levelUp(2);
        } else if (this.currentLevel === 2 && this.score >= 10000) {
            this.levelUp(3);
        }
    }

    levelUp(targetLevel) {
        this.currentLevel = targetLevel;
        this.minToClear = targetLevel + 2; // Level 1 -> 3, Level 2 -> 4, Level 3 -> 5
        this.isPaused = true;
        this.runner.enabled = false;

        const modalId = targetLevel === 2 ? 'level-two-splash' : 'level-three-splash';
        document.getElementById(modalId).classList.remove('hidden');
    }

    resumeAfterLevelUp(modalId) {
        this.isPaused = false;
        this.runner.enabled = true;
        document.getElementById(modalId).classList.add('hidden');
        this.lastActionTime = Date.now();
    }

    screenShake(magnitude = 5) {
        const originalTransform = this.container.style.transform;
        let count = 0;
        const interval = setInterval(() => {
            const x = (Math.random() - 0.5) * magnitude;
            const y = (Math.random() - 0.5) * magnitude;
            this.container.style.transform = `translate(${x}px, ${y}px)`;
            count++;
            if (count > 10) {
                clearInterval(interval);
                this.container.style.transform = originalTransform;
            }
        }, 30);
    }

    showSpecialBonus(text) {
        const bonus = document.createElement('div');
        bonus.className = 'clear-bonus';
        bonus.innerText = text;
        bonus.style.position = 'absolute';
        bonus.style.top = '50%';
        bonus.style.left = '50%';
        bonus.style.transform = 'translate(-50%, -50%)';
        bonus.style.fontSize = '48px';
        bonus.style.fontWeight = '900';
        bonus.style.color = 'var(--accent-secondary)';
        bonus.style.textShadow = '0 0 20px rgba(0, 229, 255, 0.8)';
        bonus.style.pointerEvents = 'none';
        bonus.style.zIndex = '1000';
        bonus.style.animation = 'bonusFade 1s forwards';

        this.container.appendChild(bonus);
        setTimeout(() => bonus.remove(), 1000);
    }

    showClearBonus() {
        const shoutouts = [
            'Yeeha!', 'Dope!', 'Yeah!', 'That\'s right!',
            'Awesome!', 'Slick!', 'Clean!', 'Wicked!',
            'Stellar!', 'Bam!', 'Kaboom!', 'Noice!',
            'Radical!', 'Superb!', 'Unstoppable!'
        ];
        const text = shoutouts[Math.floor(Math.random() * shoutouts.length)];
        this.showSpecialBonus(text);
    }

    checkClears() {
        const bodies = Composite.allBodies(this.engine.world);
        const byType = {};
        const settled = [];

        for (let i = 0; i < bodies.length; i++) {
            const b = bodies[i];
            if (b.label === 'settled' && b.parent === b) {
                settled.push(b);
                if (!byType[b.pieceType]) byType[b.pieceType] = [];
                byType[b.pieceType].push(b);
            }
        }

        if (settled.length < this.minToClear) return;

        const toRemove = new Set();
        const visited = new Set();

        for (const type in byType) {
            const pieces = byType[type];
            for (let i = 0; i < pieces.length; i++) {
                const piece = pieces[i];
                if (visited.has(piece.id)) continue;

                const group = [];
                const stack = [piece];
                visited.add(piece.id);

                while (stack.length > 0) {
                    const current = stack.pop();
                    group.push(current);

                    for (let j = 0; j < pieces.length; j++) {
                        const other = pieces[j];
                        if (visited.has(other.id)) continue;

                        let isTouching = false;
                        if (Matter.Query.collides(current, [other]).length > 0) {
                            isTouching = true;
                        }

                        if (!isTouching) {
                            const partsA = current.parts.length > 1 ? current.parts.slice(1) : [current];
                            const partsB = other.parts.length > 1 ? other.parts.slice(1) : [other];
                            const threshold = BLOCK_SIZE * 1.5;

                            outer: for (let pA of partsA) {
                                for (let pB of partsB) {
                                    const d = Vector.magnitude(Vector.sub(pA.position, pB.position));
                                    if (d < threshold) {
                                        isTouching = true;
                                        break outer;
                                    }
                                }
                            }
                        }

                        if (isTouching) {
                            visited.add(other.id);
                            stack.push(other);
                        }
                    }
                }

                if (group.length >= this.minToClear) {
                    for (let p of group) toRemove.add(p);
                }
            }
        }

        if (toRemove.size > 0) {
            this.screenShake(12);
            this.showClearBonus();

            // Progressive scoring logic: 100 base + 25% bonus for each piece above minimum
            const multiplier = 1 + (toRemove.size - this.minToClear) * 0.25;
            const pointsGained = Math.floor(toRemove.size * 100 * multiplier);

            this.score += pointsGained;
            toRemove.forEach(p => Composite.remove(this.engine.world, p));

            // Check for Perfect Clear
            const remainingSettled = bodies.filter(b => b.label === 'settled' && !toRemove.has(b));
            if (remainingSettled.length === 0) {
                this.score += 1000;
                this.showSpecialBonus('PERFECT CLEAR!');
            }

            const remaining = Composite.allBodies(this.engine.world);
            remaining.forEach(b => Sleeping.set(b, false));
            this.updateUI();
            this.lastActionTime = Date.now();
        }
    }

    startGameLoop() {
        const loop = () => {
            if (!this.isPaused) {
                this.handleInput();
                this.checkSettle();
            }
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }
}

new Frustris();
