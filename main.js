import Matter from 'matter-js';
import { TETROMINOES, BLOCK_SIZE } from './tetrominoes.js';

// Alias
const { Engine, Render, Runner, Bodies, Composite, Body, Events, Vector } = Matter;

class Frustris {
    constructor() {
        this.container = document.getElementById('game-canvas-container');
        this.scoreElement = document.getElementById('score-val');
        this.pileMeter = document.getElementById('pile-meter');
        this.gameOverScreen = document.getElementById('game-over');
        this.finalScoreElement = document.getElementById('final-score-val');
        this.restartBtn = document.getElementById('restart-btn');

        this.score = 0;
        this.isGameOver = false;
        this.isPaused = false;
        this.activePiece = null;
        this.keys = {};

        this.pauseModal = document.getElementById('pause-modal');
        this.resumeBtn = document.getElementById('resume-btn');
        this.controlsHint = document.querySelector('.controls-hint');

        // Fade instructions after 10 seconds
        setTimeout(() => {
            if (this.controlsHint) this.controlsHint.classList.add('faded');
        }, 10000);

        this.width = 400;
        this.height = 700;

        this.initPhysics();
        this.addEventListeners();
        this.spawnPiece();
        this.startGameLoop();
    }

    initPhysics() {
        this.engine = Engine.create({
            gravity: { y: 0.3 },
            positionIterations: 6, // Reduced from 10 for performance
            velocityIterations: 6, // Reduced from 10 for performance
            enableSleeping: true   // Allows settled pieces to stop being processed
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

        // Add boundaries - make them much thicker to prevent tunneling
        const wallOptions = {
            isStatic: true,
            render: { fillStyle: 'transparent' },
            friction: 0.5,
            restitution: 0.1
        };
        // Ground at the bottom edge, 500px thick
        const ground = Bodies.rectangle(this.width / 2, this.height + 250, this.width * 2, 500, wallOptions);
        // Side walls, 500px thick
        const leftWall = Bodies.rectangle(-250, this.height / 2, 500, this.height * 2, wallOptions);
        const rightWall = Bodies.rectangle(this.width + 250, this.height / 2, 500, this.height * 2, wallOptions);

        Composite.add(this.engine.world, [ground, leftWall, rightWall]);

        Render.run(this.render);
        this.runner = Runner.create();
        Runner.run(this.runner, this.engine);
    }

    spawnPiece() {
        if (this.isGameOver) return;

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
                    sleepThreshold: 30 // Make parts go to sleep faster
                }
            );
        });

        this.activePiece = Body.create({
            parts: parts,
            friction: 0.5,
            restitution: 0.2
        });

        // Store the piece type for match-3 logic
        this.activePiece.pieceType = type;

        // Strictly center the piece at the top
        Body.setPosition(this.activePiece, { x: this.width / 2, y: 50 });

        // Set initial label to identify active piece
        this.activePiece.label = 'active';

        Composite.add(this.engine.world, this.activePiece);
    }

    addEventListeners() {
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Escape' && !this.isGameOver) {
                this.togglePause();
            }
            this.keys[e.code] = true;
        });
        window.addEventListener('keyup', (e) => this.keys[e.code] = false);

        this.restartBtn.addEventListener('click', () => {
            location.reload();
        });

        this.resumeBtn.addEventListener('click', () => {
            this.togglePause();
        });

        // Check for collisions to settle pieces
        Events.on(this.engine, 'collisionStart', (event) => {
            event.pairs.forEach(pair => {
                if (pair.bodyA === this.activePiece || pair.bodyB === this.activePiece) {
                    // Start a timer to settle the piece? 
                    // Or just spawn next piece when the active one stops moving fast.
                }
            });
        });
    }

    togglePause() {
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

        // Apply horizontal velocity explicitly every update to prevent unwanted sliding
        // If vx is 0, it will stop the lateral movement immediately.
        Body.setVelocity(this.activePiece, { x: vx, y: this.activePiece.velocity.y });

        if (this.keys['KeyA']) {
            Body.rotate(this.activePiece, -rotateSpeed);
        }
        if (this.keys['KeyD']) {
            Body.rotate(this.activePiece, rotateSpeed);
        }
        if (this.keys['ArrowDown']) {
            Body.setVelocity(this.activePiece, { x: this.activePiece.velocity.x, y: 8 });
        }
        if (this.keys['Space']) {
            Body.setVelocity(this.activePiece, { x: this.activePiece.velocity.x, y: 15 });
        }

        // Keep inside horizontal walls - but using physics-friendly clamping
        const pos = this.activePiece.position;
        if (pos.x < 15) Body.setPosition(this.activePiece, { x: 15, y: pos.y });
        if (pos.x > this.width - 15) Body.setPosition(this.activePiece, { x: this.width - 15, y: pos.y });
    }

    checkSettle() {
        if (!this.activePiece) return;

        const vel = this.activePiece.velocity;
        const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);

        // If piece is slow and below a certain height, or has hit something and stopped
        if (speed < 0.2 && this.activePiece.position.y > 100) {
            this.activePiece.label = 'settled';
            this.activePiece = null;
            this.score += 10;
            this.updateUI();

            // Perform checks only when a piece actually settles
            this.checkClears();
            this.checkGameOver();

            setTimeout(() => this.spawnPiece(), 500);
        }
    }

    checkGameOver() {
        // Game over check - only if pile becomes extremely high (reaching top 15% of screen)
        const staticBodies = Composite.allBodies(this.engine.world).filter(b => b.label === 'settled');
        for (let b of staticBodies) {
            if (b.position.y < 100) {
                this.triggerGameOver();
                break;
            }
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

    showClearBonus() {
        const bonus = document.createElement('div');
        bonus.className = 'clear-bonus';
        bonus.innerText = 'FRUSTRIS!';
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

    checkClears() {
        const settled = Composite.allBodies(this.engine.world).filter(b => b.label === 'settled');

        // Update the pile meter based on height
        const minY = Math.min(...settled.map(b => b.position.y), this.height);
        const pilePercent = Math.max(0, Math.min(100, ((this.height - minY) / 400) * 100));
        this.pileMeter.style.width = `${pilePercent}%`;
        this.pileMeter.style.background = pilePercent > 80 ? 'var(--danger)' : 'var(--accent-secondary)';

        // Match-3 Logic: Remove 3+ pieces of the same type that are touching
        const toRemove = new Set();
        const visited = new Set();

        settled.forEach(piece => {
            if (visited.has(piece.id)) return;

            // Find all connected pieces of the same type
            const component = [];
            const stack = [piece];
            visited.add(piece.id);

            while (stack.length > 0) {
                const current = stack.pop();
                component.push(current);

                // Find neighbors of the same type that are touching
                settled.forEach(other => {
                    if (visited.has(other.id) || current.pieceType !== other.pieceType) return;

                    // Forgiving touch detection: 
                    // 1. Check direct collision
                    // 2. Check if any individual parts are within a small distance (5px buffer)
                    let isTouching = Matter.Query.collides(current, [other]).length > 0;

                    if (!isTouching) {
                        const threshold = BLOCK_SIZE + 5; // Allow 5px gap
                        const partsA = current.parts.slice(1);
                        const partsB = other.parts.slice(1);

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
                });
            }

            // If we found a group of 3 or more, mark them for removal
            if (component.length >= 3) {
                component.forEach(p => toRemove.add(p));
            }
        });

        if (toRemove.size > 0) {
            this.screenShake(12);
            this.showClearBonus();
            this.score += toRemove.size * 100;

            toRemove.forEach(p => {
                Composite.remove(this.engine.world, p);
            });
            this.updateUI();
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
