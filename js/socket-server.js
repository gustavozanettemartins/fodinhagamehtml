// socket-server.js - Servidor WebSocket para o jogo Fodinha
// Este arquivo seria implementado no lado do servidor (Node.js)

const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

// Criar servidor HTTP
const server = http.createServer();
const io = new Server(server, {
    cors: {
        origin: "*", // Em produção, limite para sua origem
        methods: ["GET", "POST"]
    }
});

// Armazenamento de dados (em memória para este exemplo)
// Em produção, considere usar um banco de dados
const rooms = new Map();
const players = new Map();

// Configuração de eventos do socket
io.on('connection', (socket) => {
    console.log(`Novo jogador conectado: ${socket.id}`);
    
    // Registrar jogador no sistema
    socket.on('registerPlayer', (playerData) => {
        const playerId = socket.id;
        const player = {
            id: playerId,
            name: playerData.name || `Jogador${Math.floor(Math.random() * 1000)}`,
            avatar: playerData.avatar || 1,
            status: 'online',
            room: null,
            socket: socket // Armazenar a referência do socket para comunicações diretas
        };
        
        players.set(playerId, player);
        
        // Notificar o jogador que foi registrado com sucesso
        socket.emit('registered', {
            id: player.id,
            name: player.name,
            avatar: player.avatar,
            gamesPlayed: playerData.gamesPlayed || 0,
            gamesWon: playerData.gamesWon || 0
        });
        
        // Notificar todos os jogadores sobre o novo jogador
        broadcastPlayersList();
    });
    
    // Obter lista de salas
    socket.on('getRooms', () => {
        const roomsList = Array.from(rooms.values()).map(room => ({
            id: room.id,
            name: room.name,
            host: room.host.name,
            players: room.players.length,
            maxPlayers: room.maxPlayers,
            hasPassword: !!room.password,
            status: room.status
        }));
        
        socket.emit('roomsList', roomsList);
    });
    
    // Obter lista de jogadores
    socket.on('getPlayers', () => {
        const playersList = Array.from(players.values()).map(player => ({
            id: player.id,
            name: player.name,
            avatar: player.avatar,
            status: player.status,
            room: player.room,
            isHost: player.room && rooms.has(player.room) ? rooms.get(player.room).host.id === player.id : false
        }));
        
        socket.emit('playersList', playersList);
    });
    
    // Criar nova sala
    socket.on('createRoom', (roomData) => {
        const player = players.get(socket.id);
        if (!player) {
            socket.emit('error', { message: 'Jogador não registrado' });
            return;
        }
        
        // Se o jogador já está em uma sala, fazê-lo sair primeiro
        if (player.room && rooms.has(player.room)) {
            leaveRoom(player);
        }
        
        // Criar nova sala
        const roomId = uuidv4();
        const room = {
            id: roomId,
            name: roomData.name || `Sala de ${player.name}`,
            password: roomData.password || null,
            host: player,
            players: [player],
            maxPlayers: roomData.maxPlayers || 4,
            status: 'waiting',
            settings: {
                initialLives: roomData.initialLives || 5,
                firstRoundHidden: roomData.firstRoundHidden || false
            },
            game: null
        };
        
        rooms.set(roomId, room);
        
        // Atualizar status do jogador
        player.status = 'in_room';
        player.room = roomId;
        
        // Adicionar socket ao grupo da sala (para broadcasts específicos)
        socket.join(roomId);
        
        // Notificar jogador que a sala foi criada
        socket.emit('roomCreated', {
            id: room.id,
            name: room.name,
            isHost: true
        });
        
        // Enviar dados da sala para o jogador
        socket.emit('roomJoined', getRoomData(room));
        
        // Notificar a todos sobre a mudança nas listas
        broadcastRoomsList();
        broadcastPlayersList();
    });
    
    // Entrar em uma sala
    socket.on('joinRoom', (joinData) => {
        const player = players.get(socket.id);
        if (!player) {
            socket.emit('error', { message: 'Jogador não registrado' });
            return;
        }
        
        // Verificar se a sala existe
        const room = rooms.get(joinData.roomId);
        if (!room) {
            socket.emit('error', { message: 'Sala não encontrada' });
            return;
        }
        
        // Verificar se a sala está cheia
        if (room.players.length >= room.maxPlayers) {
            socket.emit('error', { message: 'Sala cheia' });
            return;
        }
        
        // Verificar se o jogo já começou
        if (room.status === 'playing') {
            socket.emit('error', { message: 'Jogo já iniciado' });
            return;
        }
        
        // Verificar senha se necessário
        if (room.password && room.password !== joinData.password) {
            socket.emit('error', { message: 'Senha incorreta' });
            return;
        }
        
        // Se o jogador já está em uma sala, fazê-lo sair primeiro
        if (player.room && rooms.has(player.room)) {
            leaveRoom(player);
        }
        
        // Adicionar jogador à sala
        room.players.push(player);
        
        // Atualizar status do jogador
        player.status = 'in_room';
        player.room = room.id;
        
        // Adicionar socket ao grupo da sala
        socket.join(room.id);
        
        // Notificar jogador que entrou na sala
        socket.emit('roomJoined', getRoomData(room));
        
        // Notificar outros jogadores na sala
        socket.to(room.id).emit('playerJoined', {
            id: player.id,
            name: player.name,
            avatar: player.avatar
        });
        
        // Notificar a todos sobre a mudança nas listas
        broadcastRoomsList();
        broadcastPlayersList();
    });
    
    // Sair de uma sala
    socket.on('leaveRoom', () => {
        const player = players.get(socket.id);
        if (!player || !player.room) return;
        
        leaveRoom(player);
        
        // Notificar jogador que saiu da sala
        socket.emit('roomLeft');
        
        // Notificar a todos sobre a mudança nas listas
        broadcastRoomsList();
        broadcastPlayersList();
    });
    
    // Iniciar jogo
    socket.on('startGame', () => {
        const player = players.get(socket.id);
        if (!player || !player.room) return;
        
        const room = rooms.get(player.room);
        if (!room || room.host.id !== player.id) {
            socket.emit('error', { message: 'Apenas o host pode iniciar o jogo' });
            return;
        }
        
        // Verificar se há jogadores suficientes
        if (room.players.length < 2) {
            socket.emit('error', { message: 'Necessário pelo menos 2 jogadores' });
            return;
        }
        
        // Iniciar o jogo
        startGame(room);
    });
    
    // Desconexão do jogador
    socket.on('disconnect', () => {
        const player = players.get(socket.id);
        if (!player) return;
        
        console.log(`Jogador desconectado: ${player.name} (${socket.id})`);
        
        // Se estiver em uma sala, removê-lo
        if (player.room && rooms.has(player.room)) {
            leaveRoom(player);
        }
        
        // Remover jogador do sistema
        players.delete(socket.id);
        
        // Notificar a todos sobre a mudança nas listas
        broadcastPlayersList();
        broadcastRoomsList();
    });
    
    // Eventos específicos do jogo
    
    // Palpite do jogador
    socket.on('makeGuess', (data) => {
        const player = players.get(socket.id);
        if (!player || !player.room) return;
        
        const room = rooms.get(player.room);
        if (!room || !room.game || room.game.phase !== 'guess') return;
        
        // Processar palpite (a lógica depende da implementação do jogo)
        processPlayerGuess(room, player, data.guess);
    });
    
    // Jogada de carta
    socket.on('playCard', (data) => {
        const player = players.get(socket.id);
        if (!player || !player.room) return;
        
        const room = rooms.get(player.room);
        if (!room || !room.game || room.game.phase !== 'play') return;
        
        // Processar jogada (a lógica depende da implementação do jogo)
        processPlayerCard(room, player, data.cardIndex);
    });
});

// Funções auxiliares

// Obter dados da sala (sem informações sensíveis)
function getRoomData(room) {
    return {
        id: room.id,
        name: room.name,
        host: {
            id: room.host.id,
            name: room.host.name,
            avatar: room.host.avatar
        },
        players: room.players.map(p => ({
            id: p.id,
            name: p.name,
            avatar: p.avatar,
            isHost: p.id === room.host.id
        })),
        maxPlayers: room.maxPlayers,
        status: room.status,
        settings: room.settings
    };
}

// Remover jogador de uma sala
function leaveRoom(player) {
    if (!player.room || !rooms.has(player.room)) return;
    
    const room = rooms.get(player.room);
    const roomId = room.id;
    
    // Remover jogador da lista de jogadores da sala
    const playerIndex = room.players.findIndex(p => p.id === player.id);
    if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);
    }
    
    // Verificar se era o host
    const wasHost = room.host.id === player.id;
    
    // Se era o host e há outros jogadores, transferir o host
    if (wasHost && room.players.length > 0) {
        room.host = room.players[0];
        
        // Notificar novo host
        const newHostSocket = room.host.socket;
        if (newHostSocket) {
            newHostSocket.emit('becameHost');
        }
        
        // Notificar todos na sala sobre o novo host
        io.to(roomId).emit('hostChanged', {
            id: room.host.id,
            name: room.host.name
        });
    }
    
    // Se não há mais jogadores, remover a sala
    if (room.players.length === 0) {
        rooms.delete(roomId);
    } else {
        // Notificar outros jogadores que alguém saiu
        io.to(roomId).emit('playerLeft', {
            id: player.id,
            name: player.name
        });
    }
    
    // Remover socket do grupo da sala
    player.socket.leave(roomId);
    
    // Atualizar status do jogador
    player.status = 'online';
    player.room = null;
}

// Enviar lista de salas para todos
function broadcastRoomsList() {
    const roomsList = Array.from(rooms.values()).map(room => ({
        id: room.id,
        name: room.name,
        host: room.host.name,
        players: room.players.length,
        maxPlayers: room.maxPlayers,
        hasPassword: !!room.password,
        status: room.status
    }));
    
    io.emit('roomsList', roomsList);
}

// Enviar lista de jogadores para todos
function broadcastPlayersList() {
    const playersList = Array.from(players.values()).map(player => ({
        id: player.id,
        name: player.name,
        avatar: player.avatar,
        status: player.status,
        room: player.room,
        isHost: player.room && rooms.has(player.room) ? rooms.get(player.room).host.id === player.id : false
    }));
    
    io.emit('playersList', playersList);
}

// Iniciar jogo
function startGame(room) {
    // Criar estado do jogo (a implementação depende das regras do jogo)
    room.game = {
        phase: 'guess',
        currentRound: 1,
        players: room.players.map(p => ({
            id: p.id,
            name: p.name,
            avatar: p.avatar,
            score: room.settings.initialLives,
            hand: [],
            guess: null,
            wins: 0,
            playedCard: null
        })),
        // Outros dados específicos do jogo
    };
    
    // Atualizar status da sala
    room.status = 'playing';
    
    // Atualizar status dos jogadores
    for (const player of room.players) {
        player.status = 'playing';
    }
    
    // Notificar jogadores sobre o início do jogo
    io.to(room.id).emit('gameStarted', {
        roomId: room.id,
        settings: room.settings,
        // Outros dados necessários para iniciar o jogo no cliente
    });
    
    // Notificar a todos sobre a mudança nas listas
    broadcastRoomsList();
    broadcastPlayersList();
    
    // Iniciar a primeira rodada
    startRound(room);
}

// Iniciar rodada
function startRound(room) {
    // Lógica para iniciar uma nova rodada
    // Distribuir cartas, definir trunfo, etc.
    
    // Notificar jogadores sobre o início da rodada
    io.to(room.id).emit('roundStarted', {
        round: room.game.currentRound,
        // Outros dados da rodada
    });
    
    // Enviar mãos para cada jogador individualmente
    for (const gamePlayer of room.game.players) {
        const player = players.get(gamePlayer.id);
        if (player && player.socket) {
            player.socket.emit('dealCards', {
                hand: gamePlayer.hand,
                // Outras informações específicas do jogador
            });
        }
    }
}

// Processar palpite do jogador
function processPlayerGuess(room, player, guess) {
    // Lógica para processar o palpite
    
    // Notificar todos na sala sobre o palpite
    io.to(room.id).emit('playerGuessed', {
        playerId: player.id,
        guess: guess
    });
    
    // Verificar se todos deram palpites e avançar para a fase de jogo
    // [implementação omitida]
}

// Processar jogada de carta
function processPlayerCard(room, player, cardIndex) {
    // Lógica para processar a jogada
    
    // Notificar todos na sala sobre a carta jogada
    io.to(room.id).emit('cardPlayed', {
        playerId: player.id,
        // Informações sobre a carta jogada
    });
    
    // Verificar se a rodada terminou e resolver
    // [implementação omitida]
}

// Iniciar o servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor WebSocket rodando na porta ${PORT}`);
});