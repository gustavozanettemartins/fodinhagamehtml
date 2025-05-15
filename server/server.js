const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

// Game constants
const VALUES = {4: 0, 5: 1, 6: 2, 7: 3, 10: 4, 11: 5, 12: 6, 1: 7, 2: 8, 3: 9};
const SUITS = {"diamonds": 0, "spades": 1, "hearts": 2, "clubs": 3};

// Initialize Express and Socket.io
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Serve static files
app.use(express.static(path.join(__dirname, '..')));

// Game rooms storage
const gameRooms = {};
const disconnectTimeouts = {};
const playerQuitByRoom = {};

// Game class for server-side logic
class Game {
    constructor(roomId) {
        this.roomId = roomId;
        this.players = [];
        this.deck = [];
        this.trumpCard = null;
        this.currentRound = 1;
        this.phase = 'waiting'; // 'waiting', 'guess', 'play'
        this.currentPlayerIndex = 0;
        this.dealerIndex = 0;
        this.semiRounds = 0;
        this.sumGuesses = 0;
        this.roundDetails = {};
        this.firstRound = true;
        this.isGameStarted = false;
        this.cardHistory = [];
        this.lastPlayedCard = null;
        this.lobbyAcceptances = new Set(); // Set of player IDs who accepted
    }

    resetLobbyAcceptances() {
        this.lobbyAcceptances.clear();
    }

    addPlayer(player) {
        this.players.push({
            id: player.id,
            name: player.name,
            score: 5, // Starting health
            hand: [],
            guess: null,
            wins: 0, 
            playedCard: null,
            isReady: false,
            persistentId: player.persistentId // Adicionar ID persistente
        });
        return this.players.length - 1; // Return player index
    }

    removePlayer(playerId) {
        const index = this.players.findIndex(p => p.id === playerId);
        if (index !== -1) {
            this.players.splice(index, 1);
            
            // If game started, need to adjust indices
            if (this.isGameStarted) {
                if (this.currentPlayerIndex >= this.players.length) {
                    this.currentPlayerIndex = 0;
                }
                if (this.dealerIndex >= this.players.length) {
                    this.dealerIndex = 0;
                }
            }
            
            return true;
        }
        return false;
    }

    setPlayerReady(playerId, isReady) {
        const player = this.players.find(p => p.id === playerId);
        if (player) {
            player.isReady = isReady;
            return true;
        }
        return false;
    }

    areAllPlayersReady() {
        return this.players.length >= 2 && this.players.every(p => p.isReady);
    }

    createDeck() {
        this.deck = [];
        for (const value in VALUES) {
            for (const suit in SUITS) {
                this.deck.push({
                    value: parseInt(value),
                    suit: suit
                });
            }
        }
        this.shuffleDeck();
    }
    
    shuffleDeck() {
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }
    
    startGame() {
        if (this.players.length < 2) return false;
        
        // Reset all player data
        this.players.forEach(player => {
            player.score = 5;
            player.hand = [];
            player.guess = null;
            player.wins = 0;
            player.playedCard = null;
        });
        
        // Reset card history
        this.cardHistory = [];
        this.lastPlayedCard = null;
        
        this.isGameStarted = true;
        this.startRound();
        return true;
    }
    
    startRound() {
        // Reset player data for the new round
        this.players.forEach(player => {
            player.hand = [];
            player.guess = null;
            player.wins = 0;
            player.playedCard = null;
        });
        
        // Create deck
        this.createDeck();
        
        // Set up the trump card
        this.trumpCard = this.deck.pop();
        
        // Deal cards
        this.dealCards();
        
        // Set up the phase
        this.phase = 'guess';
        this.semiRounds = 0;
        this.sumGuesses = 0;
        
        // First player is after the dealer
        this.currentPlayerIndex = (this.dealerIndex + 1) % this.players.length;
        
        // Reset last played card
        this.lastPlayedCard = null;
        
        return true;
    }
    
    dealCards() {
        const alivePlayers = this.getAlivePlayers();
        const cardsNeeded = this.currentRound * alivePlayers.length;
        
        // Check if we have enough cards
        if (this.deck.length < cardsNeeded) {
            this.currentRound = 1; // Reset to 1 card
        }
        
        // Deal cards to each player
        for (let i = 0; i < this.currentRound; i++) {
            for (const player of alivePlayers) {
                if (this.deck.length > 0) {
                    player.hand.push(this.deck.pop());
                }
            }
        }
    }
    
    getAlivePlayers() {
        return this.players.filter(player => player.score > 0);
    }
    
    getHandForPlayer(playerId) {
        const player = this.players.find(p => p.id === playerId);
        if (!player) return [];
        
        // Don't reveal cards in first round
        if (this.firstRound) {
            return player.hand.map(() => ({ hidden: true }));
        }
        
        return player.hand;
    }
    
    makeGuess(playerId, guessValue) {
        const playerIndex = this.players.findIndex(p => p.id === playerId);
        
        if (playerIndex === -1 || playerIndex !== this.currentPlayerIndex || this.phase !== 'guess') {
            return false;
        }
        
        this.players[playerIndex].guess = guessValue;
        this.sumGuesses += guessValue;
        
        // Move to next player
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        while (this.players[this.currentPlayerIndex].score <= 0) {
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        }
        
        // Check if all players have guessed
        if (this.allPlayersGuessed()) {
            this.phase = 'play';
            this.currentPlayerIndex = (this.dealerIndex + 1) % this.players.length;
            while (this.players[this.currentPlayerIndex].score <= 0) {
                this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
            }
        }
        
        return true;
    }
    
    allPlayersGuessed() {
        return this.getAlivePlayers().every(player => player.guess !== null);
    }
    
    playCard(playerId, cardIndex) {
        const playerIndex = this.players.findIndex(p => p.id === playerId);
        
        if (playerIndex === -1 || playerIndex !== this.currentPlayerIndex || this.phase !== 'play') {
            return false;
        }
        
        const player = this.players[playerIndex];
        
        if (cardIndex < 0 || cardIndex >= player.hand.length) {
            return false;
        }
        
        // Play the card
        const card = player.hand.splice(cardIndex, 1)[0];
        player.playedCard = card;
        
        // Save last played card for history
        this.lastPlayedCard = {
            playerId: playerId,
            playerName: player.name,
            card: card,
            round: this.currentRound,
            semiRound: this.semiRounds + 1
        };
        
        // Add to card history
        this.cardHistory.push(this.lastPlayedCard);
        
        // Move to next player
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        while (this.currentPlayerIndex < this.players.length && this.players[this.currentPlayerIndex].score <= 0) {
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        }
        
        // Check if all players have played
        if (this.allPlayersPlayed()) {
            this.resolveSemiRound();
        }
        
        return true;
    }
    
    allPlayersPlayed() {
        return this.getAlivePlayers().every(player => player.playedCard !== null);
    }
    
    resolveSemiRound() {
        // Get all played cards
        const alivePlayers = this.getAlivePlayers();
        const cards = alivePlayers.map(p => p.playedCard);
        
        // Find the winning card
        const winningCard = this.compareCards(cards);
        
        // Find the winner
        const winnerIndex = alivePlayers.findIndex(p => 
            p.playedCard && p.playedCard.value === winningCard.value && 
            p.playedCard.suit === winningCard.suit
        );
        
        if (winnerIndex !== -1) {
            // Increment wins for the winner
            alivePlayers[winnerIndex].wins++;
            
            // Next player is the winner
            this.currentPlayerIndex = this.players.indexOf(alivePlayers[winnerIndex]);
        }
        
        // Clear played cards
        for (const player of this.players) {
            player.playedCard = null;
        }
        
        // Increment semi-round counter
        this.semiRounds++;
        
        // Check if the round is over
        if (this.semiRounds === this.currentRound) {
            this.endRound();
        }
    }
    
    defineTrumpCardValue(card) {
        let trumpValue = card.value + 1;
        if (trumpValue > 7 && trumpValue < 10) {
            trumpValue = 10;
        } else if (trumpValue > 12) {
            trumpValue = 1;
        }
        return trumpValue;
    }
    
    compareCards(cards) {
        if (cards.length === 0) return null;
        
        let highest = cards[0];
        const trumpValue = this.defineTrumpCardValue(this.trumpCard);
        
        for (let i = 1; i < cards.length; i++) {
            const card = cards[i];
            
            if (highest.value === trumpValue || card.value === trumpValue) {
                if (card.value === trumpValue) {
                    if (highest.value === trumpValue) {
                        if (SUITS[highest.suit] < SUITS[card.suit]) {
                            highest = card;
                        }
                    } else {
                        highest = card;
                    }
                }
            } else {
                if (VALUES[highest.value] < VALUES[card.value]) {
                    highest = card;
                } else if (VALUES[highest.value] === VALUES[card.value]) {
                    if (SUITS[highest.suit] < SUITS[card.suit]) {
                        highest = card;
                    }
                }
            }
        }
        
        return highest;
    }
    
    endRound() {
        // Calculate damage
        this.roundDetails = {};
        
        for (const player of this.getAlivePlayers()) {
            const damage = Math.abs(player.wins - player.guess);
            const healthBefore = player.score;
            
            player.score -= damage;
            if (player.score < 0) player.score = 0;
            
            this.roundDetails[player.id] = {
                name: player.name,
                healthBefore: healthBefore,
                damageValue: damage,
                health: player.score,
                guessValue: player.guess,
                wins: player.wins
            };
        }
        
        this.phase = 'roundEnd';
    }
    
    nextRound() {
        // Check for game over
        if (this.checkGameEnd()) {
            this.phase = 'gameOver';
            return;
        }
        
        // Increment dealer index
        this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
        while (this.players[this.dealerIndex].score <= 0) {
            this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
        }
        
        // Increment round counter
        this.currentRound++;
        
        // No longer first round
        this.firstRound = false;
        
        // Reset card history for the new round
        this.cardHistory = [];
        this.lastPlayedCard = null;
        
        // Start new round
        this.startRound();
    }
    
    checkGameEnd() {
        const alivePlayers = this.getAlivePlayers();
        return alivePlayers.length <= 1;
    }
    
    getWinner() {
        const alivePlayers = this.getAlivePlayers();
        return alivePlayers.length > 0 ? alivePlayers[0] : null;
    }
    
    calculateDealerAllowedGuesses() {
        if (this.currentRound === 1) {
            return [1];                        
        } else {
            if (this.sumGuesses === this.currentRound) {
                return Array.from({length: this.currentRound}, (_, i) => i + 1);
            } else if (this.sumGuesses > this.currentRound) {
                return Array.from({length: this.currentRound + 1}, (_, i) => i);
            } else {
                return Array.from({length: this.currentRound + 1}, (_, i) => i)
                    .filter(n => n + this.sumGuesses !== this.currentRound);
            }
        }
    }
    
    isDealer(playerId) {
        return this.players[this.dealerIndex]?.id === playerId;
    }
    
    isCurrentPlayer(playerId) {
        return this.players[this.currentPlayerIndex]?.id === playerId;
    }
    
    getGameState() {
        return {
            roomId: this.roomId,
            players: this.players.map(p => ({
                id: p.id,
                name: p.name,
                score: p.score,
                guess: p.guess,
                wins: p.wins,
                playedCard: p.playedCard,
                handSize: p.hand.length,
                isReady: p.isReady
            })),
            trumpCard: this.trumpCard,
            currentRound: this.currentRound,
            phase: this.phase,
            currentPlayerIndex: this.currentPlayerIndex,
            dealerIndex: this.dealerIndex,
            firstRound: this.firstRound,
            semiRounds: this.semiRounds,
            roundDetails: this.roundDetails,
            cardHistory: this.cardHistory,
            lastPlayedCard: this.lastPlayedCard
        };
    }

    // Gets complete game state with all player hands for a specific player
    getFullGameStateForPlayer(playerId) {
        const gameState = this.getGameState();
        const playersWithHands = this.players.map(p => {
            // Create a copy of the player with basic info
            const playerInfo = {
                id: p.id,
                name: p.name,
                score: p.score,
                guess: p.guess,
                wins: p.wins,
                playedCard: p.playedCard,
                handSize: p.hand.length,
                isReady: p.isReady
            };
            
            // If it's the first round and not the current player, show cards
            if (this.firstRound && p.id !== playerId) {
                playerInfo.hand = p.hand; // Show full hand info
            } else if (p.id === playerId) {
                // For the current player - in first round, hide cards
                playerInfo.hand = this.firstRound ? 
                    p.hand.map(() => ({ hidden: true })) : 
                    p.hand;
            }
            
            return playerInfo;
        });
        
        return {
            ...gameState,
            players: playersWithHands,
            hand: this.getHandForPlayer(playerId)
        };
    }
}


function addSessionToRoom(roomId, persistentId) {
    // Se esse roomId ainda não tiver lista, cria uma vazia
    if (!playerQuitByRoom[roomId]) {
      playerQuitByRoom[roomId] = [];
    }
    // Adiciona o novo persistentId
    playerQuitByRoom[roomId].push(persistentId);
}
  
function removeSessionFromRoom(roomId, persistentId) {
    const list = playerQuitByRoom[roomId];
    if (!list) return;               // sala não existe → nada a fazer
    // Filtra o id que saiu
    playerQuitByRoom[roomId] = list.filter(id => id !== persistentId);
    // Se ficou vazio, delete o próprio roomId
    if (playerQuitByRoom[roomId].length === 0) {
      delete playerQuitByRoom[roomId];
    }
}
  
function hasSessionInRoom(roomId, persistentId) {
    const list = playerQuitByRoom[roomId];
    return Array.isArray(list) && list.includes(persistentId);
}

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log(`New connection: ${socket.id}`);
    
    // Create or join a game room
    socket.on('joinRoom', ({ playerName, roomId, persistentId, previousSocketId, isReconnecting }) => {
        
        const requestedRoom = Boolean(roomId);
        if (requestedRoom && !gameRooms[roomId] && !isReconnecting) {
          socket.emit('roomInvalid', {
            message: 'Esta sala não existe mais ou foi cancelada. Você será redirecionado para a lobby.'
          });
          return;
        }
                
        // Store session info in the socket for future use
        socket.persistentId = persistentId;
        socket.previousSocketId = previousSocketId;
        socket.playerName = playerName;

        if (hasSessionInRoom(roomId, persistentId)) {
            socket.emit('roomInvalid', {
                message: 'Esta sala não existe mais ou foi cancelada. Você será redirecionado para a lobby.'
            });
            return;
        }

        console.log(`Room join request: ${playerName} (socket: ${socket.id}, room: ${roomId})`);
        console.log(`- persistentId: ${persistentId || 'N/A'}, previousSocketId: ${previousSocketId || 'N/A'}, isReconnecting: ${!!isReconnecting}`);
        
        // Generate a room ID if not provided
        if (!roomId) {
            roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        }
        
        if (!gameRooms[roomId] && !isReconnecting) {
            gameRooms[roomId] = new Game(roomId);
            console.log(`New room created: ${roomId}`);
        } else if (!gameRooms[roomId] && isReconnecting) {
            console.log(`Room ${roomId} exists but has no players`);
            return;
        } else {
            console.log(`Room ${roomId} exists and has players`);
            if (gameRooms[roomId].players.length === 1 && gameRooms[roomId].phase !== 'waiting') {
                return;
            }      
        }

        const game = gameRooms[roomId];
    
        // ---- RECONNECTION HANDLING ----
        if (isReconnecting && (persistentId || previousSocketId)) {
            // Try to find the original player
            const originalPlayer = game.players.find(
                p => (persistentId && p.persistentId === persistentId) ||
                     (previousSocketId && p.id === previousSocketId)
            );
    
            if (originalPlayer) {
                const oldSocketId = originalPlayer.id;
                console.log(`Reconnection found: Updating socket id from ${oldSocketId} to ${socket.id} for player ${originalPlayer.name}`);
                
                if (disconnectTimeouts[oldSocketId]) {
                    clearTimeout(disconnectTimeouts[oldSocketId].timeout);
                    clearInterval(disconnectTimeouts[oldSocketId].interval);
                    delete disconnectTimeouts[oldSocketId];
                    console.log(`Reconexão de ${originalPlayer.name}: timeout/interval de remoção cancelado.`);
                }
                

                // Update id everywhere
                function patchAllIds(game, oldId, newId) {
                    // Player objects
                    for (const p of game.players) {
                        if (p.id === oldId) p.id = newId;
                    }
                    // Card history
                    if (Array.isArray(game.cardHistory)) {
                        for (const entry of game.cardHistory) {
                            if (entry.playerId === oldId) entry.playerId = newId;
                        }
                    }
                    // Last played card
                    if (game.lastPlayedCard && game.lastPlayedCard.playerId === oldId) {
                        game.lastPlayedCard.playerId = newId;
                    }
                    // Round details
                    function deepPatch(obj) {
                        if (obj && typeof obj === 'object') {
                            for (const key in obj) {
                                if (obj[key] === oldId) obj[key] = newId;
                                else if (typeof obj[key] === 'object' && obj[key] !== null) deepPatch(obj[key]);
                            }
                        }
                    }
                    deepPatch(game.roundDetails);
    
                    // Index references (current player, dealer)
                    if (game.currentPlayerIndex !== undefined && game.players[game.currentPlayerIndex]?.id === oldId) {
                        game.players[game.currentPlayerIndex].id = newId;
                    }
                    if (game.dealerIndex !== undefined && game.players[game.dealerIndex]?.id === oldId) {
                        game.players[game.dealerIndex].id = newId;
                    }
                }
                patchAllIds(game, oldSocketId, socket.id);
    
                // Make sure the persistent id is stored
                if (persistentId) {
                    originalPlayer.persistentId = persistentId;
                }
    
                socket.join(roomId);
                socket.roomId = roomId;
    
                // Sanity checks
                const allPlayerIds = game.players.map(p => p.id);
                if ((new Set(allPlayerIds)).size !== allPlayerIds.length) {
                    console.warn('Duplicate socket ids after reconnection!');
                }
    
                // Broadcast reconnection to others
                io.to(roomId).emit('playerReconnected', {
                    oldSocketId,
                    newSocketId: socket.id,
                    playerName: originalPlayer.name
                });
    
                // Broadcast updated player list
                io.to(roomId).emit('playerJoined', {
                    playerId: socket.id,
                    playerName: originalPlayer.name,
                    players: game.players.map(p => ({
                        id: p.id,
                        name: p.name,
                        isReady: p.isReady
                    })),
                    roomId
                });
    
                // Send game state to the reconnected player
                socket.emit('gameState', game.getFullGameStateForPlayer(socket.id));
                socket.emit('phaseChanged', {
                    phase: game.phase,
                    currentPlayer: game.players[game.currentPlayerIndex]?.id,
                    currentPlayerName: game.players[game.currentPlayerIndex]?.name
                });
    
                // If it's this player's turn and guess phase, prompt for guess
                if (game.phase === 'guess' && game.players[game.currentPlayerIndex]?.id === socket.id) {
                    socket.emit('awaitingGuess', {
                        playerId: socket.id,
                        round: game.currentRound
                    });
                }
    
                return;
            } else {
                console.log(`Player not found for reconnection. Will add as new player.`);
            }
        }
    
        // ---- NEW PLAYER JOIN ----
        // Check if this player (persistentId) already exists but was missed as a reconnect
        let alreadyExists = false;
        if (persistentId) {
            alreadyExists = game.players.some(p => p.persistentId === persistentId);
            if (alreadyExists) {
                console.warn('Player tried to join as new but persistentId already exists. Ignoring join.');
                socket.emit('roomError', { message: 'Already connected in another tab/session.', roomId });
                return;
            }
        }
    
        // Normal add
        const playerData = {
            id: socket.id,
            name: playerName,
            persistentId: persistentId || undefined
        };
        game.addPlayer(playerData);
        socket.join(roomId);
        socket.roomId = roomId;
    
        console.log(`New player added: ${playerName} (${socket.id}) in room ${roomId}`);
    
        io.to(roomId).emit('playerJoined', {
            playerId: socket.id,
            playerName,
            players: game.players.map(p => ({
                id: p.id,
                name: p.name,
                isReady: p.isReady
            })),
            roomId
        });
    
        socket.emit('gameState', game.getFullGameStateForPlayer(socket.id));
    });
    
    // Handle chat messages
    socket.on('chatMessage', ({ message, roomId }) => {
        if (!roomId || !gameRooms[roomId]) return;
        
        const game = gameRooms[roomId];
        const player = game.players.find(p => p.id === socket.id);
        
        if (!player) return;
        
        // Send the message to all clients in the room
        io.to(roomId).emit('chatMessage', {
            senderId: socket.id,
            sender: player.name,
            message: message,
            timestamp: Date.now()
        });
    });
    
    // Player ready status
    socket.on('playerReady', (isReady) => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        
        const game = gameRooms[roomId];
        game.setPlayerReady(socket.id, isReady);
        
        // Notify everyone of the status change
        io.to(roomId).emit('playerUpdate', {
            players: game.players.map(p => ({
                id: p.id,
                name: p.name,
                isReady: p.isReady
            }))
        });
        
        // Check if all players are ready to start
        if (game.areAllPlayersReady() && !game.isGameStarted) {
            game.startGame();
            
            // Notify all players about the game start
            game.players.forEach(player => {
                io.to(player.id).emit('gameState', game.getFullGameStateForPlayer(player.id));
            });
        }
    });
    
    // Player makes a guess
    socket.on('makeGuess', (guessValue) => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        
        const game = gameRooms[roomId];
        if (game.makeGuess(socket.id, guessValue)) {
            // Notify all players about the updated game state
            game.players.forEach(player => {
                io.to(player.id).emit('gameState', game.getFullGameStateForPlayer(player.id));
            });
        }
    });
    
    // Player plays a card
    socket.on('playCard', (cardIndex) => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        
        const game = gameRooms[roomId];

        // Antes de jogar, guarde o número de semiRounds
        const prevSemiRounds = game.semiRounds;
        if (game.playCard(socket.id, cardIndex)) {
            // Notify all players about the updated game state
            game.players.forEach(player => {
                io.to(player.id).emit('gameState', game.getFullGameStateForPlayer(player.id));
            });

            // Se houve um novo semi round (ou seja, todos jogaram), envie mensagem
            if (game.semiRounds > prevSemiRounds) {
                // Descubra quem ganhou a semi rodada
                const winner = game.players.find(p => p.id === game.players[game.currentPlayerIndex].id);
                const winnerCard = winner.playedCard || (game.cardHistory.find(c => c.playerId === winner.id && c.round === game.currentRound && c.semiRound === game.semiRounds) || {}).card;
                
                // Se winnerCard não estiver disponível, tente buscar no histórico da rodada
                if (!winnerCard) {
                    // Busca a última carta jogada pelo vencedor nesta rodada
                    const lastWinnerCard = [...game.cardHistory].reverse().find(c => c.playerId === winner.id && c.round === game.currentRound);
                    winnerCard = lastWinnerCard ? lastWinnerCard.card : null;
                }

                // Monta a mensagem
                if (winner && winnerCard) {
                    const suitMap = {
                        clubs: 'paus',
                        diamonds: 'ouros',
                        hearts: 'copas',
                        spades: 'espadas'
                    };
                    const cartaStr = `${winnerCard.value} de ${suitMap[winnerCard.suit] || winnerCard.suit}`;
                    io.to(roomId).emit('chatMessage', {
                        sender: 'Sistema',
                        message: `Jogador: ${winner.name} levou a rodada com a carta ${cartaStr}.`,
                        timestamp: Date.now()
                    });
                }
            }
        }
    });
    
    // Player continues to next round
    socket.on('continueToNextRound', () => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        
        const game = gameRooms[roomId];
        if (game.phase === 'roundEnd') {
            game.nextRound();
            
            // Notify all players about the updated game state
            game.players.forEach(player => {
                io.to(player.id).emit('gameState', game.getFullGameStateForPlayer(player.id));
            });
        }
    });
    
    // Player restarts the game
    socket.on('restartGame', () => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        
        const game = gameRooms[roomId];
        if (game.phase === 'gameOver') {
            // Reset game state
            game.currentRound = 1;
            game.firstRound = true;
            game.isGameStarted = false;
            
            // Reset players ready status
            game.players.forEach(player => {
                player.isReady = false;
            });
            
            // Notify all players
            io.to(roomId).emit('gameReset', {
                players: game.players.map(p => ({
                    id: p.id,
                    name: p.name,
                    isReady: p.isReady
                }))
            });
        }
    });
    
    // Disconnect handling
    socket.on('disconnect', () => {
        let secondsRemaining = 60;

        if (hasSessionInRoom(socket.roomId, socket.persistentId)) {
            secondsRemaining = 5;
        }

        console.log('PersistentId, RoomId: ', socket.persistentId, socket.roomId);
        
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
    
        const game = gameRooms[roomId];
        const player = game.players.find(p => p.id === socket.id);
        if (!player) return;
    
        console.log(`Player disconnected: ${socket.id} (${player.name}) - aguardando reconexão`);

        // Interval que loga a contagem regressiva
        const interval = setInterval(() => {
            secondsRemaining--;
            if (secondsRemaining > 0) {
                console.log(`[DEBUG] Jogador ${player.name} tem ${secondsRemaining} segundos para reconectar.`);
            }
        }, 1000);
    
        // Timeout para remoção após 60s
        const timeout = setTimeout(() => {
            clearInterval(interval);
    
            // Se ele já reconectou, seu id teria mudado (tratado no joinRoom), então não faz nada
            if (!game.players.some(p => p.id === socket.id)) {
                // jogador não está mais na lista: provavelmente já reconectou e trocou de socket.id
                delete disconnectTimeouts[socket.id];
                return;
            }
    
            // --- Remoção definitiva do jogador ---
            game.removePlayer(socket.id);
            console.log(`[DEBUG] Jogador ${player.name} removido da sala após 60 segundos sem reconectar.`);
    
            // Se sobrar pelo menos 2 jogadores, apenas notifica a saída
            if (game.players.length >= 2) {
                io.to(roomId).emit('playerLeft', {
                    playerId: socket.id,
                    playerName: player.name,
                    players: game.players.map(p => ({
                        id: p.id,
                        name: p.name,
                        isReady: p.isReady
                    })),
                    roomId
                });
                io.to(roomId).emit('chatMessage', {
                    senderId: socket.id,
                    sender: player.name,
                    message: 'Saiu da partida',
                    timestamp: Date.now()
                });
            } else {
                // Menos de 2 jogadores: cancela a partida
                game.phase = 'cancelled';
                io.to(roomId).emit('gameCancelled', {
                    message: 'Partida cancelada: jogadores insuficientes.'
                });
                console.log(`[DEBUG] Partida ${roomId} cancelada por falta de jogadores.`);
    
                // Remove a sala por completo
                delete gameRooms[roomId];
            }
    
            delete disconnectTimeouts[socket.id];
        }, 60000);
    
        // Guarda para possível cleanup em reconexão
        disconnectTimeouts[socket.id] = { timeout, interval };
    });
    
    // Add this new event handler for full sync requests
    socket.on('requestFullSync', () => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) {
            socket.emit('syncError', {
                message: 'Room not found for synchronization',
                attemptedRoomId: roomId
            });
            return;
        }
        
        const game = gameRooms[roomId];
        
        // Extra check to ensure the player is in the room
        const playerInGame = game.players.find(p => p.id === socket.id);
        if (!playerInGame) {
            console.error(`Sync error: player ${socket.id} not found in game. Available players:`, 
                game.players.map(p => ({ id: p.id, name: p.name })));
            
            // Check if anyone in the room has the same persistentId (if sent in connection)
            const socketData = socket.handshake.query;
            const persistentId = socketData.persistentId;
            
            if (persistentId) {
                const playerByPersistentId = game.players.find(p => p.persistentId === persistentId);
                if (playerByPersistentId) {
                    console.log(`Found player with same persistentId but different ID: ${playerByPersistentId.id}. Updating...`);
                    
                    // Update player ID to new socket
                    const oldSocketId = playerByPersistentId.id;
                    playerByPersistentId.id = socket.id;
                    
                    // Also update indices and references if needed
                    if (game.currentPlayerIndex !== undefined && 
                        game.players[game.currentPlayerIndex] && 
                        game.players[game.currentPlayerIndex].id === oldSocketId) {
                        game.players[game.currentPlayerIndex].id = socket.id;
                    }
                    
                    if (game.dealerIndex !== undefined && 
                        game.players[game.dealerIndex] && 
                        game.players[game.dealerIndex].id === oldSocketId) {
                        game.players[game.dealerIndex].id = socket.id;
                    }
                    
                    // Notify everyone about the reconnected player
                    io.to(roomId).emit('playerReconnected', {
                        oldSocketId: oldSocketId,
                        newSocketId: socket.id,
                        playerName: playerByPersistentId.name
                    });
                    
                    // Now we can proceed with synchronization
                    sendFullSync();
                    return;
                }
            }
            
            // If we got here, couldn't find the player
            socket.emit('syncError', {
                message: 'Sync failed: player not found in room',
                attemptedId: socket.id
            });
            return;
        }
        
        // Function to send complete synchronization
        function sendFullSync() {
            // Detailed game state log for debugging
            console.log(`Full sync request from player ${socket.id} (${playerInGame.name}):`);
            console.log(`- Game phase: ${game.phase}`);
            console.log(`- Current round: ${game.currentRound}`);
            console.log(`- Current player index: ${game.currentPlayerIndex}`);
            console.log(`- Current player: ${game.players[game.currentPlayerIndex]?.name || 'N/A'} (${game.players[game.currentPlayerIndex]?.id || 'N/A'})`);
            console.log(`- Total players: ${game.players.length}`);
            
            // Check if this player is on turn
            const isCurrentTurn = game.isCurrentPlayer(socket.id);
            console.log(`- Is this player's turn: ${isCurrentTurn}`);
            
            // Check hand size
            const handSize = game.players.find(p => p.id === socket.id)?.hand?.length || 0;
            console.log(`- Hand size: ${handSize}`);
            
            // Send complete game state to the player
            socket.emit('fullSyncResponse', {
                gameState: game.getFullGameStateForPlayer(socket.id),
                isYourTurn: isCurrentTurn,
                isDealer: game.isDealer(socket.id),
                timestamp: Date.now()
            });
            
            // Notify all players about who is the current player
            io.to(roomId).emit('currentPlayerUpdate', {
                currentPlayerIndex: game.currentPlayerIndex,
                currentPlayerId: game.players[game.currentPlayerIndex]?.id,
                currentPlayerName: game.players[game.currentPlayerIndex]?.name,
                phase: game.phase
            });
            
            // If it's the guess phase and it's the turn of the reconnecting player
            if (game.phase === 'guess' && isCurrentTurn) {
                socket.emit('awaitingGuess', {
                    playerId: socket.id,
                    round: game.currentRound
                });
            }
            
            // If it's the play phase and it's the turn of the reconnecting player
            if (game.phase === 'play' && isCurrentTurn) {
                socket.emit('yourTurn', {
                    playerId: socket.id,
                    message: "It's your turn to play a card"
                });
            }
        }
        
        // Send the synchronization
        sendFullSync();
    });

    // Add this to handle synchronization errors
    socket.on('syncError', (error) => {
        console.error('Sync error received:', error);
        io.to(socket.id).emit('syncError', {
            message: error.message || 'An error occurred during synchronization',
            code: error.code || 'SYNC_FAILED'
        });
    });

    socket.on('leaveRoom', ({ persistentId, roomId }) => {
        console.log('leaveRoom', { persistentId, roomId });
        
        if (!roomId || !gameRooms[roomId]) return;        
        
        addSessionToRoom(roomId, persistentId);
        
        console.log(playerQuitByRoom);
        
        const game = gameRooms[roomId];
        
        game.removePlayer(socket.id);
        
        if (game.players.length >= 2) {
            io.to(roomId).emit('playerLeft', {
                playerId: socket.id,
                playerName: player.name,
                players: game.players.map(p => ({
                    id: p.id,
                    name: p.name,
                    isReady: p.isReady
                })),
                roomId
            });
            io.to(roomId).emit('chatMessage', {
                senderId: socket.id,
                sender: player.name,
                message: 'Saiu da partida',
                timestamp: Date.now()
            });
        } else {
            // Menos de 2 jogadores: cancela a partida
            game.phase = 'cancelled';
            io.to(roomId).emit('gameCancelled', {
                message: 'Partida cancelada: jogadores insuficientes.'
            });
            console.log(`[DEBUG] Partida ${roomId} cancelada por falta de jogadores.`);

            // Remove a sala por completo
            delete gameRooms[roomId];
        }
    });

    socket.on('acceptReturnToLobby', ({ roomId }) => {
        const game = gameRooms[roomId];
        if (!game) return;

        // Add player to the set
        game.lobbyAcceptances.add(socket.id);

        // Notify everyone about current acceptances
        io.to(roomId).emit('lobbyAcceptanceUpdate', {
            accepted: Array.from(game.lobbyAcceptances),
            total: game.players.map(p => p.id),
        });

        // If all players have accepted, reset the game
        const aliveIds = game.players.map(p => p.id);
        const allAccepted = aliveIds.every(id => game.lobbyAcceptances.has(id));
        if (allAccepted) {
            game.resetLobbyAcceptances();
            // Reset game to lobby state
            game.phase = 'waiting';
            game.isGameStarted = false;
            game.players.forEach(p => p.isReady = false);
            io.to(roomId).emit('returnToLobby');
            io.to(roomId).emit('playerJoined', {
                players: game.players.map(p => ({
                    id: p.id,
                    name: p.name,
                    isReady: p.isReady
                })),
                roomId
            });
        }
    });
});

// Start the server
const PORT = process.env.PORT || 8501;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 