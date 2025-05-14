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
            isReady: false
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
            if (this.sumGuesses > 0) {
                return [1];
            } else {
                return [0, 1];
            }
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

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log(`New connection: ${socket.id}`);
    
    // Create or join a game room
    socket.on('joinRoom', ({ playerName, roomId }) => {
        // Generate a room ID if not provided
        if (!roomId) {
            roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        }
        
        // Join the room
        socket.join(roomId);
        
        // Create game if it doesn't exist
        if (!gameRooms[roomId]) {
            gameRooms[roomId] = new Game(roomId);
        }
        
        // Add player to the game
        const game = gameRooms[roomId];
        const playerIndex = game.addPlayer({
            id: socket.id,
            name: playerName
        });
        
        // Store room ID in socket
        socket.roomId = roomId;
        
        // Notify everyone in the room
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
        
        // Send initial game state to the new player
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
        if (game.playCard(socket.id, cardIndex)) {
            // Notify all players about the updated game state
            game.players.forEach(player => {
                io.to(player.id).emit('gameState', game.getFullGameStateForPlayer(player.id));
            });
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
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        
        const game = gameRooms[roomId];
        const player = game.players.find(p => p.id === socket.id);
        const playerName = player ? player.name : "Um jogador";
        
        game.removePlayer(socket.id);
        
        // Notify other players
        io.to(roomId).emit('playerLeft', {
            playerId: socket.id,
            playerName: playerName,
            players: game.players.map(p => ({
                id: p.id,
                name: p.name,
                isReady: p.isReady
            }))
        });
        
        // If room is empty, delete it
        if (game.players.length === 0) {
            delete gameRooms[roomId];
        }
    });
});

// Start the server
const PORT = process.env.PORT || 8501;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 