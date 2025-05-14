// simple-server.js - Servidor WebSocket para o jogo Fodinha com uma única sala

const http = require('http');
const { Server } = require('socket.io');

// Criar servidor HTTP
const server = http.createServer();
const io = new Server(server, {
    cors: {
        origin: "*", // Em produção, limite para sua origem
        methods: ["GET", "POST"]
    }
});

// Armazenamento de dados do lobby
const lobby = {
    players: [],
    host: null,
    settings: {
        initialLives: 5,
        firstRoundHidden: false,
        maxPlayers: 8
    },
    gameState: null
};

// Configuração de eventos do socket
io.on('connection', (socket) => {
    console.log(`Novo jogador conectado: ${socket.id}`);
    
    // Registrar jogador no lobby
    socket.on('joinLobby', (playerData) => {
        // Verificar se o lobby está cheio
        if (lobby.players.length >= lobby.settings.maxPlayers) {
            socket.emit('error', { message: 'A sala está cheia.' });
            return;
        }
        
        // Verificar se o jogo já começou
        if (lobby.gameState && lobby.gameState.status === 'playing') {
            socket.emit('error', { message: 'O jogo já começou.' });
            return;
        }
        
        // Criar objeto do jogador
        const player = {
            id: socket.id,
            name: playerData.name || `Jogador${Math.floor(Math.random() * 1000)}`,
            avatar: playerData.avatar || 1,
            socket: socket, // Referência do socket para comunicação direta
            gamesPlayed: playerData.gamesPlayed || 0,
            gamesWon: playerData.gamesWon || 0,
            isHost: false
        };
        
        // Se for o primeiro jogador, definir como host
        if (lobby.players.length === 0) {
            player.isHost = true;
            lobby.host = player;
        }
        
        // Adicionar ao lobby
        lobby.players.push(player);
        
        // Notificar o jogador que entrou no lobby
        socket.emit('lobbyJoined', {
            id: player.id,
            players: getLobbyPlayers(),
            settings: getLobbySettings(),
            isHost: player.isHost
        });
        
        // Notificar os outros jogadores
        socket.broadcast.emit('playerJoined', {
            id: player.id,
            name: player.name,
            avatar: player.avatar,
            isHost: player.isHost
        });
        
        console.log(`Jogador ${player.name} entrou no lobby. Total: ${lobby.players.length}`);
    });
    
    // Jogador saiu ou desconectou
    socket.on('disconnect', () => {
        handlePlayerDisconnect(socket.id);
    });
    
    // Mensagem de chat
    socket.on('chatMessage', (data) => {
        // Encontrar jogador
        const player = lobby.players.find(p => p.id === socket.id);
        if (!player) return;
        
        // Criar objeto de mensagem
        const message = {
            id: player.id,
            sender: player.name,
            text: data.text,
            time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
        };
        
        // Transmitir para todos os jogadores
        io.emit('chatMessage', message);
    });
    
    // Atualizar configurações (apenas o host pode fazer isso)
    socket.on('updateSettings', (settings) => {
        const player = lobby.players.find(p => p.id === socket.id);
        if (!player || !player.isHost) {
            socket.emit('error', { message: 'Apenas o host pode atualizar as configurações.' });
            return;
        }
        
        // Atualizar configurações
        if (settings.initialLives) {
            lobby.settings.initialLives = Math.max(1, Math.min(10, settings.initialLives));
        }
        
        if (settings.firstRoundHidden !== undefined) {
            lobby.settings.firstRoundHidden = !!settings.firstRoundHidden;
        }
        
        // Notificar todos os jogadores sobre as novas configurações
        io.emit('settingsUpdated', getLobbySettings());
    });
    
    // Iniciar jogo (apenas o host pode fazer isso)
    socket.on('startGame', () => {
        const player = lobby.players.find(p => p.id === socket.id);
        if (!player || !player.isHost) {
            socket.emit('error', { message: 'Apenas o host pode iniciar o jogo.' });
            return;
        }
        
        // Verificar se há jogadores suficientes
        if (lobby.players.length < 2) {
            socket.emit('error', { message: 'Necessário pelo menos 2 jogadores para iniciar.' });
            return;
        }
        
        // Iniciar o jogo
        startGame();
    });
    
    // Eventos específicos do jogo
    
    // Palpite do jogador
    socket.on('makeGuess', (data) => {
        if (!lobby.gameState || lobby.gameState.status !== 'playing' || lobby.gameState.phase !== 'guess') {
            return;
        }
        
        const playerIndex = lobby.gameState.players.findIndex(p => p.id === socket.id);
        if (playerIndex === -1) return;
        
        // Processar palpite
        processPlayerGuess(playerIndex, data.guess);
    });
    
    // Jogada de carta
    socket.on('playCard', (data) => {
        if (!lobby.gameState || lobby.gameState.status !== 'playing' || lobby.gameState.phase !== 'play') {
            return;
        }
        
        const playerIndex = lobby.gameState.players.findIndex(p => p.id === socket.id);
        if (playerIndex === -1) return;
        
        // Processar jogada
        processPlayerCard(playerIndex, data.cardIndex);
    });
});

// Função para lidar com desconexão de jogador
function handlePlayerDisconnect(playerId) {
    const playerIndex = lobby.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return;
    
    const player = lobby.players[playerIndex];
    console.log(`Jogador ${player.name} desconectou.`);
    
    // Remover jogador do lobby
    lobby.players.splice(playerIndex, 1);
    
    // Se não há mais jogadores, resetar o lobby
    if (lobby.players.length === 0) {
        resetLobby();
        return;
    }
    
    // Se o jogador era o host, transferir para o próximo
    if (player.isHost) {
        const newHost = lobby.players[0];
        newHost.isHost = true;
        lobby.host = newHost;
        
        // Notificar o novo host
        newHost.socket.emit('becameHost');
        
        // Notificar todos sobre a mudança de host
        io.emit('hostChanged', newHost.id);
    }
    
    // Notificar todos que o jogador saiu
    io.emit('playerLeft', playerId);
    
    // Se um jogo estava em andamento, pode ser necessário ajustar
    if (lobby.gameState && lobby.gameState.status === 'playing') {
        handlePlayerLeaveGame(playerId);
    }
}

// Função para obter dados dos jogadores no lobby (sem dados sensíveis)
function getLobbyPlayers() {
    return lobby.players.map(player => ({
        id: player.id,
        name: player.name,
        avatar: player.avatar,
        isHost: player.isHost
    }));
}

// Função para obter configurações do lobby
function getLobbySettings() {
    return {
        initialLives: lobby.settings.initialLives,
        firstRoundHidden: lobby.settings.firstRoundHidden,
        maxPlayers: lobby.settings.maxPlayers
    };
}

// Resetar o lobby
function resetLobby() {
    lobby.players = [];
    lobby.host = null;
    lobby.gameState = null;
    
    // Resetar configurações para os padrões
    lobby.settings = {
        initialLives: 5,
        firstRoundHidden: false,
        maxPlayers: 8
    };
    
    console.log('Lobby resetado.');
}

// Iniciar jogo
function startGame() {
    console.log('Iniciando jogo...');
    
    // Criar estado do jogo
    lobby.gameState = {
        status: 'playing',
        phase: 'guess',
        currentRound: 1,
        players: lobby.players.map(p => ({
            id: p.id,
            name: p.name,
            avatar: p.avatar,
            score: lobby.settings.initialLives,
            hand: [],
            guess: null,
            wins: 0,
            playedCard: null
        })),
        deck: createAndShuffleDeck(),
        trumpCard: null,
        currentTurn: 0,
        roundDetails: {}
    };
    
    // Notificar todos os jogadores
    io.emit('gameStarted', {
        players: lobby.gameState.players.map(p => ({
            id: p.id,
            name: p.name,
            avatar: p.avatar,
            score: p.score
        })),
        settings: getLobbySettings(),
        round: lobby.gameState.currentRound
    });
    
    // Iniciar a primeira rodada
    startRound();
}

// Criar e embaralhar o baralho
function createAndShuffleDeck() {
    // Implementar lógica do baralho
    // Retornar array de cartas
}

// Iniciar rodada
function startRound() {
    // Definir carta de trunfo
    lobby.gameState.trumpCard = lobby.gameState.deck.pop();
    
    // Distribuir cartas para os jogadores
    dealCards();
    
    // Notificar jogadores sobre o início da rodada
    io.emit('roundStarted', {
        round: lobby.gameState.currentRound,
        trumpCard: lobby.gameState.trumpCard
    });
    
    // Enviar mãos para cada jogador individualmente
    for (const gamePlayer of lobby.gameState.players) {
        const player = lobby.players.find(p => p.id === gamePlayer.id);
        if (player && player.socket) {
            player.socket.emit('dealCards', {
                hand: gamePlayer.hand,
                firstRoundHidden: lobby.settings.firstRoundHidden && lobby.gameState.currentRound === 1
            });
        }
    }
}

// Distribuir cartas
function dealCards() {
    // Implementar lógica para distribuir cartas
}

// Processar palpite do jogador
function processPlayerGuess(playerIndex, guess) {
    const player = lobby.gameState.players[playerIndex];
    player.guess = guess;
    
    // Notificar todos do palpite
    io.emit('playerGuessed', {
        playerId: player.id,
        guess: guess
    });
    
    // Verificar se todos deram palpites
    if (allPlayersGuessed()) {
        // Mudar para fase de jogo
        lobby.gameState.phase = 'play';
        io.emit('phaseChanged', { phase: 'play' });
    }
}

// Verificar se todos os jogadores deram palpites
function allPlayersGuessed() {
    return lobby.gameState.players.every(p => p.guess !== null);
}

// Processar jogada de carta
function processPlayerCard(playerIndex, cardIndex) {
    const player = lobby.gameState.players[playerIndex];
    
    // Remover carta da mão e definir como carta jogada
    const card = player.hand.splice(cardIndex, 1)[0];
    player.playedCard = card;
    
    // Notificar todos da carta jogada
    io.emit('cardPlayed', {
        playerId: player.id,
        card: card
    });
    
    // Verificar se todos jogaram
    if (allPlayersPlayed()) {
        resolveRound();
    } else {
        // Próximo jogador
        lobby.gameState.currentTurn = (lobby.gameState.currentTurn + 1) % lobby.gameState.players.length;
        io.emit('turnChanged', { currentTurn: lobby.gameState.currentTurn });
    }
}

// Verificar se todos os jogadores jogaram cartas
function allPlayersPlayed() {
    return lobby.gameState.players.every(p => p.playedCard !== null);
}

// Resolver rodada
function resolveRound() {
    // Implementar lógica para determinar o vencedor da rodada
}

// Lidar com jogador que sai durante o jogo
function handlePlayerLeaveGame(playerId) {
    // Implementar lógica para lidar com jogador que sai
    // Pode ser necessário finalizar o jogo ou substituir por IA
}

// Iniciar o servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor WebSocket rodando na porta ${PORT}`);
});