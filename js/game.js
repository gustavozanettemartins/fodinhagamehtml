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

// Função para garantir que as propriedades essenciais do jogador existam
function ensurePlayerProperties(player) {
    // Garantir que todas as propriedades essenciais do jogador existam
    if (!player) return player;
    
    // Definir valores padrão para propriedades essenciais, se ausentes
    player.score = player.score !== null && player.score !== undefined ? player.score : 5;
    player.hand = player.hand || [];
    player.guess = player.guess !== undefined ? player.guess : null;
    player.wins = player.wins || 0;
    player.playedCard = player.playedCard || null;
    
    return player;
}

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
const tableCardsEl = document.getElementById('table-played-cards'); // Novo elemento para cartas na mesa

// Chat elements
const chatMessagesEl = document.getElementById('chat-messages');
const chatInputEl = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');

// Elements for minimize/maximize
let minimizeButtons;
let maximizeButtons;

// Variável para armazenar o ID persistente do jogador
let persistentPlayerId = null;

// Função para gerar um ID único para o jogador
function generateUniqueId() {
    // Gerar ID baseado em timestamp e números aleatórios
    const timestamp = new Date().getTime();
    const random = Math.floor(Math.random() * 1000000);
    return `player_${timestamp}_${random}`;
}

// Função para obter o ID persistente do jogador
function getPersistentPlayerId() {
    // Verificar se já temos um ID armazenado no localStorage
    let id = localStorage.getItem('fodinhaPersistentId');
    
    // Se não tiver, gerar um novo ID e armazená-lo
    if (!id) {
        id = generateUniqueId();
        localStorage.setItem('fodinhaPersistentId', id);
        console.log('Novo ID persistente gerado:', id);
    } else {
        console.log('ID persistente recuperado do localStorage:', id);
    }
    
    return id;
}

// Atualize a função saveSessionState para incluir o estado dos modais
function saveSessionState() {
    // Get modal states
    const modalStates = {
        guessModalOpen: guessModal.style.display === 'flex',
        roundSummaryOpen: roundSummaryModal.style.display === 'flex',
        guessModalMinimized: modalPreferences.guessModalMinimized,
        roundSummaryMinimized: modalPreferences.roundSummaryMinimized
    };
    
    // Ensure we have a persistent ID
    if (!persistentPlayerId) {
        persistentPlayerId = getPersistentPlayerId();
    }
    
    const sessionData = {
        socketId: playerId,          // Current socket ID
        persistentId: persistentPlayerId, // Persistent player ID
        playerName: playerName,
        roomId: roomId,
        isPlayerReady: isPlayerReady,
        modalStates: modalStates,
        timestamp: new Date().getTime()
    };
    
    localStorage.setItem('fodinhaSession', JSON.stringify(sessionData));
    console.log('Session saved with modal states and persistent ID:', sessionData);
}

// Função para carregar o estado da sessão do localStorage com validações adicionais
function loadSessionState() {
    const savedSession = localStorage.getItem('fodinhaSession');
    if (!savedSession) return null;
    
    try {
        const sessionData = JSON.parse(savedSession);
        
        // Check if session is expired (30 minutes)
        const now = new Date().getTime();
        const sessionAge = now - sessionData.timestamp;
        const maxSessionAge = 30 * 60 * 1000; // 30 minutes
        
        if (sessionAge > maxSessionAge) {
            console.log('Session expired, removing...');
            localStorage.removeItem('fodinhaSession');
            return null;
        }
        
        // Additional validation of session data
        if (!sessionData.roomId || !sessionData.playerName) {
            console.error('Invalid session data:', sessionData);
            localStorage.removeItem('fodinhaSession');
            return null;
        }
        
        console.log('Valid session loaded:', {
            playerName: sessionData.playerName,
            roomId: sessionData.roomId,
            socketId: sessionData.socketId,
            persistentId: sessionData.persistentId,
            age: `${Math.round(sessionAge / 1000)}s ago`
        });
        
        return sessionData;
    } catch (e) {
        console.error('Error loading session:', e);
        localStorage.removeItem('fodinhaSession');
        return null;
    }
}

// Função para limpar a sessão quando o jogador sair voluntariamente
function clearSessionState() {
    localStorage.removeItem('fodinhaSession');
    localStorage.removeItem('fodinhaPersistentId');
    console.log('Sessão removida');
}

// Função para mostrar a overlay de reconexão
function showReconnectingOverlay() {
    // Remove any existing overlay first
    const existingOverlay = document.querySelector('.reconnecting-overlay');
    if (existingOverlay) {
        document.body.removeChild(existingOverlay);
    }
    
    // Create the reconnection overlay
    const overlay = document.createElement('div');
    overlay.className = 'reconnecting-overlay';
    
    overlay.innerHTML = `
        <div class="reconnecting-box">
            <div class="reconnecting-spinner"></div>
            <h3>Reconnecting to game</h3>
            <p>Attempting to reconnect to your previous game...</p>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    return overlay;
}

// Função para remover a overlay de reconexão
function hideReconnectingOverlay() {
    const overlay = document.querySelector('.reconnecting-overlay');
    if (overlay) {
        // Add fade-out class
        overlay.classList.add('fade-out');
        
        // Remove after animation
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, 500);
    }
}

// Função para sair do jogo voluntariamente
function leaveGame() {
    if (confirm("Tem certeza que deseja sair do jogo?")) {
        // Notificar o servidor

        const savedSession = loadSessionState();
        if (savedSession && roomId) {
            if (socket && socket.connected && roomId) {
                socket.emit('leaveRoom', {persistentId: savedSession.persistentId, roomId: roomId });
            }
            
            // Limpar dados de sessão
            clearSessionState();
            
            // Redirecionamento para a página inicial
            window.location.href = window.location.pathname;
        }
    }
}

// Adicione esta função para restaurar o estado dos modais após a reconexão
function restoreModalStates(sessionData) {
    if (!sessionData || !sessionData.modalStates) return;
    
    console.log('Restoring modal states:', sessionData.modalStates);
    
    const { modalStates } = sessionData;
    
    // Restore minimization preferences
    if (modalStates.guessModalMinimized !== undefined) {
        modalPreferences.guessModalMinimized = modalStates.guessModalMinimized;
    }
    
    if (modalStates.roundSummaryMinimized !== undefined) {
        modalPreferences.roundSummaryMinimized = modalStates.roundSummaryMinimized;
    }
    
    // IMPORTANT ADDITION: Force restoration of modals that were open
    if (modalStates.guessModalOpen === true) {
        console.log('Guess modal was open before refresh, forcing reopening...');
        
        // Don't show immediately, wait for gameState to be loaded
        setTimeout(() => {
            if (gameState && gameState.phase === 'guess') {
                console.log('Forcing guess modal reopening after delay');
                showGuessModal();
                
                // Check if the modal was actually opened
                setTimeout(() => {
                    if (guessModal.style.display !== 'flex') {
                        console.warn('First attempt to force modal failed, trying again...');
                        showGuessModal();
                    }
                }, 500);
            }
        }, 1000);
    }
    
    if (modalStates.roundSummaryOpen === true) {
        console.log('Round summary modal was open before refresh, forcing reopening...');
        
        // Wait for gameState to be loaded
        setTimeout(() => {
            if (gameState && gameState.phase === 'roundEnd') {
                console.log('Forcing round summary modal reopening after delay');
                showRoundSummary();
            }
        }, 1000);
    }
}

// Função para verificar e mostrar os modais necessários após o gameState ser atualizado
function checkAndShowModals() {
    if (!gameState) {
        console.log('No gameState, cannot check modals');
        return;
    }
    
    console.log(`Checking modals: Phase=${gameState.phase}, IsCurrentPlayer=${isCurrentPlayer()}`);
    
    // Check if any modal was open in previous session
    const savedSession = loadSessionState();
    const hadGuessModalOpen = savedSession?.modalStates?.guessModalOpen === true;
    
    // Close all modals first to avoid overlaps
    // But remember which were open for debug
    const guessWasOpen = guessModal.style.display === 'flex';
    const summaryWasOpen = roundSummaryModal.style.display === 'flex';
    const gameOverWasOpen = gameOverModal.style.display === 'flex';
    
    // Check if guess modal should be shown
    if (gameState.phase === 'guess' && (isCurrentPlayer() || hadGuessModalOpen)) {
        console.log(`It's guess phase and ${isCurrentPlayer() ? 'it\'s player\'s turn' : 'modal was open before'}, showing guess modal`);
        
        if (!guessWasOpen) {
            showGuessModal();
        } else {
            console.log('Guess modal was already open');
        }
    } 
    // Check if round summary should be shown
    else if (gameState.phase === 'roundEnd') {
        console.log('It\'s round end phase, showing summary');
        if (!summaryWasOpen) {
            showRoundSummary();
        } else {
            console.log('Summary modal was already open');
        }
    } 
    // Check if game over should be shown
    else if (gameState.phase === 'gameOver') {
        console.log('It\'s game over phase, showing game over modal');
        if (!gameOverWasOpen) {
            showGameOver();
        } else {
            console.log('Game over modal was already open');
        }
    } else {
        console.log(`No modal needed for phase ${gameState.phase} with isCurrentPlayer=${isCurrentPlayer()}`);
        
        // If it's guess phase but not player's turn, ensure modal is closed
        // EXCEPT if the modal was open before refresh
        if (gameState.phase === 'guess' && !isCurrentPlayer() && guessWasOpen && !hadGuessModalOpen) {
            console.log('Closing guess modal because it\'s not player\'s turn and wasn\'t open before');
            guessModal.style.display = 'none';
        }
    }
    
    // Add debug message
    console.log('Current modal states after check:', {
        guessModal: guessModal.style.display,
        roundSummaryModal: roundSummaryModal.style.display,
        gameOverModal: gameOverModal.style.display
    });
}

function forceModalAfterReconnect() {
    // Obter a sessão salva
    const savedSession = loadSessionState();
    if (!savedSession || !savedSession.modalStates) return;
    
    console.log('Verificando modais para força após reconexão:', savedSession.modalStates);
    
    // Verificar se o modal de palpites estava aberto antes
    if (savedSession.modalStates.guessModalOpen === true && gameState && gameState.phase === 'guess') {
        console.log('*** IMPORTANTE: Forçando reabertura do modal de palpites após reconexão ***');
        
        // Tentar várias vezes para garantir
        let attempts = 0;
        const maxAttempts = 5;
        
        const tryOpen = () => {
            attempts++;
            
            // Verificar se o modal já está aberto
            if (guessModal.style.display === 'flex') {
                console.log('Modal de palpites já está aberto, não é necessário forçar');
                return;
            }
            
            // Tentar abrir o modal
            console.log(`Tentativa ${attempts} de abrir o modal de palpites`);
            showGuessModal();
            
            // Verificar se funcionou
            if (guessModal.style.display !== 'flex' && attempts < maxAttempts) {
                // Tentar novamente após um delay
                setTimeout(tryOpen, 1000);
            }
        };
        
        // Iniciar tentativas com um pequeno delay
        setTimeout(tryOpen, 2000);
    }
}

let modalCheckInterval = null;

function scheduleModalChecks() {
    // Clear any existing interval first
    if (modalCheckInterval) {
        clearInterval(modalCheckInterval);
        modalCheckInterval = null;
    }
    
    // Set up 10 checks with 1 second interval
    let checksRemaining = 10;
    
    modalCheckInterval = setInterval(() => {
        console.log(`Periodic modal check (${checksRemaining} remaining)`);
        
        // Check if we have received game state
        if (gameState) {
            // Check if any modal needs to be shown
            checkAndShowModals();
            
            // If player is in guess phase and it's their turn, force show modal
            if (gameState.phase === 'guess' && isCurrentPlayer() && guessModal.style.display !== 'flex') {
                console.log('FORCING guess modal open in periodic check');
                showGuessModal();
            }
            
            // Check if we found and displayed the correct modal
            if ((gameState.phase === 'guess' && isCurrentPlayer() && guessModal.style.display === 'flex') || 
                (gameState.phase === 'roundEnd' && roundSummaryModal.style.display === 'flex') ||
                (gameState.phase === 'gameOver' && gameOverModal.style.display === 'flex')) {
                
                console.log('Correct modal found, stopping periodic checks');
                clearInterval(modalCheckInterval);
                modalCheckInterval = null;
                return;
            }
        }
        
        // Reduce remaining checks count
        checksRemaining--;
        
        // Stop checks after the defined number of attempts
        if (checksRemaining <= 0) {
            console.log('Maximum number of modal checks reached');
            clearInterval(modalCheckInterval);
            modalCheckInterval = null;
        }
    }, 1000); // Check every 1 second
}

// Function to detect if the device is a mobile/touch device
function isTouchDevice() {
    return (('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0) ||
        (navigator.msMaxTouchPoints > 0));
}

// Socket.io initialization
function initializeSocket() {
    // Conectar ao servidor Socket.IO
    socket = io();
    
    // Socket event listeners
    socket.on('connect', () => {
        playerId = socket.id;
        console.log('Connected to server with ID:', playerId);
        
        // Add a ping/pong mechanism to keep connection alive
        setInterval(() => {
            if (roomId) { // Only ping if we're in a room
                socket.emit('ping');
            }
        }, 30000);
        
        // Check if there's a saved session
        const savedSession = loadSessionState();
        if (savedSession && !roomId) {
            console.log('Attempting to reconnect using saved session:', savedSession);
            
            // Restore session data
            playerName = savedSession.playerName;
            
            // Use the improved reconnection attempt function
            attemptReconnect(savedSession);
            
            // Monitor reconnection success
            monitorReconnectionSuccess();
            
            // Add system message
            addSystemMessage(`Attempting to reconnect as ${savedSession.playerName}...`);
        }
    });
    
    // Adicionar um handler específico para eventos de palpite
    socket.on('awaitingGuess', (data) => {
        console.log('Servidor solicitando palpite:', data);
        
        // Verificar se é a nossa vez de dar palpite
        if (data.playerId === playerId) {
            console.log('Solicitando diretamente palpite para este jogador');
            
            // Mostrar o modal de palpite imediatamente
            // Pequeno timeout para garantir que o estado do jogo já foi atualizado
            setTimeout(() => {
                showGuessModal();
            }, 100);
        }
    });

    // Adicionar um evento específico para a fase do jogo
    socket.on('phaseChanged', (data) => {
        console.log('Fase do jogo alterada:', data);
        
        // Atualizar a fase no gameState
        if (gameState) {
            gameState.phase = data.phase;
        }
        
        // Se for a fase de palpite e for a nossa vez, mostrar o modal
        if (data.phase === 'guess' && data.currentPlayer === playerId) {
            console.log('Fase alterada para palpites e é a nossa vez');
            setTimeout(() => {
                showGuessModal();
            }, 200);
        }
        
        // Verificar todos os modais após mudança de fase
        setTimeout(() => {
            checkAndShowModals();
        }, 300);
    });

    socket.on('playerJoined', (data) => {
        console.log('Player joined:', data);
        updatePlayersList(data.players);
        roomId = data.roomId;
        currentRoomCodeDisplay.textContent = roomId;
        roomCodeDisplay.textContent = roomId;
        playersCountDisplay.textContent = data.players.length;
        
        // Verificar se estamos reconectando
        const savedSession = loadSessionState();
        const isReconnecting = savedSession && data.playerName === savedSession.playerName;
        
        // Esconder a overlay de reconexão se estiver presente
        hideReconnectingOverlay();
        
        // Add system message to chat
        if (isReconnecting) {
            addSystemMessage(`Você se reconectou à sala.`);
            
            // Restaurar o estado de "pronto"
            if (savedSession.isPlayerReady && !isPlayerReady) {
                console.log("Restaurando estado de 'pronto':", savedSession.isPlayerReady);
                isPlayerReady = savedSession.isPlayerReady;
                
                // Atualizar o texto do botão
                if (playerReadyBtn) {
                    playerReadyBtn.textContent = isPlayerReady ? 'Aguardando' : 'Pronto';
                }
                
                // Notificar o servidor sobre o estado de "pronto"
                socket.emit('playerReady', { ready: isPlayerReady });
            }
            
            // Restaurar preferências de modais
            restoreModalStates(savedSession);
            
            // Solicitar sincronização completa
            console.log('Solicitando sincronização completa após reconexão');
            setTimeout(() => {
                socket.emit('requestFullSync');
            }, 500);
        } else {
            addSystemMessage(`${data.playerName} entrou na sala.`);
        }
        
        // Atualizar a sessão salva com os novos dados
        saveSessionState();
        
        // Request game state after joining a room
        if (data.playerName === playerName) {
            console.log("I joined a room, requesting game state");
            setTimeout(() => {
                socket.emit('requestGameState');
            }, 500);
        }
    });
    
    socket.on('playerUpdate', (data) => {
        console.log('Player update:', data);
        
        // Update player list
        updatePlayersList(data.players);
        playersCountDisplay.textContent = data.players.length;
        
        // Check our own ready status in case the server didn't register it
        const ourPlayer = data.players.find(p => p.id === playerId);
        if (ourPlayer && ourPlayer.isReady !== isPlayerReady) {
            console.log("Our ready status is out of sync. Server:", ourPlayer.isReady, "Client:", isPlayerReady);
            isPlayerReady = ourPlayer.isReady;
            playerReadyBtn.textContent = isPlayerReady ? 'Aguardando' : 'Pronto';
        }
        
        // Atualizar a sessão quando houver atualização de jogadores
        saveSessionState();
    });
    
    socket.on('playerLeft', (data) => {
        console.log(data);
        updatePlayersList(data.players);
        playersCountDisplay.textContent = data.players.length;
        
        // Add system message to chat using the name from the event data
        addSystemMessage(`${data.message}`);
    });
    
    socket.on('gameState', (data) => {
        console.log('Game state update:', data);
        
        // Add timestamp to track state updates
        data.lastStateUpdate = new Date().getTime();
        
        // Garantir que os jogadores tenham todas as propriedades necessárias
        if (data.players && Array.isArray(data.players)) {
            data.players = data.players.map(player => {
                player = ensurePlayerProperties(player);
                
                // Fix for guess being an object
                if (player.guess !== null && typeof player.guess === 'object' && player.guess.guess !== undefined) {
                    player.guess = player.guess.guess;
                }
                
                return player;
            });
        }
        
        // Play card shuffle sound when entering a new round (guess phase)
        if (gameState && gameState.phase !== 'guess' && data.phase === 'guess' && data.semiRounds === 0) {
            playSound('cardShuffle');
        }
        
        // Guardar valor da fase anterior para comparação
        const previousPhase = gameState ? gameState.phase : null;
        const wasCurrentPlayer = gameState ? isCurrentPlayer() : false;
        
        gameState = data;
        
        if (data.hand) {
            playerHand = data.hand;
        }
        
        updateGameUI();
        
        // Salvar a sessão quando o estado do jogo for atualizado
        saveSessionState();
        
        // Verificar se acabamos de reconectar (se não havia gameState antes)
        const isReconnecting = previousPhase === null && gameState !== null;
        
        // Se estamos reconectando ou mudou a fase do jogo, verificar se precisa mostrar modais
        if (isReconnecting || previousPhase !== gameState.phase || (wasCurrentPlayer !== isCurrentPlayer())) {
            console.log('Reconectando ou mudança de fase/turno detectada, verificando modais');
            checkAndShowModals();
        }
        
        // Remover overlay de reconexão se ainda estiver presente
        hideReconnectingOverlay();
        
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
        
        // Manter a sessão após reset, apenas atualizar o estado
        saveSessionState();
    });
    
    // Chat message received
    socket.on('chatMessage', (data) => {
        console.log('Chat message received:', data);
        addChatMessage(data.sender, data.message, data.senderId === playerId);
    });
    
    // Este event handler trata quando o servidor forçar a desconexão
    socket.on('forceDisconnect', (data) => {
        console.log('Forçado a desconectar:', data);
        
        // Limpar a sessão
        clearSessionState();
        
        // Recarregar a página
        alert(data.message || "Você foi desconectado do servidor.");
        window.location.reload();
    });
    
    // Add additional reconnection logic
    socket.on('disconnect', () => {
        console.log('Disconnected from server, attempting to reconnect...');
        
        // Tenta salvar a sessão atual
        if (roomId && playerName) {
            saveSessionState();
        }
        
        // Try to reconnect after a delay
        setTimeout(() => {
            socket.connect();
            
            // Rejoin the room if we were in one
            if (roomId && playerName) {
                setTimeout(() => {
                    socket.emit('joinRoom', { 
                        playerName, 
                        roomId: roomId 
                    });
                }, 1000);
            }
        }, 3000);
        
        // Show a message to the user
        addSystemMessage("Conexão perdida. Tentando reconectar...");
    });
    
    socket.on('reconnect', () => {
        console.log('Reconnected to server');
        addSystemMessage("Reconectado ao servidor!");
        
        // Only request game state if we're in a room
        if (roomId) {
            setTimeout(() => {
                socket.emit('requestGameState');
                
                // Verificar o estado dos modais após obter gameState
                setTimeout(() => {
                    console.log('Verificando modais após reconexão');
                    checkAndShowModals();
                }, 1500); // Pequeno delay para garantir que gameState foi recebido
            }, 1000);
        }
    });

    // Add a specific handler for game start to ensure we transition from waiting room
    socket.on('gameStart', (data) => {
        console.log('Game started:', data);
        
        // Hide waiting room
        waitingRoomModal.style.display = 'none';
        
        // Add system message
        addSystemMessage("O jogo começou!");
        
        // Request game state
        socket.emit('requestGameState');
        
        // Salvar a sessão quando o jogo começa
        saveSessionState();
    });
    
    // Error handling
    socket.on('error', (error) => {
        console.error('Socket error:', error);
        addSystemMessage(`Erro: ${error.message || 'Ocorreu um erro de conexão'}`);
    });
    
    // Room-specific errors
    socket.on('roomError', (data) => {
        console.error('Room error:', data);
        alert(data.message || "Erro ao entrar na sala");
        
        // Se houver erro ao entrar na sala usando uma sessão salva, limpar a sessão
        const savedSession = loadSessionState();
        if (savedSession && savedSession.roomId === data.roomId) {
            console.log('Erro ao reconectar usando sessão salva, limpando sessão...');
            clearSessionState();
        }
    });

    socket.on('currentPlayerUpdate', (data) => {
        console.log('Atualização de jogador atual recebida:', data);
        
        // Verificar se temos gameState
        if (!gameState) {
            console.warn('Recebido currentPlayerUpdate mas gameState é null');
            return;
        }
        
        // Atualizar informações do jogador atual
        gameState.currentPlayerIndex = data.currentPlayerIndex;
        gameState.phase = data.phase;
        
        // Atualizar UI
        updateGameUI();
        
        // Verificar se precisa mostrar modais
        checkAndShowModals();
    });
    
    // Adicionar handler para evento de espera por palpite
    socket.on('awaitingGuess', (data) => {
        console.log('Servidor solicitando palpite:', data);
        
        // Verificar se é nossa vez
        if (data.playerId === playerId) {
            // Forçar exibição do modal de palpite
            console.log('Forçando exibição do modal de palpite por solicitação do servidor');
            showGuessModal();
        }
    });
    
    // Adicionar handler para evento de sua vez de jogar
    socket.on('yourTurn', (data) => {
        console.log('É sua vez de jogar:', data);
        
        // Atualizar interface para indicar que é a vez do jogador
        if (waitingMessageEl) {
            waitingMessageEl.style.display = 'none';
        }
        
        // Atualizar UI para refletir que é a vez do jogador
        updateGameUI();
    });
    
    // Adicionar handler para resposta de sincronização completa
    socket.on('fullSyncResponse', (data) => {
        console.log('Full sync response received:', data);
        
        // Update gameState with received data
        gameState = data.gameState;
        
        // If we have cards, update them
        if (data.gameState.hand) {
            playerHand = data.gameState.hand;
        }
        
        // Update game UI
        updateGameUI();
        
        // Check if modals need to be shown
        checkAndShowModals();
        
        // If it's this player's turn, additional checks
        if (data.isYourTurn) {
            console.log('Sync confirms it\'s my turn to play');
            
            // Check phase to show appropriate modal
            if (gameState.phase === 'guess') {
                showGuessModal();
            }
        }
    });

    socket.on('syncError', (error) => {
        console.error('Sync error received:', error);
        addSystemMessage(`Sync error: ${error.message}. Attempting to automatically reconnect...`);
        
        // Show overlay with problem
        const errorOverlay = document.createElement('div');
        errorOverlay.className = 'reconnecting-overlay';
        errorOverlay.innerHTML = `
            <div class="reconnecting-box">
                <h3>Synchronization Problem</h3>
                <p>${error.message}</p>
                <p>Attempting to recover connection...</p>
                <div class="reconnecting-spinner"></div>
                <button id="force-reload-btn" style="margin-top: 20px; padding: 10px 20px;">Reload Game</button>
            </div>
        `;
        document.body.appendChild(errorOverlay);
        
        // Add function for reload button
        document.getElementById('force-reload-btn').addEventListener('click', () => {
            window.location.reload();
        });
        
        // Try to recover session again
        setTimeout(() => {
            // Check if we still have roomId
            if (roomId) {
                console.log('Attempting to recover session after sync error...');
                
                // Request game state again
                socket.emit('requestGameState');
                
                // Try new sync after longer delay
                setTimeout(() => {
                    socket.emit('requestFullSync');
                }, 1000);
            }
        }, 2000);
    });

    socket.on('gameState', (data) => {
        console.log('Game state update:', data);
        
        // Add timestamp to track state updates
        data.lastStateUpdate = new Date().getTime();
        
        // Ensure players have all required properties
        if (data.players && Array.isArray(data.players)) {
            data.players = data.players.map(player => {
                player = ensurePlayerProperties(player);
                
                // Fix for guess being an object
                if (player.guess !== null && typeof player.guess === 'object' && player.guess.guess !== undefined) {
                    player.guess = player.guess.guess;
                }
                
                return player;
            });
        }
        
        // Play card shuffle sound when entering a new round (guess phase)
        if (gameState && gameState.phase !== 'guess' && data.phase === 'guess' && data.semiRounds === 0) {
            playSound('cardShuffle');
        }
        
        // Store previous phase value for comparison
        const previousPhase = gameState ? gameState.phase : null;
        const wasCurrentPlayer = gameState ? isCurrentPlayer() : false;
        
        gameState = data;
        
        if (data.hand) {
            playerHand = data.hand;
        }
        
        updateGameUI();
        
        // Save session when game state is updated
        saveSessionState();
        
        // Check if we just reconnected (if there was no gameState before)
        const isReconnecting = previousPhase === null && gameState !== null;
        
        // If we're reconnecting or the game phase changed, check if modals need to be shown
        if (isReconnecting || previousPhase !== gameState.phase || (wasCurrentPlayer !== isCurrentPlayer())) {
            console.log('Reconnecting or phase/turn change detected, checking modals');
            checkAndShowModals();
        }
        
        // Remove reconnection overlay if still present
        hideReconnectingOverlay();
        
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

    socket.on('gameCancelled', (data) => {
        console.log('Game cancelled:', data);
        // Show waiting room again
        alert(data.message || "Partida cancelada.");
        clearSessionState();
        hideAllModals();        
        waitingRoomModal.style.display = 'flex';
        
    })
}

// Event Listeners
function setupEventListeners() {
    // 1. LOBBY FUNCTIONS    
    // 1.1 Join room button
    joinRoomBtn.addEventListener('click', () => {
        playerName = playerNameInput.value.trim();
        const roomIdValue = roomIdInput.value.trim();
        
        if (playerName) {
            // Show a loading message
            joinRoomBtn.textContent = "Conectando...";
            joinRoomBtn.disabled = true;
            
            // Garantir que temos um ID persistente
            if (!persistentPlayerId) {
                persistentPlayerId = getPersistentPlayerId();
            }
            
            // Log the join request
            console.log("Joining room with name:", playerName, "room:", roomIdValue || "new room", "persistentId:", persistentPlayerId);
            
            // Enviar solicitação com ID persistente
            socket.emit('joinRoom', { 
                playerName, 
                roomId: roomIdValue || null,
                persistentId: persistentPlayerId
            });
            
            // Add a timeout to reset if something goes wrong
            setTimeout(() => {
                if (joinRoomModal.style.display !== 'none') {
                    joinRoomBtn.textContent = "Entrar / Criar Sala";
                    joinRoomBtn.disabled = false;
                    addSystemMessage("Erro ao entrar na sala. Tente novamente.");
                }
            }, 5000);
            
            // Hide the join modal and show waiting room
            joinRoomModal.style.display = 'none';
            waitingRoomModal.style.display = 'flex';
        } else {
            // Alert the user that a name is required
            alert("Por favor, digite seu nome para continuar.");
        }
    });
    
    // 1.2 Copy room code button
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
    
    // 1.3 Player ready button
    playerReadyBtn.addEventListener('click', () => {
        isPlayerReady = !isPlayerReady;

        playerReadyBtn.textContent = isPlayerReady ? 'Aguardando' : 'Pronto';

        playerReadyBtn.disabled = true;
        playerReadyBtn.style.opacity = '0.7';
        setTimeout(() => {
        playerReadyBtn.disabled = false;
        playerReadyBtn.style.opacity = '1';
        }, 1000);

        console.log('Enviando playerReady:', isPlayerReady);
        socket.emit('playerReady', isPlayerReady);

        addSystemMessage(`Você está ${isPlayerReady ? 'aguardando' : 'pronto'}.`);
    });
    
    // 2. GAME FUNCTIONS
    // 2.1 Guess confirm button
    confirmGuessBtn.addEventListener('click', () => {
        const guessValue = parseInt(guessValueInput.value);
        
        if (!isNaN(guessValue)) {
            // Check if dealer has restrictions
            if (isDealerPlayer(playerId)) {
                const totalCards = gameState.currentRound;
                
                // Calcular a soma atual dos palpites excluindo o dealer
                const currentSum = gameState.players.reduce((sum, player) => {
                    return player.id !== playerId && player.guess !== null ? sum + player.guess : sum;
                }, 0);
                
                console.log(`Verificando palpite ${guessValue}, soma atual ${currentSum}, total cartas ${totalCards}`);
                
                // Exceção para primeira rodada sem palpites
                const isFirstRoundWithNoGuesses = (gameState.currentRound === 1 && currentSum === 0);
                
                if (guessValue + currentSum === totalCards && !isFirstRoundWithNoGuesses) {
                    alert("Como distribuidor, você não pode dar um palpite que faça o total igual ao número de cartas!");
                    return;
                }
            }
            
            // Send just the number, not an object
            socket.emit('makeGuess', guessValue);
            guessModal.style.display = 'none';
            playSound('guess');
        }
    });
    
    // 2.2 Continue button
    continueBtn.addEventListener('click', () => {
        roundSummaryModal.style.display = 'none';
        
        // Send both event types to ensure one works
        console.log("Attempting to continue to next round...");
        
        // Try the first event name (newer servers)
        socket.emit('readyForNextRound');
        
        // Also try the second event name (older servers) with a small delay
        setTimeout(() => {
            socket.emit('continueToNextRound');
        }, 100);
        
        // Add visual feedback
        const feedbackMsg = document.createElement('div');
        feedbackMsg.className = 'system-message';
        feedbackMsg.textContent = "Aguardando próxima rodada...";
        chatMessagesEl.appendChild(feedbackMsg);
        chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
        
        // Force update after a delay in case the server doesn't respond
        setTimeout(() => {
            // Force a server state request
            socket.emit('requestGameState');
            
            // If we're still showing the summary after 5 seconds, hide it anyway
            if (roundSummaryModal.style.display === 'flex') {
                roundSummaryModal.style.display = 'none';
            }
        }, 5000);
    });

    // 2.3 Play card button
    playCardBtn.addEventListener('click', () => {
        if (selectedCardIndex !== null && isCurrentPlayer()) {
            socket.emit('playCard', selectedCardIndex);
            playSound('cardPlay');
            selectedCardIndex = null;
            updatePlayerHandUI();
        }
    });
    
    // New game button
    newGameBtn.addEventListener('click', () => {
        gameOverModal.style.display = 'none';
        waitingRoomModal.style.display = 'flex';
        isPlayerReady = false;
        playerReadyBtn.textContent = 'Pronto';
        socket.emit('restartGame');
    });
            
    // Sound toggle button
    if (soundToggleBtn) {
        soundToggleBtn.addEventListener('click', toggleSound);
    }
    
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

    // Botão de sair do jogo
    const leaveGameBtn = document.getElementById('leave-game-btn');
    if (leaveGameBtn) {
        leaveGameBtn.addEventListener('click', leaveGame);
    }
    
    // Adicione este listener para a tecla F5 e outros eventos de reload
    window.addEventListener('beforeunload', function(e) {
        // Só salvar a sessão se estiver em uma sala
        if (roomId) {
            // Salvar a sessão atual
            saveSessionState();
            
            // Não exibir mensagem de confirmação, apenas salvar a sessão
            // Se quiser exibir uma mensagem, descomente as linhas abaixo
            // e.preventDefault();
            // e.returnValue = 'Suas informações de jogo serão salvas, mas alguns navegadores podem não restaurar a sessão corretamente.';
        }
    });
    
    // Capturar tecla F5 especificamente para mostrar mensagem
    window.addEventListener('keydown', function(e) {
        if ((e.key === 'F5' || (e.ctrlKey && e.key === 'r')) && roomId) {
            console.log('F5 or Ctrl+R key detected, saving session...');
            saveSessionState();
        }
    });
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
    
    // Update player lives - ADICIONADA VERIFICAÇÃO DE SEGURANÇA
    const selfPlayer = gameState.players.find(p => p.id === playerId);
    if (selfPlayer) {
        // Garantir que score nunca seja null, usando valor padrão 5
        playerLivesEl.textContent = selfPlayer.score !== null && selfPlayer.score !== undefined ? selfPlayer.score : 5;
        
        // Add player's guess to the HUD if it exists
        updatePlayerGuessHUD(selfPlayer);
    }
    
    // Update other players
    updatePlayersUI();
    
    // Update player's hand
    updatePlayerHandUI();
    
    // Update cartas na mesa - NOVA FUNÇÃO
    if (typeof updateTableCards === 'function') {
        updateTableCards();
    }
    
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
        // Garantir que as propriedades do jogador existam
        ensurePlayerProperties(player);
        
        // Handle guess being an object
        if (player.guess !== null && typeof player.guess === 'object' && player.guess.guess !== undefined) {
            player.guess = player.guess.guess;
        }
        
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
        /*playerHTML += `<div class="played-card">
            ${player.playedCard ? 
                `<img src="${getCardImagePath(player.playedCard)}" class="card-img" alt="Carta jogada">` : 
                ''}
        </div>`;*/
        
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
        cardEl.dataset.index = i; // Add index data attribute
        
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

// Nova função para atualizar as cartas jogadas na mesa
function updateTableCards() {
    if (!tableCardsEl || !gameState) return;
    
    tableCardsEl.innerHTML = '';
    
    // Obter jogadores vivos que jogaram uma carta nesta rodada
    const playersWithCards = gameState.players.filter(p => p.score > 0 && p.playedCard);
    
    if (playersWithCards.length === 0) return;

    // Ordenar as cartas por valor (maior para menor)
    const sortedPlayers = [...playersWithCards].sort((a, b) => {
        const cardA = a.playedCard;
        const cardB = b.playedCard;
        
        // Se uma das cartas for o trump, ela tem prioridade
        const trumpValue = gameState.trumpCard ? gameState.trumpCard.value + 1 : null;
        if (trumpValue) {
            if (cardA.value === trumpValue && cardB.value !== trumpValue) return -1;
            if (cardB.value === trumpValue && cardA.value !== trumpValue) return 1;
            if (cardA.value === trumpValue && cardB.value === trumpValue) {
                return SUITS[cardA.suit] - SUITS[cardB.suit];
            }
        }
        
        // Comparar valores das cartas
        if (VALUES[cardA.value] !== VALUES[cardB.value]) {
            return VALUES[cardB.value] - VALUES[cardA.value];
        }
        
        // Se os valores forem iguais, comparar naipes
        return SUITS[cardB.suit] - SUITS[cardA.suit];
    });
    
    // Adicionar cada carta à mesa
    sortedPlayers.forEach((player, index) => {
        const cardContainer = document.createElement('div');
        cardContainer.className = 'table-card-container';
        
        const cardEl = document.createElement('img');
        cardEl.src = getCardImagePath(player.playedCard);
        cardEl.className = 'table-card';
        cardEl.alt = `Carta de ${player.name}`;
        
        const playerNameEl = document.createElement('div');
        playerNameEl.className = 'table-card-player';
        playerNameEl.textContent = player.name;
        
        // Destacar a carta do jogador da vez
        if (isPlayerCurrentTurn(player.id)) {
            cardEl.classList.add('winning');
        }
        
        cardContainer.appendChild(cardEl);
        cardContainer.appendChild(playerNameEl);
        tableCardsEl.appendChild(cardContainer);
        
        // Posicionar a carta com um pequeno deslocamento
        const offset = index * 30; // 30 pixels de deslocamento entre cada carta
        cardContainer.style.left = `calc(50% - ${offset}px)`;
        cardContainer.style.zIndex = sortedPlayers.length - index; // Maior carta fica por cima
    });
}

function showGuessModal() {
    console.debug('Chamando showGuessModal', {
        phase: gameState?.phase, 
        isCurrentPlayer: isCurrentPlayer(),
        playerName: playerName,
        currentPlayerName: gameState?.players?.[gameState?.currentPlayerIndex]?.name
    });
    
    // Primeiro definir valores padrão
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
    
    // MODIFICAÇÃO: Sempre mostrar o modal, sem verificação dupla
    guessModal.style.display = 'flex';
    console.log('Modal de palpites exibido:', guessModal.style.display);
    
    // Log com informações detalhadas para diagnóstico
    if (gameState && gameState.phase !== 'guess') {
        console.warn('Atenção: Modal de palpites sendo exibido fora da fase de palpites:', gameState.phase);
    }
    if (gameState && !isCurrentPlayer()) {
        console.warn('Atenção: Modal de palpites sendo exibido quando não é a vez do jogador');
    }
    
    // Salvar o estado de sessão para refletir que o modal está aberto
    saveSessionState();
    
    // Ensure minimize buttons are properly set up
    ensureMinimizeButtonsSetup();
}

// Function to update confirm button text
function updateConfirmButtonText() {
    const guessValue = guessValueInput.value || '0';
    confirmGuessBtn.textContent = `Confirmar (${guessValue})`;
}

function showRoundSummary() {
    // Limpar o conteúdo da tabela
    summaryTableBodyEl.innerHTML = '';
    
    // Aplicar minimização se necessário
    if (modalPreferences.roundSummaryMinimized) {
        roundSummaryModal.classList.add('minimized');
    } else {
        roundSummaryModal.classList.remove('minimized');
    }
    
    // Criar o container principal
    const summaryContainer = document.createElement('div');
    summaryContainer.className = 'round-summary-compact';
    
    // Cabeçalho com informações da rodada
    const headerSection = document.createElement('div');
    headerSection.className = 'round-header-compact';
    
    headerSection.innerHTML = `
        <div class="round-number-compact">Rodada ${gameState.currentRound}</div>
        <div class="round-info-compact">
            <div>Fase: <span>${gameState.phase === 'roundEnd' ? 'Fim da Rodada' : gameState.phase}</span></div>
            <div>Jogadores ativos: <span>${gameState.players.filter(p => p.score > 0).length}</span></div>
        </div>
    `;
    
    summaryContainer.appendChild(headerSection);
    
    // Tabela com os resultados
    if (gameState && gameState.roundDetails) {
        const tableContainer = document.createElement('div');
        tableContainer.className = 'table-container-compact';
        
        const table = document.createElement('table');
        table.className = 'summary-table-compact';
        
        // Cabeçalho da tabela
        const tableHeader = document.createElement('thead');
        tableHeader.innerHTML = `
            <tr>
                <th>Jogador</th>
                <th>Palpite</th>
                <th>Ganhou</th>
                <th>Dano</th>
                <th>Vidas</th>
            </tr>
        `;
        
        // Corpo da tabela
        const tableBody = document.createElement('tbody');
        
        for (const [playerId, details] of Object.entries(gameState.roundDetails)) {
            const name = details.name || "Jogador";
            
            // Tratar o palpite corretamente
            let guessValue = 0;
            if (details.guessValue !== null && details.guessValue !== undefined) {
                if (typeof details.guessValue === 'object' && details.guessValue.guess !== undefined) {
                    guessValue = details.guessValue.guess;
                } else {
                    guessValue = details.guessValue;
                }
            }
            
            const wins = details.wins ?? 0;
            const damageValue = details.damageValue ?? 0;
            const health = details.health ?? 0;
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${name}</td>
                <td>${guessValue}</td>
                <td>${wins}</td>
                <td><div class="damage-cell">${damageValue}</div></td>
                <td><div class="health-cell">${health}</div></td>
            `;
            
            // Aplicar cores às células de dano e vida
            const damageCell = row.querySelector('.damage-cell');
            damageCell.style.backgroundColor = damageValue > 0 ? '#8B4513' : '#2E8B57';
            
            const healthCell = row.querySelector('.health-cell');
            healthCell.style.backgroundColor = '#2E8B57';
            
            tableBody.appendChild(row);
        }
        
        table.appendChild(tableHeader);
        table.appendChild(tableBody);
        tableContainer.appendChild(table);
        summaryContainer.appendChild(tableContainer);
        
        // Seção de resultados da rodada
        const resultsSection = document.createElement('div');
        resultsSection.className = 'results-section-compact';
        resultsSection.innerHTML = '<h3>Resultados da Rodada</h3>';
        
        const resultsList = document.createElement('div');
        resultsList.className = 'results-list-compact';
        
        for (const [playerId, details] of Object.entries(gameState.roundDetails)) {
            const name = details.name || "Jogador";
            
            // Tratar o palpite corretamente
            let guessValue = 0;
            if (details.guessValue !== null && details.guessValue !== undefined) {
                if (typeof details.guessValue === 'object' && details.guessValue.guess !== undefined) {
                    guessValue = details.guessValue.guess;
                } else {
                    guessValue = details.guessValue;
                }
            }
            
            const wins = details.wins ?? 0;
            const acertou = guessValue === wins;
            
            const resultItem = document.createElement('div');
            resultItem.className = 'result-item-compact';
            
            resultItem.innerHTML = `
                <span>${name}:</span>
                <span class="${acertou ? 'result-acerto' : 'result-erro'}">
                    ${acertou ? 'Acertou o palpite!' : `Errou por ${Math.abs(guessValue - wins)}`}
                </span>
            `;
            
            resultsList.appendChild(resultItem);
        }
        
        resultsSection.appendChild(resultsList);
        summaryContainer.appendChild(resultsSection);
    }
    
    // Substituir o conteúdo atual pelo novo container
    const summaryElement = document.querySelector('.round-summary');
    summaryElement.innerHTML = '';
    summaryElement.appendChild(summaryContainer);
    
    // Estilizar o botão continuar
    const continueBtn = document.getElementById('continue-btn');
    if (continueBtn) {
        continueBtn.className = 'continue-btn-compact';
        continueBtn.textContent = 'Continuar para próxima rodada →';
    }
    
    roundSummaryModal.style.display = 'flex';
    
    // Garantir que os botões de minimizar estejam configurados
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
    // Verificar se gameState existe
    if (!gameState) return false;
    
    // Verificar se currentPlayerIndex é válido
    if (gameState.currentPlayerIndex === undefined || gameState.currentPlayerIndex === null) return false;
    
    // Verificar se o array de jogadores existe e tem tamanho suficiente
    if (!gameState.players || !Array.isArray(gameState.players) || 
        gameState.players.length <= gameState.currentPlayerIndex) return false;
    
    // Verificar se o jogador na posição currentPlayerIndex tem ID
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (!currentPlayer || !currentPlayer.id) return false;
    
    // Finalmente, verificar se o ID corresponde ao jogador local
    return currentPlayer.id === playerId;
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
    
    // Calcular a soma real dos palpites no momento atual
    const sumGuesses = gameState.players.reduce((sum, player) => {
        // Só contabiliza palpites de jogadores que não são o dealer e já fizeram palpite
        if (player.id !== playerId && player.guess !== null) {
            // Lidar com palpite sendo objeto
            if (typeof player.guess === 'object' && player.guess.guess !== undefined) {
                return sum + player.guess.guess;
            } else {
                return sum + player.guess;
            }
        }
        return sum;
    }, 0);
    
    console.log(`Calculando palpites permitidos: Rodada ${currentRound}, Soma atual ${sumGuesses}`);
    
    if (currentRound === 1) {
        if (sumGuesses > 0) {
            console.log(`Rodada 1 com palpites: permitido [1]`);
            return [1];
        } else {
            console.log(`Rodada 1 sem palpites: permitido [0, 1]`);
            return [0, 1];
        }
    } else {
        // Gerar array com todos os possíveis palpites (0 até currentRound)
        const possibleGuesses = Array.from({length: currentRound + 1}, (_, i) => i);
        
        // Filtrar o valor que somado aos palpites existentes resultaria no número da rodada
        const allowedGuesses = possibleGuesses.filter(guess => (guess + sumGuesses) !== currentRound);
        
        console.log(`Rodada ${currentRound}, palpites permitidos: ${allowedGuesses.join(', ')}`);
        return allowedGuesses;
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
        playerLivesEl.parentNode.insertBefore(playerGuessEl, playerLivesEl.nextSibling);
    }
    
    // Handle guess being an object
    let playerGuess = player.guess;
    if (playerGuess !== null && typeof playerGuess === 'object' && playerGuess.guess !== undefined) {
        playerGuess = playerGuess.guess;
    }
    
    // Update the content based on guess availability
    if (playerGuess !== null && (gameState.phase === 'play' || gameState.phase === 'roundEnd')) {
        playerGuessEl.innerHTML = `Seu palpite: <span>${playerGuess}</span> | Ganhou: <span>${player.wins || 0}</span>`;
        playerGuessEl.style.display = 'block';
    } else {
        playerGuessEl.style.display = 'none';
    }
}

// Function to toggle sound
function toggleSound() {
    soundEnabled = !soundEnabled;
    
    // Update button appearance
    if (soundToggleBtn) {
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
}

// Function to load sound preference
function loadSoundPreference() {
    const savedPreference = localStorage.getItem('fodinhaSound');
    if (savedPreference !== null) {
        soundEnabled = savedPreference === 'on';
        
        // Update button appearance
        if (soundToggleBtn && !soundEnabled) {
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
                    socket.emit('playCard', selectedCardIndex);
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
    console.log("Game initializing...");
    
    // Verificar se existe uma sessão salva antes de inicializar
    const savedSession = loadSessionState();
    
    if (savedSession) {
        console.log("Sessão anterior encontrada, tentando reconectar...", savedSession);
        
        // Mostrar overlay de reconexão
        const reconnectingOverlay = showReconnectingOverlay();
        
        // Inicializar o socket normalmente
        initializeSocket();
        setupEventListeners();
        preloadSounds();
        loadSoundPreference();
        
        // O resto da reconexão será tratado no evento de conexão do socket
        
        // Definir timeout para o caso de falha na reconexão
        setTimeout(() => {
            // Se ainda estiver mostrando a overlay e não houver roomId (não reconectou)
            if (document.querySelector('.reconnecting-overlay') && !roomId) {
                console.log("Falha ao reconectar automaticamente.");
                hideReconnectingOverlay();
                
                // Mostrar o modal de entrada
                joinRoomModal.style.display = 'flex';
                waitingRoomModal.style.display = 'none';
                
                // Limpar a sessão para evitar tentativas futuras
                clearSessionState();
                
                // Adicionar mensagem de falha
                addSystemMessage("Não foi possível reconectar à sala anterior.");
            }
        }, 10000); // 10 segundos para tentar reconectar
    } else {
        // Inicialização normal sem sessão anterior
        initializeSocket();
        setupEventListeners();
        preloadSounds();
        loadSoundPreference();
        
        // Adicionar listeners de erro
        socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            addSystemMessage("Erro de conexão. Tentando reconectar...");
        });
        
        socket.on('connect_timeout', () => {
            console.error('Connection timeout');
            addSystemMessage("Tempo de conexão esgotado. Tentando reconectar...");
        });
        
        socket.on('error', (error) => {
            console.error('Socket error:', error);
            addSystemMessage("Erro no servidor. Tente novamente mais tarde.");
        });
        
        // Mostrar modal de entrada
        joinRoomModal.style.display = 'flex';
        waitingRoomModal.style.display = 'none';
    }
    
    // Setup minimize buttons
    ensureMinimizeButtonsSetup();
    
    console.log("Game initialization complete.");

    // Adicione esta linha como a última instrução do window.onload
    setupDebugTools();
};

// Função para diagnóstico de modais
function diagnosticModals() {
    // Estado atual do jogo
    const gameStatus = {
        gameState: gameState ? {
            phase: gameState.phase,
            currentRound: gameState.currentRound,
            currentPlayerIndex: gameState.currentPlayerIndex,
            currentPlayer: gameState.players && gameState.currentPlayerIndex >= 0 && gameState.currentPlayerIndex < gameState.players.length ? 
                          gameState.players[gameState.currentPlayerIndex].name : 'Desconhecido',
            isCurrentPlayerYou: isCurrentPlayer()
        } : 'Não inicializado',
        
        // Estado dos modais
        modals: {
            guessModal: {
                display: guessModal.style.display,
                minimized: modalPreferences.guessModalMinimized
            },
            roundSummaryModal: {
                display: roundSummaryModal.style.display,
                minimized: modalPreferences.roundSummaryMinimized
            },
            gameOverModal: {
                display: gameOverModal.style.display
            }
        },
        
        // Informações de sessão
        session: loadSessionState(),
        
        // Informações do jogador
        player: {
            id: playerId,
            name: playerName,
            isReady: isPlayerReady,
            handSize: playerHand ? playerHand.length : 0
        }
    };
    
    console.log('=== DIAGNÓSTICO DO JOGO ===');
    console.log(JSON.stringify(gameStatus, null, 2));
    console.log('==========================');
    
    return gameStatus;
}

// Exponha a função de diagnóstico na janela para acesso fácil
window.runDiagnostic = diagnosticModals;

// Botão de verificação manual (apenas para depuração)
function addDebugButton() {
    // Verificar se o botão já existe
    if (document.getElementById('debug-check-modals')) {
        return;
    }
    
    // Criar botão de verificação manual
    const debugButton = document.createElement('button');
    debugButton.id = 'debug-check-modals';
    debugButton.textContent = 'Verificar Modais';
    debugButton.style.position = 'fixed';
    debugButton.style.bottom = '10px';
    debugButton.style.right = '10px';
    debugButton.style.zIndex = '9999';
    debugButton.style.backgroundColor = '#ff5522';
    debugButton.style.color = 'white';
    debugButton.style.border = 'none';
    debugButton.style.borderRadius = '4px';
    debugButton.style.padding = '8px 12px';
    debugButton.style.cursor = 'pointer';
    debugButton.style.opacity = '0.7';
    
    // Adicionar evento de clique
    debugButton.addEventListener('click', () => {
        console.log('Verificação manual de modais iniciada');
        
        // Forçar requisição de estado do jogo
        socket.emit('requestGameState');
        
        // Verificar modais após um pequeno delay
        setTimeout(() => {
            checkAndShowModals();
            
            // Forçar abertura do modal de palpites se for a fase correta
            if (gameState && gameState.phase === 'guess' && isCurrentPlayer()) {
                console.log('Forçando abertura do modal de palpites via botão de debug');
                showGuessModal();
            } else {
                console.log('Não é necessário mostrar o modal de palpites agora:', {
                    phase: gameState?.phase,
                    isCurrentPlayer: isCurrentPlayer()
                });
            }
            
            // Mostrar diagnóstico
            diagnosticModals();
        }, 500);
    });
    
    // Adicionar ao corpo do documento
    document.body.appendChild(debugButton);
    
    // Adicionar um botão para forçar especificamente o modal de palpites
    const forceGuessButton = document.createElement('button');
    forceGuessButton.id = 'force-guess-modal';
    forceGuessButton.textContent = 'Forçar Modal Palpite';
    forceGuessButton.style.position = 'fixed';
    forceGuessButton.style.bottom = '10px';
    forceGuessButton.style.right = '150px';
    forceGuessButton.style.zIndex = '9999';
    forceGuessButton.style.backgroundColor = '#ff9900';
    forceGuessButton.style.color = 'white';
    forceGuessButton.style.border = 'none';
    forceGuessButton.style.borderRadius = '4px';
    forceGuessButton.style.padding = '8px 12px';
    forceGuessButton.style.cursor = 'pointer';
    forceGuessButton.style.opacity = '0.7';
    
    // Adicionar evento de clique
    forceGuessButton.addEventListener('click', () => {
        console.log('Forçando exibição do modal de palpites');
        showGuessModal();
    });
    
    // Adicionar ao corpo do documento
    document.body.appendChild(forceGuessButton);
}

// Adicione esta chamada no final da inicialização do jogo
// window.onload ou após a reconexão
function setupDebugTools() {
    // Verificar se estamos em modo de desenvolvimento
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.log('Modo de desenvolvimento detectado, adicionando ferramentas de debug');
        addDebugButton();
    } else {
        console.log('Modo de produção, ferramentas de debug não adicionadas');
    }
}

function requestSyncAfterReconnect() {
    setTimeout(() => {
        // Verificação progressiva
        console.log('Iniciando sequência de sincronização após reconexão');
        
        // Primeira solicitação após 1s
        setTimeout(() => {
            if (roomId) {
                console.log('Solicitação #1: requestGameState');
                socket.emit('requestGameState');
            }
        }, 1000);
        
        // Segunda solicitação após 2s
        setTimeout(() => {
            if (roomId) {
                console.log('Solicitação #2: requestFullSync');
                socket.emit('requestFullSync');
            }
        }, 2000);
        
        // Terceira solicitação após 4s se as anteriores não funcionaram
        setTimeout(() => {
            if (roomId && (!gameState || Object.keys(gameState).length === 0)) {
                console.log('Solicitação #3: requestFullSync (retry)');
                socket.emit('requestFullSync');
                
                // Inicia monitoramento para verificar sucesso
                monitorReconnectionSuccess();
            }
        }, 4000);
    }, 500);
}

// Função para tentar reconexão com retry
function attemptReconnect(savedSession, maxRetries = 3) {
    let reconnectAttempt = 0;
    const reconnectInterval = 2000; // 2 seconds between attempts
    
    // Show reconnecting overlay
    const reconnectingOverlay = showReconnectingOverlay();
    
    // Function that makes the reconnection attempt
    function tryReconnect() {
        reconnectAttempt++;
        console.log(`Reconnection attempt ${reconnectAttempt}/${maxRetries}`);
        
        // Update message in overlay
        const statusElement = reconnectingOverlay.querySelector('p');
        if (statusElement) {
            statusElement.textContent = `Attempting to reconnect to your game (${reconnectAttempt}/${maxRetries})...`;
        }
        
        // Send reconnection request
        socket.emit('joinRoom', { 
            playerName: savedSession.playerName, 
            roomId: savedSession.roomId,
            previousSocketId: savedSession.socketId,
            persistentId: savedSession.persistentId || getPersistentPlayerId(),
            isReconnecting: true
        });
        
        // Set timeout for this attempt
        const timeoutId = setTimeout(() => {
            // If we haven't received confirmation and have more attempts, try again
            if (!roomId && reconnectAttempt < maxRetries) {
                tryReconnect();
            } else if (!roomId) {
                // If we reached the maximum attempts, give up
                console.error('Maximum reconnection attempts reached without success');
                hideReconnectingOverlay();
                clearSessionState();
                
                // Show message to the user
                const errorMsg = document.createElement('div');
                errorMsg.className = 'reconnection-error';
                errorMsg.innerHTML = `
                    <div class="error-box">
                        <h3>Reconnection Failed</h3>
                        <p>Could not reconnect to your previous game.</p>
                        <button id="return-home-btn">Return to Home Screen</button>
                    </div>
                `;
                document.body.appendChild(errorMsg);
                
                // Add event to button
                document.getElementById('return-home-btn').addEventListener('click', () => {
                    window.location.reload();
                });
            }
        }, reconnectInterval);
        
        // If we receive confirmation, clear the timeout
        const clearTimeoutFn = () => {
            clearTimeout(timeoutId);
            socket.off('playerJoined', clearTimeoutFn);
        };
        
        // Listen for confirmation event
        socket.once('playerJoined', clearTimeoutFn);
    }
    
    // Start first attempt
    tryReconnect();
}

// Monitoramento de sucesso na reconexão
function monitorReconnectionSuccess(timeout = 10000) {
    let reconnected = false;
    const startTime = Date.now();
    
    // Function to check if reconnection was successful
    function checkReconnection() {
        if (roomId && gameState) {
            console.log('Reconnection successful:', {
                room: roomId, 
                playerId: playerId,
                gamePhase: gameState.phase
            });
            reconnected = true;
            hideReconnectingOverlay();
            
            // Check and show modals after delay to ensure everything is loaded
            setTimeout(() => {
                checkAndShowModals();
                scheduleModalChecks();
                
                // Send final sync request to ensure
                socket.emit('requestFullSync');
                
                // Add success message
                addSystemMessage("Reconnection successful! Welcome back.");
            }, 1000);
            
            return true;
        }
        
        // Check if we reached timeout
        if (Date.now() - startTime > timeout) {
            console.warn('Timeout in reconnection monitoring.');
            return false;
        }
        
        // Continue checking
        setTimeout(checkReconnection, 500);
        return false;
    }
    
    // Start checking
    checkReconnection();
}
