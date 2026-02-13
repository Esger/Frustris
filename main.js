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
        this.activePiece = null;
        this.keys = {};

        this.width = 400;
        this.height = 700;

        this.initPhysics();
        this.addEventListeners();
        this.spawnPiece();
        this.startGameLoop();
    }

    initPhysics() {
        this.engine = Engine.create({
            gravity: { y: 0.3 } // Reduced gravity for slower fall
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

        // Add boundaries
        const wallOptions = { isStatic: true, render: { fillStyle: 'transparent' } };
        const ground = Bodies.rectangle(this.width / 2, this.height + 50, this.width, 100, wallOptions);
        const leftWall = Bodies.rectangle(-50, this.height / 2, 100, this.height, wallOptions);
        const rightWall = Bodies.rectangle(this.width + 50, this.height / 2, 100, this.height, wallOptions);

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
                    chamfer: { radius: 4 }
                }
            );
        });

        this.activePiece = Body.create({
            parts: parts,
            position: { x: this.width / 2, y: 50 },
            friction: 0.5,
            restitution: 0.2
        });

        // Set initial label to identify active piece
        this.activePiece.label = 'active';

        Composite.add(this.engine.world, this.activePiece);
    }

    addEventListeners() {
        window.addEventListener('keydown', (e) => this.keys[e.code] = true);
        window.addEventListener('keyup', (e) => this.keys[e.code] = false);

        this.restartBtn.addEventListener('click', () => {
            location.reload();
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

    handleInput() {
        if (!this.activePiece || this.isGameOver) return;

        const moveSpeed = 5;
        const rotateSpeed = 0.08;

        if (this.keys['ArrowLeft']) {
            Body.translate(this.activePiece, { x: -moveSpeed, y: 0 });
        }
        if (this.keys['ArrowRight']) {
            Body.translate(this.activePiece, { x: moveSpeed, y: 0 });
        }
        if (this.keys['KeyA']) {
            Body.rotate(this.activePiece, -rotateSpeed);
        }
        if (this.keys['KeyD']) {
            Body.rotate(this.activePiece, rotateSpeed);
        }
        if (this.keys['ArrowDown']) {
            Body.translate(this.activePiece, { x: 0, y: moveSpeed * 2 });
        }
        if (this.keys['Space']) {
            // "Hard drop" - set velocity down
            Body.setVelocity(this.activePiece, { x: this.activePiece.velocity.x, y: 15 });
        }

        // Keep inside horizontal walls
        const pos = this.activePiece.position;
        if (pos.x < 20) Body.setPosition(this.activePiece, { x: 20, y: pos.y });
        if (pos.x > this.width - 20) Body.setPosition(this.activePiece, { x: this.width - 20, y: pos.y });
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

            setTimeout(() => this.spawnPiece(), 500);
            this.checkClears();
        }

        // Game over check
        if (this.activePiece && this.activePiece.position.y > 100) {
            const staticBodies = Composite.allBodies(this.engine.world).filter(b => b.label === 'settled');
            staticBodies.forEach(b => {
                if (b.position.y < 100) {
                    this.triggerGameOver();
                }
            });
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

        const minY = Math.min(...settled.map(b => b.position.y), this.height);
        const pilePercent = Math.max(0, Math.min(100, ((this.height - minY) / this.height) * 100));
        this.pileMeter.style.width = `${pilePercent}%`;

        if (pilePercent > 80) {
            this.pileMeter.style.background = 'var(--danger)';
        } else {
            this.pileMeter.style.background = 'var(--accent-secondary)';
        }

        if (settled.length > 25) {
            settled.sort((a, b) => b.position.y - a.position.y);
            const toRemove = settled.slice(0, 5);

            this.screenShake(15);
            this.showClearBonus();
            this.score += 500;

            toRemove.forEach(b => {
                Composite.remove(this.engine.world, b);
            });
            this.updateUI();
        }
    }


    startGameLoop() {
        const loop = () => {
            this.handleInput();
            this.checkSettle();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }
}

new Frustris();
