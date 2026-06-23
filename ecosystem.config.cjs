module.exports = {
    apps: [
        {
            name: 'backend',
            script: './server.js',
            instances: 12,          // 7 clone-uri, câte unul per CPU liber
            exec_mode: 'cluster',  // ← magia: PM2 face fork + load balancing
            max_memory_restart: '1500M',
            env: {
                NODE_ENV: 'production',
                PORT: 4000,
            },
            // Restart automat dacă procesul moare
            autorestart: true,
            watch: false,
            // Graceful reload — nu taie conexiunile active
            wait_ready: true,
            listen_timeout: 10000,
            kill_timeout: 5000,
        },
        {
            name: 'worker',
            script: './src/mediaProcessing/mediaWorker.js',
            instances: 1,          // Worker-ul rămâne UN singur proces
            exec_mode: 'fork',     // ← fork, NU cluster (BullMQ nu suportă cluster)
            max_memory_restart: '2000M',
            env: {
                NODE_ENV: 'production'
            },
            autorestart: true,
            watch: false,
        },
        {
            name: 'nudenet',
            // Pornim uvicorn prin Python-ul DIN venv — așa importurile (nudenet, cv2) merg.
            script: 'venv/bin/python3',
            args: '-m uvicorn nudenet_service:app --host 127.0.0.1 --port 5000',
            cwd: './nudenet-service',   // rulează din folderul sidecarului; pune cale absolută dacă pm2 se plânge
            interpreter: 'none',        // ← CRITIC: scriptul e deja Python, nu-l rula prin Node
            instances: 1,
            exec_mode: 'fork',
            max_memory_restart: '1500M',
            autorestart: true,
            watch: false,
            env: {
                NODE_ENV: 'production'
            },
        }
    ]
};