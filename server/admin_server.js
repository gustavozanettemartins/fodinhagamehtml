import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Admin authentication
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123'; // In production, use environment variables and proper password hashing

// File paths for persistent storage
const CONNECTION_HISTORY_FILE = path.join(__dirname, 'connection_history.json');
const BLOCKED_IPS_FILE = path.join(__dirname, 'blocked_ips.json');

// Initialize blocked IPs from file or create new Set
let blockedIPs = new Set();
try {
    if (fs.existsSync(BLOCKED_IPS_FILE)) {
        const blockedIPsData = JSON.parse(fs.readFileSync(BLOCKED_IPS_FILE, 'utf8'));
        blockedIPs = new Set(blockedIPsData);
    } else {
        fs.writeFileSync(BLOCKED_IPS_FILE, JSON.stringify([]));
    }
} catch (error) {
    console.error('Error loading blocked IPs:', error);
    blockedIPs = new Set();
}

// Initialize connection history file if it doesn't exist
if (!fs.existsSync(CONNECTION_HISTORY_FILE)) {
    fs.writeFileSync(CONNECTION_HISTORY_FILE, JSON.stringify([]));
}

// Function to save blocked IPs to file
function saveBlockedIPs() {
    try {
        fs.writeFileSync(BLOCKED_IPS_FILE, JSON.stringify(Array.from(blockedIPs)));
    } catch (error) {
        console.error('Error saving blocked IPs:', error);
    }
}

// Function to log connection
function logConnection(socketId, ip, event = 'connect') {
    try {
        const history = JSON.parse(fs.readFileSync(CONNECTION_HISTORY_FILE, 'utf8'));
        history.push({
            socketId,
            ip,
            event,
            timestamp: new Date().toISOString()
        });
        // Keep only last 1000 connections
        if (history.length > 1000) {
            history.shift();
        }
        fs.writeFileSync(CONNECTION_HISTORY_FILE, JSON.stringify(history, null, 2));
    } catch (error) {
        console.error('Error logging connection:', error);
    }
}

// Middleware to check if IP is blocked
const checkBlockedIP = (req, res, next) => {
    const ip = req.ip.replace(/^.*:/, '');
    if (blockedIPs.has(ip)) {
        return res.status(403).json({ error: 'IP bloqueado' });
    }
    next();
};

// Admin authentication middleware
const requireAdmin = (req, res, next) => {
    if (req.session.isAdmin) {
        next();
    } else {
        res.status(401).json({ error: 'Não autorizado' });
    }
};

// Setup admin routes
function setupAdminRoutes(app, io, gameRooms, disconnectTimeouts, playerQuitByRoom) {
    // Admin login route
    app.post('/admin/login', (req, res) => {
        const { username, password } = req.body;
        if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
            req.session.isAdmin = true;
            res.json({ success: true });
        } else {
            res.status(401).json({ error: 'Credenciais inválidas' });
        }
    });

    // Admin logout route
    app.post('/admin/logout', (req, res) => {
        req.session.destroy();
        res.json({ success: true });
    });

    // Check admin authentication status
    app.get('/admin/check-auth', (req, res) => {
        res.json({ isAdmin: !!req.session.isAdmin });
    });

    // Serve admin login page
    app.get('/admin-login', (req, res) => {
        res.sendFile(path.join(__dirname, '..', 'public', 'admin-login.html'));
    });

    // Serve admin dashboard (protected)
    app.get('/admin', requireAdmin, (req, res) => {
        res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
    });

    // Get admin data (protected)
    app.get('/admin/data', requireAdmin, (req, res) => {
        const roomList = Object.entries(gameRooms).map(([roomId, game]) => ({
            roomId,
            phase: game.phase,
            currentRound: game.currentRound,
            players: game.players.map(p => ({
                id: p.id,
                name: p.name,
                isReady: p.isReady,
                ip: p.ip || 'N/A'
            }))
        }));
        res.json(roomList);
    });

    // Get connection history (protected)
    app.get('/admin/connection-history', requireAdmin, (req, res) => {
        try {
            const history = JSON.parse(fs.readFileSync(CONNECTION_HISTORY_FILE, 'utf8'));
            res.json(history);
        } catch (error) {
            console.error('Error reading connection history:', error);
            res.status(500).json({ error: 'Erro ao ler histórico de conexões' });
        }
    });

    // Block IP (protected)
    app.post('/admin/block-ip', requireAdmin, (req, res) => {
        const { ip } = req.body;
        if (!ip) {
            return res.status(400).json({ error: 'IP não fornecido' });
        }
        blockedIPs.add(ip);
        saveBlockedIPs();
        res.json({ success: true });
    });

    // Unblock IP (protected)
    app.post('/admin/unblock-ip', requireAdmin, (req, res) => {
        const { ip } = req.body;
        if (!ip) {
            return res.status(400).json({ error: 'IP não fornecido' });
        }
        blockedIPs.delete(ip);
        saveBlockedIPs();
        res.json({ success: true });
    });

    // Get blocked IPs (protected)
    app.get('/admin/blocked-ips', requireAdmin, (req, res) => {
        const blockedIPsList = Array.from(blockedIPs).map(ip => ({
            address: ip,
            blockedAt: new Date().toISOString()
        }));
        res.json(blockedIPsList);
    });

    // Delete room (protected)
    app.post('/admin/delete-room', requireAdmin, (req, res) => {
        const { roomId } = req.body;
        if (!roomId) {
            return res.status(400).json({ error: 'ID da sala não fornecido' });
        }

        if (!gameRooms[roomId]) {
            return res.status(404).json({ error: 'Sala não encontrada' });
        }

        // Notify all clients in the room before deleting
        io.to(roomId).emit('deleteRoom', {
            message: 'Sala excluída pelo administrador',
            roomId: roomId
        });

        // Disconnect all players in the room
        const game = gameRooms[roomId];
        game.players.forEach(player => {
            const socket = Array.from(io.sockets.sockets.values())
                .find(s => s.id === player.id);
            if (socket) {
                socket.disconnect(true);
            }
        });

        // Remove the room
        delete gameRooms[roomId];
        delete disconnectTimeouts[roomId];
        delete playerQuitByRoom[roomId];

        res.json({ success: true });
    });

    // Delete all rooms (protected)
    app.post('/admin/delete-all-rooms', requireAdmin, (req, res) => {
        // Notify all clients in all rooms before deleting
        Object.keys(gameRooms).forEach(roomId => {
            io.to(roomId).emit('deleteRoom', {
                message: 'Sala excluída pelo administrador',
                roomId: roomId
            });
        });

        // Disconnect all players in all rooms
        Object.values(gameRooms).forEach(game => {
            game.players.forEach(player => {
                const socket = Array.from(io.sockets.sockets.values())
                    .find(s => s.id === player.id);
                if (socket) {
                    socket.disconnect(true);
                }
            });
        });

        // Clear all rooms
        Object.keys(gameRooms).forEach(roomId => {
            delete gameRooms[roomId];
            delete disconnectTimeouts[roomId];
            delete playerQuitByRoom[roomId];
        });

        res.json({ success: true });
    });

    // Kick player (protected)
    app.post('/admin/kick-player', requireAdmin, (req, res) => {
        const { roomId, playerId } = req.body;
        const game = gameRooms[roomId];
        
        if (!game) {
            return res.status(404).json({ error: 'Sala não encontrada' });
        }

        const player = game.players.find(p => p.id === playerId);
        if (!player) {
            return res.status(404).json({ error: 'Jogador não encontrado' });
        }

        // Find socket and disconnect
        const socket = Array.from(io.sockets.sockets.values())
            .find(s => s.id === playerId);
        
        if (socket) {
            socket.disconnect(true);
        }

        // Remove player from game
        game.removePlayer(playerId);

        res.json({ success: true });
    });

    // Setup socket event handlers for admin functionality
    io.on('connection', (socket) => {
        socket.on('deleteRoom', ({ roomId }) => {
            if (!roomId || !gameRooms[roomId]) return;
            
            const game = gameRooms[roomId];
            const player = game.players.find(p => p.id === socket.id);
            if (!player) return;

            // Remove player from game
            game.removePlayer(socket.id);
            
            // Notify the player
            socket.emit('roomDeleted', {
                message: 'Sala excluída pelo administrador',
                roomId: roomId
            });
        });
    });
}

export {
    setupAdminRoutes,
    checkBlockedIP,
    logConnection
}; 