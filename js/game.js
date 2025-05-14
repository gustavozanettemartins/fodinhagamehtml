// Game constants
const VALUES = {4: 0, 5: 1, 6: 2, 7: 3, 10: 4, 11: 5, 12: 6, 1: 7, 2: 8, 3: 9};
const SUITS = {"diamonds": 0, "spades": 1, "hearts": 2, "clubs": 3};
const SUIT_SYMBOLS = {"diamonds": "♦", "spades": "♠", "hearts": "♥", "clubs": "♣"};
const SUIT_COLORS = {"diamonds": "red", "spades": "black", "hearts": "red", "clubs": "black"};

// Game variables
let socket;
let playerId;
let roomId;
let playerName;
let gameState;
let playerHand = [];
let selectedCardIndex = null;
let modalPreferences = {
    guessModalMinimized: false,
    roundSummaryMinimized: false
};
let isPlayerReady = false;
let soundEnabled = true; // Sound on by default

// Sound effects
const soundEffects = {
    cardPlay: new Audio('sounds/card-play.mp3'),
    cardShuffle: new Audio('sounds/card-shuffle.mp3'),
    guess: new Audio('sounds/guess-sound.mp3'),
    roundFinished: new Audio('sounds/round-finished.mp3')
};

// Preload sounds
function preloadSounds() {
    for (const sound in soundEffects) {
        soundEffects[sound].load();
    }
}

// Function to play a sound
function playSound(soundName) {
    if (!soundEnabled) return;
    
    if (soundEffects[soundName]) {
        // Stop and reset the sound first to allow replaying
        soundEffects[soundName].pause();
        soundEffects[soundName].currentTime = 0;
        
        // Play the sound
        soundEffects[soundName].play().catch(error => {
            console.log(`Error playing sound: ${error.message}`);
        });
    }
}

// Card helper functions
function getCardImagePath(card) {
    if (card.hidden) {
        return "img/reverso.png";
    }
    const valueStr = card.value < 10 ? `0${card.value}` : card.value;
    return `img/${valueStr}-${card.suit}.png`;
}

function getBackImagePath() {
    return "img/reverso.png";
}

// UI Elements
const joinRoomModal = document.getElementById('join-room-modal');
const waitingRoomModal = document.getElementById('waiting-room-modal');
const guessModal = document.getElementById('guess-modal');
const gameOverModal = document.getElementById('game-over-modal');
const roundSummaryModal = document.getElementById('round-summary-modal');

const playerNameInput = document.getElementById('player-name');
const roomIdInput = document.getElementById('room-id');
const joinRoomBtn = document.getElementById('join-room-btn');
const roomCodeDisplay = document.getElementById('room-code');
const copyRoomCodeBtn = document.getElementById('copy-room-code');
const playersList = document.getElementById('players-list');
const playerReadyBtn = document.getElementById('player-ready-btn');

const currentRoomCodeDisplay = document.getElementById('current-room-code');
const playersCountDisplay = document.getElementById('players-count');
const soundToggleBtn = document.getElementById('sound-toggle-btn');

const confirmGuessBtn = document.getElementById('confirm-guess-btn');
const guessValueInput = document.getElementById('guess-value');
const dealerRestrictionsEl = document.getElementById('dealer-restrictions');
const playCardBtn = document.getElementById('play-card-btn');
const continueBtn = document.getElementById('continue-btn');
const newGameBtn = document.getElementById('new-game-btn');
const waitingMessageEl = document.getElementById('waiting-message');

const roundNumberEl = document.getElementById('round-number');
const phaseTextEl = document.getElementById('phase-text');
const playerLivesEl = document.getElementById('player-lives');
const playersContainerEl = document.getElementById('players-container');
const playerHandEl = document.getElementById('player-hand');
const trumpCardEl = document.getElementById('trump-card');
const tableRoundEl = document.getElementById('table-round');
const summaryTableBodyEl = document.getElementById('summary-body');
const winnerTextEl = document.getElementById('winner-text');
const cardHistoryEl = document.getElementById('card-history');

// Chat elements
const chatMessagesEl = document.getElementById('chat-messages');
const chatInputEl = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');

// Elements for minimize/maximize
let minimizeButtons;
let maximizeButtons;

// Function to detect if the device is a mobile/touch device
function isTouchDevice() {
    return (('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0) ||
        (navigator.msMaxTouchPoints > 0));
}

// Socket.io initialization
function initializeSocket() {
    socket = io();
    
    // Socket event listeners
    socket.on('connect', () => {
        playerId = socket.id;
        console.log('Connected to server with ID:', playerId);
    });
    
    socket.on('playerJoined', (data) => {
        console.log('Player joined:', data);
        updatePlayersList(data.players);
        roomId = data.roomId;
        currentRoomCodeDisplay.textContent = roomId;
        roomCodeDisplay.textContent = roomId;
        playersCountDisplay.textContent = data.players.length;
        
        // Add system message to chat
        addSystemMessage(`${data.playerName} entrou na sala.`);
    });
    
    socket.on('playerUpdate', (data) => {
        console.log('Player update:', data);
        updatePlayersList(data.players);
        playersCountDisplay.textContent = data.players.length;
    });
    
    socket.on('playerLeft', (data) => {
        console.log('Player left:', data);
        updatePlayersList(data.players);
        playersCountDisplay.textContent = data.players.length;
        
        // Add system message to chat using the name from the event data
        addSystemMessage(`${data.playerName} saiu da sala.`);
    });
    
    socket.on('gameState', (data) => {
        console.log('Game state update:', data);
        
        // Play card shuffle sound when entering a new round (guess phase)
        if (gameState && gameState.phase !== 'guess' && data.phase === 'guess' && data.semiRounds === 0) {
            playSound('cardShuffle');
        }
        
        gameState = data;
        
        if (data.hand) {
            playerHand = data.hand;
        }
        
        updateGameUI();
        
        // Handle phase transitions
        if (data.phase === 'guess' && isCurrentPlayer()) {
            showGuessModal();
        } else if (data.phase === 'roundEnd') {
            playSound('roundFinished');
            showRoundSummary();
        } else if (data.phase === 'gameOver') {
            showGameOver();
        }
        
        // Play card sound if someone just played a card
        if (data.lastPlayedCard && 
            (!gameState.previousLastPlayedCard || 
             gameState.previousLastPlayedCard.round !== data.lastPlayedCard.round || 
             gameState.previousLastPlayedCard.semiRound !== data.lastPlayedCard.semiRound ||
             gameState.previousLastPlayedCard.playerId !== data.lastPlayedCard.playerId)) {
            
            // Don't play sound for our own card (we'll play it when we click)
            if (data.lastPlayedCard.playerId !== playerId) {
                playSound('cardPlay');
            }
            
            // Store the last played card to avoid duplicate sounds
            gameState.previousLastPlayedCard = data.lastPlayedCard;
        }
    });
    
    socket.on('gameReset', (data) => {
        console.log('Game reset:', data);
        // Show waiting room again
        hideAllModals();
        waitingRoomModal.style.display = 'flex';
        isPlayerReady = false;
        playerReadyBtn.textContent = 'Pronto';
        updatePlayersList(data.players);
        
        // Add system message to chat
        addSystemMessage("Jogo reiniciado. Aguardando jogadores ficarem prontos.");
    });
    
    // Chat message received
    socket.on('chatMessage', (data) => {
        console.log('Chat message received:', data);
        addChatMessage(data.sender, data.message, data.senderId === playerId);
    });
}

// Event Listeners
function setupEventListeners() {
    // Join room button
    joinRoomBtn.addEventListener('click', () => {
        playerName = playerNameInput.value.trim();
        const roomIdValue = roomIdInput.value.trim();
        
        if (playerName) {
            socket.emit('joinRoom', { 
                playerName, 
                roomId: roomIdValue || null 
            });
            joinRoomModal.style.display = 'none';
            waitingRoomModal.style.display = 'flex';
        }
    });
    
    // Copy room code button
    copyRoomCodeBtn.addEventListener('click', () => {
        const roomCode = roomCodeDisplay.textContent;
        navigator.clipboard.writeText(roomCode).then(() => {
            copyRoomCodeBtn.textContent = 'Copiado!';
            setTimeout(() => {
                copyRoomCodeBtn.textContent = 'Copiar';
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy: ', err);
        });
    });
    
    // Player ready button
    playerReadyBtn.addEventListener('click', () => {
        isPlayerReady = !isPlayerReady;
        playerReadyBtn.textContent = isPlayerReady ? 'Aguardando' : 'Pronto';
        socket.emit('playerReady', { ready: isPlayerReady });
    });
    
    // Guess confirm button
    confirmGuessBtn.addEventListener('click', () => {
        const guessValue = parseInt(guessValueInput.value);
        
        if (!isNaN(guessValue)) {
            // Check if dealer has restrictions
            if (isDealerPlayer(playerId)) {
                const totalCards = gameState.round;
                const currentSum = gameState.players.reduce((sum, player) => {
                    return player.id !== playerId && player.guess !== null ? sum + player.guess : sum;
                }, 0);
                
                if (guessValue + currentSum === totalCards) {
                    alert("Como distribuidor, você não pode dar um palpite que faça o total igual ao número de cartas!");
                    return;
                }
            }
            
            socket.emit('makeGuess', { guess: guessValue });
            guessModal.style.display = 'none';
            playSound('guess');
        }
    });
    
    // Continue button
    continueBtn.addEventListener('click', () => {
        roundSummaryModal.style.display = 'none';
        socket.emit('readyForNextRound');
    });
    
    // New game button
    newGameBtn.addEventListener('click', () => {
        gameOverModal.style.display = 'none';
        waitingRoomModal.style.display = 'flex';
        isPlayerReady = false;
        playerReadyBtn.textContent = 'Pronto';
        socket.emit('playerReady', { ready: false });
    });
    
    // Play card button
    playCardBtn.addEventListener('click', () => {
        if (selectedCardIndex !== null && isCurrentPlayer()) {
            const card = playerHand[selectedCardIndex];
            socket.emit('playCard', { cardIndex: selectedCardIndex });
            playSound('cardPlay');
            selectedCardIndex = null;
            updatePlayerHandUI();
        }
    });
    
    // Sound toggle button
    soundToggleBtn.addEventListener('click', toggleSound);
    
    // Chat send button
    sendChatBtn.addEventListener('click', sendChatMessage);
    
    // Chat input enter key
    chatInputEl.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });
    
    // Set up minimize buttons
    setupMinimizeButtons();
    
    // Handle touch events for mobile devices
    if (isTouchDevice()) {
        setupTouchEvents();
    }
    
    // Load sound preference from localStorage
    loadSoundPreference();
}

// Function to send chat message
function sendChatMessage() {
    const message = chatInputEl.value.trim();
    if (message.length === 0) return;
    
    // Send message to server
    socket.emit('chatMessage', {
        message: message,
        roomId: roomId
    });
    
    // Clear input field
    chatInputEl.value = '';
}

// Function to add a chat message to the chat panel
function addChatMessage(sender, message, isOwnMessage) {
    const messageEl = document.createElement('div');
    messageEl.className = `chat-message ${isOwnMessage ? 'own-message' : ''}`;
    
    messageEl.innerHTML = `
        <div class="chat-message-sender">${sender}:</div>
        <div class="chat-message-text">${escapeHTML(message)}</div>
    `;
    
    chatMessagesEl.appendChild(messageEl);
    
    // Scroll to bottom
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

// Function to add a system message
function addSystemMessage(message) {
    const messageEl = document.createElement('div');
    messageEl.className = 'system-message';
    messageEl.textContent = message;
    
    chatMessagesEl.appendChild(messageEl);
    
    // Scroll to bottom
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

// Helper function to escape HTML
function escapeHTML(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// UI Update Functions
function updatePlayersList(players) {
    playersList.innerHTML = '';
    
    players.forEach(player => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>${player.name}${player.id === playerId ? ' (Você)' : ''}</span>
            <span class="${player.isReady ? 'player-ready' : 'player-waiting'}">${player.isReady ? 'Pronto' : 'Esperando'}</span>
        `;
        playersList.appendChild(li);
    });
}

function updateGameUI() {
    if (!gameState) return;
    
    // Hide waiting room if game started
    if (gameState.phase !== 'waiting') {
        waitingRoomModal.style.display = 'none';
    }
    
    // Update game info
    roundNumberEl.textContent = gameState.currentRound;
    tableRoundEl.textContent = gameState.currentRound;
    
    // Update phase text
    let phaseText = 'Esperando jogadores';
    switch (gameState.phase) {
        case 'guess':
            phaseText = 'Palpites';
            break;
        case 'play':
            phaseText = 'Jogando';
            break;
        case 'roundEnd':
            phaseText = 'Fim da rodada';
            break;
        case 'gameOver':
            phaseText = 'Fim de jogo';
            break;
    }
    
    if (gameState.firstRound && (gameState.phase === 'guess' || gameState.phase === 'play')) {
        phaseText += ' (Cartas ocultas)';
    }
    
    phaseTextEl.textContent = phaseText;
    
    // Update trump card
    if (gameState.trumpCard) {
        trumpCardEl.src = getCardImagePath(gameState.trumpCard);
    } else {
        trumpCardEl.src = '';
    }
    
    // Update player lives
    const selfPlayer = gameState.players.find(p => p.id === playerId);
    if (selfPlayer) {
        playerLivesEl.textContent = selfPlayer.score;
        
        // Add player's guess to the HUD if it exists
        updatePlayerGuessHUD(selfPlayer);
    }
    
    // Update other players
    updatePlayersUI();
    
    // Update player's hand
    updatePlayerHandUI();
    
    // Update card history
    updateCardHistory();
    
    // Show/hide waiting message
    if (isCurrentPlayer()) {
        waitingMessageEl.style.display = 'none';
    } else {
        // Update waiting message with guess info if in play phase
        if (gameState.phase === 'play' && selfPlayer && selfPlayer.guess !== null) {
            waitingMessageEl.innerHTML = `Aguardando seu turno... (Seu palpite: ${selfPlayer.guess}, Ganhou: ${selfPlayer.wins || 0})`;
        } else {
            waitingMessageEl.textContent = 'Aguardando seu turno...';
        }
        waitingMessageEl.style.display = 'block';
    }
    
    // Enable/disable play card button
    playCardBtn.disabled = !(gameState.phase === 'play' && isCurrentPlayer() && selectedCardIndex !== null);
}

function updatePlayersUI() {
    playersContainerEl.innerHTML = '';
    
    // Filter out the current player
    const otherPlayers = gameState.players.filter(p => p.id !== playerId);
    
    for (const player of otherPlayers) {
        const playerEl = document.createElement('div');
        playerEl.className = 'player';
        
        if (isPlayerCurrentTurn(player.id)) {
            playerEl.classList.add('current');
        }
        
        if (isDealerPlayer(player.id)) {
            playerEl.classList.add('dealer');
        }
        
        if (player.score <= 0) {
            playerEl.classList.add('inactive');
        }
        
        // Basic player info
        let playerHTML = `
            <div class="player-status">${player.score}</div>
            <div class="player-name">${player.name}</div>
            <div class="player-health">Vidas: ${player.score}</div>
            ${player.guess !== null ? `<div class="player-guess">Palpite: ${player.guess}</div>` : ''}
            ${gameState.phase === 'play' ? `<div class="player-wins">Ganhou: ${player.wins}</div>` : ''}
        `;
        
        // Add played card if any
        playerHTML += `<div class="played-card">
            ${player.playedCard ? 
                `<img src="${getCardImagePath(player.playedCard)}" class="card-img" alt="Carta jogada">` : 
                ''}
        </div>`;
        
        // Add player's hand in first round or when visible
        if (player.hand && (gameState.firstRound || gameState.phase === 'waiting')) {
            playerHTML += `<div class="player-cards">
                <div class="player-cards-title">Cartas:</div>
                <div class="player-cards-container">`;
            
            player.hand.forEach(card => {
                playerHTML += `<img src="${getCardImagePath(card)}" class="opponent-card" alt="Carta do oponente">`;
            });
            
            playerHTML += `</div></div>`;
        } else if (player.handSize > 0) {
            // Show just card backs for non-first rounds
            playerHTML += `<div class="player-cards">
                <div class="player-cards-title">Cartas: ${player.handSize}</div>
                <div class="player-cards-container">`;
            
            for (let i = 0; i < player.handSize; i++) {
                playerHTML += `<img src="${getBackImagePath()}" class="opponent-card" alt="Carta do oponente">`;
            }
            
            playerHTML += `</div></div>`;
        }
        
        playerEl.innerHTML = playerHTML;
        playersContainerEl.appendChild(playerEl);
    }
}

function updatePlayerHandUI() {
    playerHandEl.innerHTML = '';
    
    for (let i = 0; i < playerHand.length; i++) {
        const card = playerHand[i];
        const cardEl = document.createElement('img');
        
        // In first round, or if card is hidden
        if (card.hidden) {
            cardEl.src = getBackImagePath();
            cardEl.title = "Carta oculta";
            cardEl.classList.add('hidden');
        } else {
            cardEl.src = getCardImagePath(card);
        }
        
        cardEl.className = 'hand-card';
        
        if (gameState && gameState.firstRound) {
            cardEl.classList.add('hidden');
        }
        
        if (i === selectedCardIndex) {
            cardEl.classList.add('selected');
        }
        
        // Add click event only if it's the player's turn in play phase
        const canPlay = gameState && gameState.phase === 'play' && isCurrentPlayer();
        
        if (canPlay) {
            cardEl.style.cursor = 'pointer';
            
            cardEl.addEventListener('click', () => {
                if (selectedCardIndex === i) {
                    selectedCardIndex = null;
                    updatePlayerHandUI();
                    playCardBtn.disabled = true;
                } else {
                    selectedCardIndex = i;
                    updatePlayerHandUI();
                    playCardBtn.disabled = false;
                }
            });
        } else {
            cardEl.style.cursor = 'default';
        }
        
        playerHandEl.appendChild(cardEl);
    }
}

function showGuessModal() {
    guessValueInput.value = '0';
    
    if (gameState && gameState.currentRound) {
        guessValueInput.max = gameState.currentRound;
    }
    
    // Apply minimization preference
    if (modalPreferences.guessModalMinimized) {
        guessModal.classList.add('minimized');
    } else {
        guessModal.classList.remove('minimized');
    }
    
    // Add message for first round
    let guessMessage = '';
    if (gameState && gameState.firstRound) {
        guessMessage = '<p style="margin-bottom: 15px; color: #ff9900;">Primeira rodada: Você não consegue ver suas cartas!</p>';
    }
    
    // Show dealer restrictions if applicable
    if (gameState && isDealerPlayer(playerId)) {
        const dealerAllowedGuesses = calculateDealerAllowedGuesses();
        dealerRestrictionsEl.innerHTML = `${guessMessage}Como você é o dealer, só pode apostar: ${dealerAllowedGuesses.join(', ')}`;
        dealerRestrictionsEl.style.display = 'block';
    } else {
        if (gameState && gameState.firstRound) {
            dealerRestrictionsEl.innerHTML = guessMessage;
            dealerRestrictionsEl.style.display = 'block';
        } else {
            dealerRestrictionsEl.style.display = 'none';
        }
    }
    
    // Update confirm button text with current guess
    updateConfirmButtonText();
    
    // Remove previous event listeners to avoid duplicates
    guessValueInput.removeEventListener('input', updateConfirmButtonText);
    guessValueInput.removeEventListener('change', updateConfirmButtonText);
    guessValueInput.removeEventListener('keyup', updateConfirmButtonText);
    
    // Listen for changes to the guess value - multiple events to catch all ways to change
    guessValueInput.addEventListener('input', updateConfirmButtonText);
    guessValueInput.addEventListener('change', updateConfirmButtonText);
    guessValueInput.addEventListener('keyup', updateConfirmButtonText);
    
    guessModal.style.display = 'flex';
    
    // Ensure minimize buttons are properly set up
    ensureMinimizeButtonsSetup();
}

// Function to update confirm button text
function updateConfirmButtonText() {
    const guessValue = guessValueInput.value || '0';
    confirmGuessBtn.textContent = `Confirmar (${guessValue})`;
}

function showRoundSummary() {
    summaryTableBodyEl.innerHTML = '';
    
    // Apply minimization preference
    if (modalPreferences.roundSummaryMinimized) {
        roundSummaryModal.classList.add('minimized');
    } else {
        roundSummaryModal.classList.remove('minimized');
    }
    
    if (gameState && gameState.roundDetails) {
        for (const [playerId, details] of Object.entries(gameState.roundDetails)) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${details.name}</td>
                <td>${details.guessValue}</td>
                <td>${details.wins}</td>
                <td>${details.damageValue}</td>
                <td>${details.health}</td>
            `;
            summaryTableBodyEl.appendChild(row);
        }
    }
    
    roundSummaryModal.style.display = 'flex';
    
    // Ensure minimize buttons are properly set up
    ensureMinimizeButtonsSetup();
}

function showGameOver() {
    if (!gameState) return;
    
    // Find the winner
    const alivePlayers = gameState.players.filter(p => p.score > 0);
    let winnerName = 'Ninguém';
    
    if (alivePlayers.length === 1) {
        winnerName = alivePlayers[0].name;
    }
    
    winnerTextEl.textContent = `${winnerName} venceu o jogo!`;
    gameOverModal.style.display = 'flex';
}

function hideAllModals() {
    joinRoomModal.style.display = 'none';
    waitingRoomModal.style.display = 'none';
    guessModal.style.display = 'none';
    roundSummaryModal.style.display = 'none';
    gameOverModal.style.display = 'none';
}

// Helper functions
function isCurrentPlayer() {
    return gameState && 
           gameState.players[gameState.currentPlayerIndex] && 
           gameState.players[gameState.currentPlayerIndex].id === playerId;
}

function isPlayerCurrentTurn(id) {
    return gameState && 
           gameState.players[gameState.currentPlayerIndex] && 
           gameState.players[gameState.currentPlayerIndex].id === id;
}

function isDealerPlayer(id) {
    return gameState && 
           gameState.players[gameState.dealerIndex] && 
           gameState.players[gameState.dealerIndex].id === id;
}

function calculateDealerAllowedGuesses() {
    if (!gameState) return [0];
    
    const currentRound = gameState.currentRound;
    const sumGuesses = gameState.sumGuesses || 0;
    
    if (currentRound === 1) {
        if (sumGuesses > 0) {
            return [1];
        } else {
            return [0, 1];
        }
    } else {
        if (sumGuesses === currentRound) {
            return Array.from({length: currentRound}, (_, i) => i + 1);
        } else if (sumGuesses > currentRound) {
            return Array.from({length: currentRound + 1}, (_, i) => i);
        } else {
            return Array.from({length: currentRound + 1}, (_, i) => i)
                .filter(n => n + sumGuesses !== currentRound);
        }
    }
}

// Minimize/Maximize Button Functions
function setupMinimizeButtons() {
    minimizeButtons = document.querySelectorAll('.minimize-btn');
    maximizeButtons = document.querySelectorAll('.maximize-btn');
    
    console.log("Found minimize buttons:", minimizeButtons.length);
    console.log("Found maximize buttons:", maximizeButtons.length);
    
    minimizeButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Prevent event bubbling
            e.stopPropagation();
            e.preventDefault();
            
            // Find parent modal
            const modalContent = btn.closest('.modal-content');
            const modal = modalContent.closest('.modal');
            
            // Minimize the modal
            modal.classList.add('minimized');
            
            // Save preference
            if (modal.id === 'guess-modal') {
                modalPreferences.guessModalMinimized = true;
                updateConfirmButtonText(); // Update button text on minimize
            }
            if (modal.id === 'round-summary-modal') modalPreferences.roundSummaryMinimized = true;
            
            console.log(`Minimized modal: ${modal.id}`);
        });
    });
    
    maximizeButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Prevent event bubbling
            e.stopPropagation();
            e.preventDefault();
            
            // Find parent modal
            const modalContent = btn.closest('.modal-content');
            const modal = modalContent.closest('.modal');
            
            // Maximize the modal
            modal.classList.remove('minimized');
            
            // Save preference
            if (modal.id === 'guess-modal') modalPreferences.guessModalMinimized = false;
            if (modal.id === 'round-summary-modal') modalPreferences.roundSummaryMinimized = false;
            
            console.log(`Maximized modal: ${modal.id}`);
        });
    });
}

function ensureMinimizeButtonsSetup() {
    // Check if minimize buttons are found
    if (document.querySelectorAll('.minimize-btn').length === 0) {
        console.log("No minimize buttons found, waiting for DOM...");
        // Try again after a brief interval
        setTimeout(setupMinimizeButtons, 500);
    } else {
        setupMinimizeButtons();
    }
}

// Function to update the card history panel
function updateCardHistory() {
    // Check if gameState exists
    if (!gameState) return;
    
    // Reset the card history panel if we're starting a new round
    if (gameState.phase === 'guess' && gameState.semiRounds === 0) {
        cardHistoryEl.innerHTML = '<div class="history-empty-message">O histórico de jogadas aparecerá aqui durante a rodada.</div>';
        return;
    }
    
    // If we have card history, display it
    if (gameState.cardHistory && gameState.cardHistory.length > 0) {
        // Clear the panel first
        cardHistoryEl.innerHTML = '';
        
        // Sort history to show most recent first
        const sortedHistory = [...gameState.cardHistory].reverse();
        
        // Group cards by round and semi-round
        const groupedHistory = {};
        
        sortedHistory.forEach(playedCard => {
            const key = `${playedCard.round}-${playedCard.semiRound}`;
            if (!groupedHistory[key]) {
                groupedHistory[key] = {
                    round: playedCard.round,
                    semiRound: playedCard.semiRound,
                    cards: []
                };
            }
            groupedHistory[key].cards.push(playedCard);
        });
        
        // Create HTML for each group
        Object.values(groupedHistory).forEach(group => {
            const historyItem = document.createElement('div');
            historyItem.className = 'play-history-item';
            
            // Create round header
            const roundHeader = document.createElement('div');
            roundHeader.className = 'play-history-round';
            roundHeader.textContent = `Rodada ${group.round}, Jogada ${group.semiRound}`;
            historyItem.appendChild(roundHeader);
            
            // Create player cards
            group.cards.forEach(playedCard => {
                const playerDiv = document.createElement('div');
                playerDiv.className = 'play-history-player';
                
                const playerName = document.createElement('span');
                playerName.className = 'play-history-player-name';
                playerName.textContent = playedCard.playerName || 
                    gameState.players.find(p => p.id === playedCard.playerId)?.name || 
                    'Jogador';
                
                const cardImg = document.createElement('img');
                cardImg.className = 'play-history-card-img';
                cardImg.src = getCardImagePath(playedCard.card);
                cardImg.alt = 'Carta jogada';
                
                playerDiv.appendChild(playerName);
                playerDiv.appendChild(cardImg);
                historyItem.appendChild(playerDiv);
            });
            
            // Add the item to the history panel
            cardHistoryEl.appendChild(historyItem);
        });
        
        // If we somehow ended up with an empty history panel, show the empty message
        if (cardHistoryEl.children.length === 0) {
            cardHistoryEl.innerHTML = '<div class="history-empty-message">O histórico de jogadas aparecerá aqui durante a rodada.</div>';
        }
    } else if (gameState.phase === 'play') {
        // If we're in play phase but no cards have been played yet
        if (!cardHistoryEl.querySelector('.history-empty-message')) {
            cardHistoryEl.innerHTML = '<div class="history-empty-message">O histórico de jogadas aparecerá aqui durante a rodada.</div>';
        }
    }
}

// Add new function to update player's guess in the HUD
function updatePlayerGuessHUD(player) {
    // Find or create the guess element
    let playerGuessEl = document.getElementById('player-guess-hud');
    
    if (!playerGuessEl) {
        // Create the element if it doesn't exist
        playerGuessEl = document.createElement('div');
        playerGuessEl.id = 'player-guess-hud';
        playerGuessEl.className = 'player-guess-hud';
        
        // Insert it after the player lives element
        playerLivesEl.parentNode.after(playerGuessEl);
    }
    
    // Update the content based on guess availability
    if (player.guess !== null && (gameState.phase === 'play' || gameState.phase === 'roundEnd')) {
        playerGuessEl.innerHTML = `Seu palpite: <span>${player.guess}</span> | Ganhou: <span>${player.wins || 0}</span>`;
        playerGuessEl.style.display = 'block';
    } else {
        playerGuessEl.style.display = 'none';
    }
}

// Function to toggle sound
function toggleSound() {
    soundEnabled = !soundEnabled;
    
    // Update button appearance
    if (soundEnabled) {
        soundToggleBtn.textContent = '🔊';
        soundToggleBtn.classList.remove('muted');
        soundToggleBtn.title = 'Desativar sons';
        
        // Play a sound to confirm sounds are on
        playSound('guess');
    } else {
        soundToggleBtn.textContent = '🔇';
        soundToggleBtn.classList.add('muted');
        soundToggleBtn.title = 'Ativar sons';
    }
    
    // Save preference to local storage
    localStorage.setItem('fodinhaSound', soundEnabled ? 'on' : 'off');
}

// Function to load sound preference
function loadSoundPreference() {
    const savedPreference = localStorage.getItem('fodinhaSound');
    if (savedPreference !== null) {
        soundEnabled = savedPreference === 'on';
        
        // Update button appearance
        if (!soundEnabled) {
            soundToggleBtn.textContent = '🔇';
            soundToggleBtn.classList.add('muted');
            soundToggleBtn.title = 'Ativar sons';
        }
    }
}

// Enhanced touch handling for mobile devices
function setupTouchEvents() {
    // Add touchend event for cards in hand for better mobile experience
    playerHandEl.addEventListener('touchend', (e) => {
        if (e.target.classList.contains('hand-card')) {
            const index = parseInt(e.target.dataset.index);
            if (!isNaN(index)) {
                // If the card is already selected, play it immediately
                if (selectedCardIndex === index && isCurrentPlayer()) {
                    socket.emit('playCard', { cardIndex: selectedCardIndex });
                    playSound('cardPlay');
                    selectedCardIndex = null;
                } else {
                    // Otherwise, select the card
                    selectedCardIndex = index;
                }
                updatePlayerHandUI();
                e.preventDefault(); // Prevent default to avoid double-events
            }
        }
    });
    
    // Prevent zoom on double tap for elements that should respond to taps
    const interactiveElements = document.querySelectorAll('button, .hand-card, .minimize-btn, .maximize-btn');
    interactiveElements.forEach(el => {
        el.addEventListener('touchend', (e) => {
            // Prevent default only if this is an action element
            if (e.target.tagName === 'BUTTON' || 
                e.target.classList.contains('hand-card') ||
                e.target.classList.contains('minimize-btn') ||
                e.target.classList.contains('maximize-btn')) {
                e.preventDefault();
            }
        });
    });
    
    // Add class to body to apply touch-specific CSS
    document.body.classList.add('touch-device');
    
    // Make guess input more touch-friendly
    if (guessValueInput) {
        guessValueInput.setAttribute('inputmode', 'numeric');
        guessValueInput.setAttribute('pattern', '[0-9]*');
    }
    
    // Improve modal scrolling on mobile
    const modalContents = document.querySelectorAll('.modal-content');
    modalContents.forEach(content => {
        content.addEventListener('touchmove', (e) => {
            e.stopPropagation();
        });
    });
}

// Initialize the game
window.onload = function() {
    initializeSocket();
    setupEventListeners();
    preloadSounds();
    loadSoundPreference();
    
    // Show join room modal
    joinRoomModal.style.display = 'flex';
    
    // Setup minimize buttons
    ensureMinimizeButtonsSetup();
}; 