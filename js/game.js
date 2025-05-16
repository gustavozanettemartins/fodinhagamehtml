const VALUES = {4: 0, 5: 1, 6: 2, 7: 3, 10: 4, 11: 5, 12: 6, 1: 7, 2: 8, 3: 9};
const SUITS = {"diamonds": 0, "spades": 1, "hearts": 2, "clubs": 3};
const SUIT_SYMBOLS = {"diamonds": "♦", "spades": "♠", "hearts": "♥", "clubs": "♣"};
const SUIT_COLORS = {"diamonds": "red", "spades": "black", "hearts": "red", "clubs": "black"};
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
const leaveRoomBtn = document.getElementById('leave-room-btn');
const currentRoomCodeDisplay = document.getElementById('current-room-code');
const playersCountDisplay = document.getElementById('players-count');
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
const tableCardsEl = document.getElementById('table-played-cards'); 
const chatMessagesEl = document.getElementById('chat-messages');
const chatInputEl = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');
let minimizeButtons;
let maximizeButtons;
let persistentPlayerId = null;
let modalCheckInterval = null;

window.onload = function() {
    console.log("Game initializing...");
    const savedSession = loadSessionState();
    if (savedSession) {
        console.log("Sessão anterior encontrada, tentando reconectar...", savedSession);

        const lastUpdate = savedSession.timestamp || 0;
        const oneHour = 60 * 60 * 1000; // 1 hour in milliseconds
        const now = Date.now();
        
        if (now - lastUpdate > oneHour) {
            console.log("Saved session is too old (>1h), starting fresh");
            clearSessionState();
            joinRoomModal.style.display = 'flex';
            waitingRoomModal.style.display = 'none';
            return;
        }        
        const reconnectingOverlay = showReconnectingOverlay();

        initializeSocket();
        setupEventListeners();
        setTimeout(() => {
            if (document.querySelector('.reconnecting-overlay') && !roomId) {
                console.log("Falha ao reconectar automaticamente.");
                hideReconnectingOverlay();
                joinRoomModal.style.display = 'flex';
                waitingRoomModal.style.display = 'none';
                clearSessionState();
                addSystemMessage("Não foi possível reconectar à sala anterior.");
            }
        }, 10000); 
    } else {
        initializeSocket();
        setupEventListeners();
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
        joinRoomModal.style.display = 'flex';
        waitingRoomModal.style.display = 'none';
    }
    ensureMinimizeButtonsSetup();
    console.log("Game initialization complete.");
    setupDebugTools();
};
function ensurePlayerProperties(player) {
    if (!player) return player;
    player.score = player.score !== null && player.score !== undefined ? player.score : 5;
    player.hand = player.hand || [];
    player.guess = player.guess !== undefined ? player.guess : null;
    player.wins = player.wins || 0;
    player.playedCard = player.playedCard || null;
    return player;
}
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
function generateUniqueId() {
    const timestamp = new Date().getTime();
    const random = Math.floor(Math.random() * 1000000);
    return `player_${timestamp}_${random}`;
}
function getPersistentPlayerId() {
    let id = localStorage.getItem('fodinhaPersistentId');
    if (!id) {
        id = generateUniqueId();
        localStorage.setItem('fodinhaPersistentId', id);
        console.log('Novo ID persistente gerado:', id);
    } else {
        console.log('ID persistente recuperado do localStorage:', id);
    }
    return id;
}
function saveSessionState() {
    const modalStates = {
        guessModalOpen: guessModal.style.display === 'flex',
        roundSummaryOpen: roundSummaryModal.style.display === 'flex',
        guessModalMinimized: modalPreferences.guessModalMinimized,
        roundSummaryMinimized: modalPreferences.roundSummaryMinimized
    };
    if (!persistentPlayerId) {
        persistentPlayerId = getPersistentPlayerId();
    }
    const sessionData = {
        socketId: playerId,          
        persistentId: persistentPlayerId, 
        playerName: playerName,
        roomId: roomId,
        isPlayerReady: isPlayerReady,
        modalStates: modalStates,
        timestamp: new Date().getTime()
    };
    localStorage.setItem('fodinhaSession', JSON.stringify(sessionData));
    console.log('Session saved with modal states and persistent ID:', sessionData);
}
function loadSessionState() {
    const savedSession = localStorage.getItem('fodinhaSession');
    if (!savedSession) return null;
    try {
        const sessionData = JSON.parse(savedSession);
        const now = new Date().getTime();
        const sessionAge = now - sessionData.timestamp;
        const maxSessionAge = 30 * 60 * 1000; 
        if (sessionAge > maxSessionAge) {
            console.log('Session expired, removing...');
            localStorage.removeItem('fodinhaSession');
            return null;
        }
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
function clearSessionState() {
    localStorage.removeItem('fodinhaSession');
    localStorage.removeItem('fodinhaPersistentId');
    console.log('Sessão removida');
}
function showReconnectingOverlay() {
    const existingOverlay = document.querySelector('.reconnecting-overlay');
    if (existingOverlay) {
        document.body.removeChild(existingOverlay);
    }
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
function hideReconnectingOverlay() {
    const overlay = document.querySelector('.reconnecting-overlay');
    if (overlay) {
        overlay.classList.add('fade-out');
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, 500);
    }
}
function leaveGame() {
    if (confirm("Tem certeza que deseja sair do jogo?")) {
        const savedSession = loadSessionState();
        if (savedSession && roomId) {
            if (socket && socket.connected && roomId) {
                socket.emit('leaveRoom', {persistentId: savedSession.persistentId, roomId: roomId });
            }
            clearSessionState();
            window.location.href = window.location.pathname;
        }
    }
}
function leaveRoom() {
    const savedSession = loadSessionState();
    if (savedSession && roomId) {
        if (socket && socket.connected && roomId) {
            socket.emit('leaveRoom', {persistentId: savedSession.persistentId, roomId: roomId });
        }
        clearSessionState();
        window.location.href = window.location.pathname;
    }
}
function restoreModalStates(sessionData) {
    if (!sessionData || !sessionData.modalStates) return;
    console.log('Restoring modal states:', sessionData.modalStates);
    const { modalStates } = sessionData;
    if (modalStates.guessModalMinimized !== undefined) {
        modalPreferences.guessModalMinimized = modalStates.guessModalMinimized;
    }
    if (modalStates.roundSummaryMinimized !== undefined) {
        modalPreferences.roundSummaryMinimized = modalStates.roundSummaryMinimized;
    }
    if (modalStates.guessModalOpen === true) {
        console.log('Guess modal was open before refresh, forcing reopening...');
        setTimeout(() => {
            if (gameState && gameState.phase === 'guess') {
                console.log('Forcing guess modal reopening after delay');
                showGuessModal();
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
        setTimeout(() => {
            if (gameState && gameState.phase === 'roundEnd') {
                console.log('Forcing round summary modal reopening after delay');
                showRoundSummary();
            }
        }, 1000);
    }
}
function checkAndShowModals() {
    if (!gameState) {
        console.log('No gameState, cannot check modals');
        return;
    }
    console.log(`Checking modals: Phase=${gameState.phase}, IsCurrentPlayer=${isCurrentPlayer()}`);
    const savedSession = loadSessionState();
    const hadGuessModalOpen = savedSession?.modalStates?.guessModalOpen === true;
    const guessWasOpen = guessModal.style.display === 'flex';
    const summaryWasOpen = roundSummaryModal.style.display === 'flex';
    const gameOverWasOpen = gameOverModal.style.display === 'flex';
    if (gameState.phase === 'guess' && (isCurrentPlayer() || hadGuessModalOpen)) {
        console.log(`It's guess phase and ${isCurrentPlayer() ? 'it\'s player\'s turn' : 'modal was open before'}, showing guess modal`);
        if (!guessWasOpen) {
            showGuessModal();
        } else {
            console.log('Guess modal was already open');
        }
    } 
    else if (gameState.phase === 'roundEnd') {
        console.log('It\'s round end phase, showing summary');
        if (!summaryWasOpen) {
            showRoundSummary();
        } else {
            console.log('Summary modal was already open');
        }
    } 
    else if (gameState.phase === 'gameOver') {
        console.log('It\'s game over phase, showing game over modal');
        if (!gameOverWasOpen) {
            showGameOver();
        } else {
            console.log('Game over modal was already open');
        }
    } else {
        console.log(`No modal needed for phase ${gameState.phase} with isCurrentPlayer=${isCurrentPlayer()}`);
        if (gameState.phase === 'guess' && !isCurrentPlayer() && guessWasOpen && !hadGuessModalOpen) {
            console.log('Closing guess modal because it\'s not player\'s turn and wasn\'t open before');
            guessModal.style.display = 'none';
        }
    }
    console.log('Current modal states after check:', {
        guessModal: guessModal.style.display,
        roundSummaryModal: roundSummaryModal.style.display,
        gameOverModal: gameOverModal.style.display
    });
}
function forceModalAfterReconnect() {
    const savedSession = loadSessionState();
    if (!savedSession || !savedSession.modalStates) return;
    console.log('Verificando modais para força após reconexão:', savedSession.modalStates);
    if (savedSession.modalStates.guessModalOpen === true && gameState && gameState.phase === 'guess') {
        console.log('*** IMPORTANTE: Forçando reabertura do modal de palpites após reconexão ***');
        let attempts = 0;
        const maxAttempts = 5;
        const tryOpen = () => {
            attempts++;
            if (guessModal.style.display === 'flex') {
                console.log('Modal de palpites já está aberto, não é necessário forçar');
                return;
            }
            console.log(`Tentativa ${attempts} de abrir o modal de palpites`);
            showGuessModal();
            if (guessModal.style.display !== 'flex' && attempts < maxAttempts) {
                setTimeout(tryOpen, 1000);
            }
        };
        setTimeout(tryOpen, 2000);
    }
}
function scheduleModalChecks() {
    if (modalCheckInterval) {
        clearInterval(modalCheckInterval);
        modalCheckInterval = null;
    }
    let checksRemaining = 10;
    modalCheckInterval = setInterval(() => {
        console.log(`Periodic modal check (${checksRemaining} remaining)`);
        if (gameState) {
            checkAndShowModals();
            if (gameState.phase === 'guess' && isCurrentPlayer() && guessModal.style.display !== 'flex') {
                console.log('FORCING guess modal open in periodic check');
                showGuessModal();
            }
            if ((gameState.phase === 'guess' && isCurrentPlayer() && guessModal.style.display === 'flex') || 
                (gameState.phase === 'roundEnd' && roundSummaryModal.style.display === 'flex') ||
                (gameState.phase === 'gameOver' && gameOverModal.style.display === 'flex')) {
                console.log('Correct modal found, stopping periodic checks');
                clearInterval(modalCheckInterval);
                modalCheckInterval = null;
                return;
            }
        }
        checksRemaining--;
        if (checksRemaining <= 0) {
            console.log('Maximum number of modal checks reached');
            clearInterval(modalCheckInterval);
            modalCheckInterval = null;
        }
    }, 1000); 
}
function initializeSocket() {
    socket = io();
    socket.on('deleteRoom', (data) => {
        console.log('Room deleted:', data);
        alert(data.message);
        window.location.reload();
    });
    socket.on('connect', () => {
        playerId = socket.id;
        console.log('Connected to server with ID:', playerId);
        setInterval(() => {
            if (roomId) { 
                socket.emit('ping');
            }
        }, 30000);
        const savedSession = loadSessionState();
        if (savedSession && !roomId) {
            console.log('Attempting to reconnect using saved session:', savedSession);
            playerName = savedSession.playerName;
            attemptReconnect(savedSession);
            monitorReconnectionSuccess();
            addSystemMessage(`Attempting to reconnect as ${savedSession.playerName}...`);
        }
    });
    socket.on('awaitingGuess', (data) => {
        console.log('Servidor solicitando palpite:', data);
        if (data.playerId === playerId) {
            console.log('Solicitando diretamente palpite para este jogador');
            setTimeout(() => {
                showGuessModal();
            }, 100);
        }
    });
    socket.on('phaseChanged', (data) => {
        console.log('Fase do jogo alterada:', data);
        if (gameState) {
            gameState.phase = data.phase;
        }
        if (data.phase === 'guess' && data.currentPlayer === playerId) {
            console.log('Fase alterada para palpites e é a nossa vez');
            setTimeout(() => {
                showGuessModal();
            }, 200);
        }
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
        const savedSession = loadSessionState();
        const isReconnecting = savedSession && data.playerName === savedSession.playerName;
        hideReconnectingOverlay();
        if (isReconnecting) {
            addSystemMessage(`Você se reconectou à sala.`);
            if (savedSession.isPlayerReady && !isPlayerReady) {
                console.log("Restaurando estado de 'pronto':", savedSession.isPlayerReady);
                isPlayerReady = savedSession.isPlayerReady;
                if (playerReadyBtn) {
                    playerReadyBtn.textContent = isPlayerReady ? 'Aguardando' : 'Pronto';
                }
                socket.emit('playerReady', { ready: isPlayerReady });
            }
            restoreModalStates(savedSession);
            console.log('Solicitando sincronização completa após reconexão');
            setTimeout(() => {
                socket.emit('requestFullSync');
            }, 500);
        } else {
            addSystemMessage(`${data.playerName} entrou na sala.`);
        }
        saveSessionState();
        if (data.playerName === playerName) {
            console.log("I joined a room, requesting game state");
            setTimeout(() => {
                socket.emit('requestGameState');
            }, 500);
        }
    });
    socket.on('playerUpdate', (data) => {
        console.log('Player update:', data);
        updatePlayersList(data.players);
        playersCountDisplay.textContent = data.players.length;
        const ourPlayer = data.players.find(p => p.id === playerId);
        if (ourPlayer && ourPlayer.isReady !== isPlayerReady) {
            console.log("Our ready status is out of sync. Server:", ourPlayer.isReady, "Client:", isPlayerReady);
            isPlayerReady = ourPlayer.isReady;
            playerReadyBtn.textContent = isPlayerReady ? 'Aguardando' : 'Pronto';
        }
        saveSessionState();
    });
    socket.on('playerLeft', (data) => {
        console.log(data);
        updatePlayersList(data.players);
        playersCountDisplay.textContent = data.players.length;
        addSystemMessage(`${data.message}`);
    });
    socket.on('gameState', (data) => {
        console.log('Game state update:', data);
        data.lastStateUpdate = new Date().getTime();
        if (data.players && Array.isArray(data.players)) {
            data.players = data.players.map(player => {
                player = ensurePlayerProperties(player);
                if (player.guess !== null && typeof player.guess === 'object' && player.guess.guess !== undefined) {
                    player.guess = player.guess.guess;
                }
                return player;
            });
        }
        const previousPhase = gameState ? gameState.phase : null;
        const wasCurrentPlayer = gameState ? isCurrentPlayer() : false;
        gameState = data;
        if (data.hand) {
            playerHand = data.hand;
        }
        updateGameUI();
        saveSessionState();
        const isReconnecting = previousPhase === null && gameState !== null;
        if (isReconnecting || previousPhase !== gameState.phase || (wasCurrentPlayer !== isCurrentPlayer())) {
            console.log('Reconectando ou mudança de fase/turno detectada, verificando modais');
            checkAndShowModals();
        }
        hideReconnectingOverlay();
    });
    socket.on('gameReset', (data) => {
        console.log('Game reset:', data);
        hideAllModals();
        waitingRoomModal.style.display = 'flex';
        isPlayerReady = false;
        playerReadyBtn.textContent = 'Pronto';
        updatePlayersList(data.players);
        addSystemMessage("Jogo reiniciado. Aguardando jogadores ficarem prontos.");
        saveSessionState();
    });
    socket.on('chatMessage', (data) => {
        console.log('Chat message received:', data);
        addChatMessage(data.sender, data.message, data.senderId === playerId);
    });
    socket.on('forceDisconnect', (data) => {
        console.log('Forçado a desconectar:', data);
        clearSessionState();
        alert(data.message || "Você foi desconectado do servidor.");
        window.location.reload();
    });
    socket.on('disconnect', () => {
        console.log('Disconnected from server, attempting to reconnect...');
        if (roomId && playerName) {
            saveSessionState();
        }
        setTimeout(() => {
            socket.connect();
            if (roomId && playerName) {
                setTimeout(() => {
                    socket.emit('joinRoom', { 
                        playerName, 
                        roomId: roomId 
                    });
                }, 1000);
            }
        }, 3000);
        addSystemMessage("Conexão perdida. Tentando reconectar...");
    });
    socket.on('reconnect', () => {
        console.log('Reconnected to server');
        addSystemMessage("Reconectado ao servidor!");
        if (roomId) {
            setTimeout(() => {
                socket.emit('requestGameState');
                setTimeout(() => {
                    console.log('Verificando modais após reconexão');
                    checkAndShowModals();
                }, 1500); 
            }, 1000);
        }
    });
    socket.on('gameStart', (data) => {
        console.log('Game started:', data);
        waitingRoomModal.style.display = 'none';
        addSystemMessage("O jogo começou!");
        socket.emit('requestGameState');
        saveSessionState();
    });
    socket.on('error', (error) => {
        console.error('Socket error:', error);
        addSystemMessage(`Erro: ${error.message || 'Ocorreu um erro de conexão'}`);
    });
    socket.on('roomError', (data) => {
        console.error('Room error:', data);
        alert(data.message || "Erro ao entrar na sala");
        const savedSession = loadSessionState();
        if (savedSession && savedSession.roomId === data.roomId) {
            console.log('Erro ao reconectar usando sessão salva, limpando sessão...');
            clearSessionState();
        }
    });
    socket.on('currentPlayerUpdate', (data) => {
        console.log('Atualização de jogador atual recebida:', data);
        if (!gameState) {
            console.warn('Recebido currentPlayerUpdate mas gameState é null');
            return;
        }
        gameState.currentPlayerIndex = data.currentPlayerIndex;
        gameState.phase = data.phase;
        updateGameUI();
        checkAndShowModals();
    });
    socket.on('awaitingGuess', (data) => {
        console.log('Servidor solicitando palpite:', data);
        if (data.playerId === playerId) {
            console.log('Forçando exibição do modal de palpite por solicitação do servidor');
            showGuessModal();
        }
    });
    socket.on('yourTurn', (data) => {
        console.log('É sua vez de jogar:', data);
        if (waitingMessageEl) {
            waitingMessageEl.style.display = 'none';
        }
        updateGameUI();
    });
    socket.on('fullSyncResponse', (data) => {
        console.log('Full sync response received:', data);
        gameState = data.gameState;
        if (data.gameState.hand) {
            playerHand = data.gameState.hand;
        }
        updateGameUI();
        checkAndShowModals();
        if (data.isYourTurn) {
            console.log('Sync confirms it\'s my turn to play');
            if (gameState.phase === 'guess') {
                showGuessModal();
            }
        }
    });
    socket.on('syncError', (error) => {
        console.error('Sync error received:', error);
        addSystemMessage(`Sync error: ${error.message}. Attempting to automatically reconnect...`);
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
        document.getElementById('force-reload-btn').addEventListener('click', () => {
            window.location.reload();
        });
        setTimeout(() => {
            if (roomId) {
                console.log('Attempting to recover session after sync error...');
                socket.emit('requestGameState');
                setTimeout(() => {
                    socket.emit('requestFullSync');
                }, 1000);
            }
        }, 2000);
    });
    socket.on('gameCancelled', (data) => {
        console.log('Game cancelled:', data);
        alert(data.message || "Partida cancelada.");
        clearSessionState();
        hideAllModals();        
        waitingRoomModal.style.display = 'flex';
    })
}
function setupEventListeners() {
    joinRoomBtn.addEventListener('click', () => {
        playerName = playerNameInput.value.trim();
        const roomIdValue = roomIdInput.value.trim();
        if (playerName) {
            joinRoomBtn.textContent = "Conectando...";
            joinRoomBtn.disabled = true;
            if (!persistentPlayerId) {
                persistentPlayerId = getPersistentPlayerId();
            }
            console.log("Joining room with name:", playerName, "room:", roomIdValue || "new room", "persistentId:", persistentPlayerId);
            socket.emit('joinRoom', { 
                playerName, 
                roomId: roomIdValue || null,
                persistentId: persistentPlayerId
            });
            setTimeout(() => {
                if (joinRoomModal.style.display !== 'none') {
                    joinRoomBtn.textContent = "Entrar / Criar Sala";
                    joinRoomBtn.disabled = false;
                    addSystemMessage("Erro ao entrar na sala. Tente novamente.");
                }
            }, 5000);
            joinRoomModal.style.display = 'none';
            waitingRoomModal.style.display = 'flex';
        } else {
            alert("Por favor, digite seu nome para continuar.");
        }
    });
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
    leaveRoomBtn.addEventListener('click', () => {
        leaveRoom();
        //clearSessionState();
        //joinRoomModal.style.display = 'flex';
        //waitingRoomModal.style.display = 'none';
    });
    confirmGuessBtn.addEventListener('click', () => {
        const guessValue = parseInt(guessValueInput.value);
        if (!isNaN(guessValue)) {
            if (isDealerPlayer(playerId)) {
                const totalCards = gameState.currentRound;
                const currentSum = gameState.players.reduce((sum, player) => {
                    return player.id !== playerId && player.guess !== null ? sum + player.guess : sum;
                }, 0);
                console.log(`Verificando palpite ${guessValue}, soma atual ${currentSum}, total cartas ${totalCards}`);
                const isFirstRoundWithNoGuesses = (gameState.currentRound === 1 && currentSum === 0);
                if (gameState.currentRound === 1 && guessValue !== 1) {
                    alert("Como distribuidor, na primeira rodada você só pode apostar 1!");
                    return;
                }
                if (guessValue + currentSum === totalCards && !isFirstRoundWithNoGuesses) {
                    alert("Como distribuidor, você não pode dar um palpite que faça o total igual ao número de cartas!");
                    return;
                }
            }
            socket.emit('makeGuess', guessValue);
            guessModal.style.display = 'none';
        }
    });
    continueBtn.addEventListener('click', () => {
        roundSummaryModal.style.display = 'none';
        console.log("Attempting to continue to next round...");
        socket.emit('readyForNextRound');
        setTimeout(() => {
            socket.emit('continueToNextRound');
        }, 100);
        const feedbackMsg = document.createElement('div');
        feedbackMsg.className = 'system-message';
        feedbackMsg.textContent = "Aguardando próxima rodada...";
        chatMessagesEl.appendChild(feedbackMsg);
        chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
        setTimeout(() => {
            socket.emit('requestGameState');
            if (roundSummaryModal.style.display === 'flex') {
                roundSummaryModal.style.display = 'none';
            }
        }, 5000);
    });
    playCardBtn.addEventListener('click', () => {
        if (selectedCardIndex !== null && isCurrentPlayer()) {
            socket.emit('playCard', selectedCardIndex);
            selectedCardIndex = null;
            updatePlayerHandUI();
        }
    });
    newGameBtn.addEventListener('click', () => {
        gameOverModal.style.display = 'none';
        waitingRoomModal.style.display = 'flex';
        isPlayerReady = false;
        playerReadyBtn.textContent = 'Pronto';
        socket.emit('restartGame');
    });
    sendChatBtn.addEventListener('click', sendChatMessage);
    chatInputEl.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });
    setupMinimizeButtons();
    const leaveGameBtn = document.getElementById('leave-game-btn');
    if (leaveGameBtn) {
        leaveGameBtn.addEventListener('click', leaveGame);
    }
    window.addEventListener('beforeunload', function(e) {
        if (roomId) {
            saveSessionState();
        }
    });
    window.addEventListener('keydown', function(e) {
        if ((e.key === 'F5' || (e.ctrlKey && e.key === 'r')) && roomId) {
            console.log('F5 or Ctrl+R key detected, saving session...');
            saveSessionState();
        }
    });
}
function sendChatMessage() {
    const message = chatInputEl.value.trim();
    if (message.length === 0) return;
    socket.emit('chatMessage', {
        message: message,
        roomId: roomId
    });
    chatInputEl.value = '';
}
function addChatMessage(sender, message, isOwnMessage) {
    const messageEl = document.createElement('div');
    messageEl.className = `chat-message ${isOwnMessage ? 'own-message' : ''}`;
    messageEl.innerHTML = `
        <div class="chat-message-sender">${sender}:</div>
        <div class="chat-message-text">${escapeHTML(message)}</div>
    `;
    chatMessagesEl.appendChild(messageEl);
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}
function addSystemMessage(message) {
    const messageEl = document.createElement('div');
    messageEl.className = 'system-message';
    messageEl.textContent = message;
    chatMessagesEl.appendChild(messageEl);
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}
function escapeHTML(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
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
    if (gameState.phase !== 'waiting') {
        waitingRoomModal.style.display = 'none';
    }
    roundNumberEl.textContent = gameState.currentRound;
    tableRoundEl.textContent = gameState.currentRound;
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
    if (gameState.trumpCard) {
        trumpCardEl.src = getCardImagePath(gameState.trumpCard);
    } else {
        trumpCardEl.src = '';
    }
    const selfPlayer = gameState.players.find(p => p.id === playerId);
    if (selfPlayer) {
        playerLivesEl.textContent = selfPlayer.score !== null && selfPlayer.score !== undefined ? selfPlayer.score : 5;
        updatePlayerGuessHUD(selfPlayer);
    }
    updatePlayersUI();
    updatePlayerHandUI();
    if (typeof updateTableCards === 'function') {
        updateTableCards();
    }
    updateCardHistory();
    if (isCurrentPlayer()) {
        waitingMessageEl.style.display = 'none';
    } else {
        if (gameState.phase === 'play' && selfPlayer && selfPlayer.guess !== null) {
            waitingMessageEl.innerHTML = `Aguardando seu turno... (Seu palpite: ${selfPlayer.guess}, Ganhou: ${selfPlayer.wins || 0})`;
        } else {
            waitingMessageEl.textContent = 'Aguardando seu turno...';
        }
        waitingMessageEl.style.display = 'block';
    }
    playCardBtn.disabled = !(gameState.phase === 'play' && isCurrentPlayer() && selectedCardIndex !== null);
}
function updatePlayersUI() {
    playersContainerEl.innerHTML = '';
    const otherPlayers = gameState.players.filter(p => p.id !== playerId);
    for (const player of otherPlayers) {
        ensurePlayerProperties(player);
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
        let playerHTML = `
            <div class="player-status">${player.score}</div>
            <div class="player-name">${player.name}</div>
            <div class="player-health">Vidas: ${player.score}</div>
            ${player.guess !== null ? `<div class="player-guess">Palpite: ${player.guess}</div>` : ''}
            ${gameState.phase === 'play' ? `<div class="player-wins">Ganhou: ${player.wins}</div>` : ''}
        `;
        if (player.hand && (gameState.firstRound || gameState.phase === 'waiting')) {
            playerHTML += `<div class="player-cards">
                <div class="player-cards-title">Cartas:</div>
                <div class="player-cards-container">`;
            player.hand.forEach(card => {
                playerHTML += `<img src="${getCardImagePath(card)}" class="opponent-card" alt="Carta do oponente">`;
            });
            playerHTML += `</div></div>`;
        } else if (player.handSize > 0) {
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
        if (card.hidden) {
            cardEl.src = getBackImagePath();
            cardEl.title = "Carta oculta";
            cardEl.classList.add('hidden');
        } else {
            cardEl.src = getCardImagePath(card);
        }
        cardEl.className = 'hand-card';
        cardEl.dataset.index = i; 
        if (gameState && gameState.firstRound) {
            cardEl.classList.add('hidden');
        }
        if (i === selectedCardIndex) {
            cardEl.classList.add('selected');
        }
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
function updateTableCards() {
    if (!tableCardsEl || !gameState) return;
    tableCardsEl.innerHTML = '';
    const playersWithCards = gameState.players.filter(p => p.score > 0 && p.playedCard);
    if (playersWithCards.length === 0) return;
    const sortedPlayers = [...playersWithCards].sort((a, b) => {
        const cardA = a.playedCard;
        const cardB = b.playedCard;
        const trumpValue = gameState.trumpCard ? gameState.trumpCard.value + 1 : null;
        if (trumpValue) {
            if (cardA.value === trumpValue && cardB.value !== trumpValue) return -1;
            if (cardB.value === trumpValue && cardA.value !== trumpValue) return 1;
            if (cardA.value === trumpValue && cardB.value === trumpValue) {
                return SUITS[cardA.suit] - SUITS[cardB.suit];
            }
        }
        if (VALUES[cardA.value] !== VALUES[cardB.value]) {
            return VALUES[cardB.value] - VALUES[cardA.value];
        }
        return SUITS[cardB.suit] - SUITS[cardA.suit];
    });
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
        if (isPlayerCurrentTurn(player.id)) {
            cardEl.classList.add('winning');
        }
        cardContainer.appendChild(cardEl);
        cardContainer.appendChild(playerNameEl);
        tableCardsEl.appendChild(cardContainer);
        const offset = index * 30; 
        cardContainer.style.left = `calc(50% - ${offset}px)`;
        cardContainer.style.zIndex = sortedPlayers.length - index; 
    });
}
function showGuessModal() {
    console.debug('Chamando showGuessModal', {
        phase: gameState?.phase, 
        isCurrentPlayer: isCurrentPlayer(),
        playerName: playerName,
        currentPlayerName: gameState?.players?.[gameState?.currentPlayerIndex]?.name
    });
    guessValueInput.value = '0';
    if (gameState && gameState.currentRound) {
        guessValueInput.max = gameState.currentRound;
    }
    if (modalPreferences.guessModalMinimized) {
        guessModal.classList.add('minimized');
    } else {
        guessModal.classList.remove('minimized');
    }
    let guessMessage = '';
    if (gameState && gameState.firstRound) {
        guessMessage = '<p style="margin-bottom: 15px; color: #ff9900;">Primeira rodada: Você não consegue ver suas cartas!</p>';
    }
    if (gameState && isDealerPlayer(playerId)) {
        const dealerAllowedGuesses = calculateDealerAllowedGuesses();
        guessValueInput.min = Math.min(...dealerAllowedGuesses);
        dealerRestrictionsEl.innerHTML = `${guessMessage}Como você é o dealer, só pode apostar: ${dealerAllowedGuesses.join(', ')}`;
        dealerRestrictionsEl.style.display = 'block';
    } else {
        guessValueInput.min = 0;
        if (gameState && gameState.firstRound) {
            dealerRestrictionsEl.innerHTML = guessMessage;
            dealerRestrictionsEl.style.display = 'block';
        } else {
            dealerRestrictionsEl.style.display = 'none';
        }
    }
    updateConfirmButtonText();
    guessValueInput.removeEventListener('input', updateConfirmButtonText);
    guessValueInput.removeEventListener('change', updateConfirmButtonText);
    guessValueInput.removeEventListener('keyup', updateConfirmButtonText);
    guessValueInput.addEventListener('input', updateConfirmButtonText);
    guessValueInput.addEventListener('change', updateConfirmButtonText);
    guessValueInput.addEventListener('keyup', updateConfirmButtonText);
    guessModal.style.display = 'flex';
    console.log('Modal de palpites exibido:', guessModal.style.display);
    if (gameState && gameState.phase !== 'guess') {
        console.warn('Atenção: Modal de palpites sendo exibido fora da fase de palpites:', gameState.phase);
    }
    if (gameState && !isCurrentPlayer()) {
        console.warn('Atenção: Modal de palpites sendo exibido quando não é a vez do jogador');
    }
    saveSessionState();
    ensureMinimizeButtonsSetup();
}
function updateConfirmButtonText() {
    const guessValue = guessValueInput.value || '0';
    confirmGuessBtn.textContent = `Confirmar (${guessValue})`;
}
function showRoundSummary() {
    summaryTableBodyEl.innerHTML = '';
    if (modalPreferences.roundSummaryMinimized) {
        roundSummaryModal.classList.add('minimized');
    } else {
        roundSummaryModal.classList.remove('minimized');
    }
    const summaryContainer = document.createElement('div');
    summaryContainer.className = 'round-summary-compact';
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
    if (gameState && gameState.roundDetails) {
        const tableContainer = document.createElement('div');
        tableContainer.className = 'table-container-compact';
        const table = document.createElement('table');
        table.className = 'summary-table-compact';
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
        const tableBody = document.createElement('tbody');
        for (const [playerId, details] of Object.entries(gameState.roundDetails)) {
            const name = details.name || "Jogador";
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
        const resultsSection = document.createElement('div');
        resultsSection.className = 'results-section-compact';
        resultsSection.innerHTML = '<h3>Resultados da Rodada</h3>';
        const resultsList = document.createElement('div');
        resultsList.className = 'results-list-compact';
        for (const [playerId, details] of Object.entries(gameState.roundDetails)) {
            const name = details.name || "Jogador";
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
    const summaryElement = document.querySelector('.round-summary');
    summaryElement.innerHTML = '';
    summaryElement.appendChild(summaryContainer);
    const continueBtn = document.getElementById('continue-btn');
    if (continueBtn) {
        continueBtn.className = 'continue-btn-compact';
        continueBtn.textContent = 'Continuar para próxima rodada →';
    }
    roundSummaryModal.style.display = 'flex';
    ensureMinimizeButtonsSetup();
}
function showGameOver() {
    if (!gameState) return;
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
function isCurrentPlayer() {
    if (!gameState) return false;
    if (gameState.currentPlayerIndex === undefined || gameState.currentPlayerIndex === null) return false;
    if (!gameState.players || !Array.isArray(gameState.players) || 
        gameState.players.length <= gameState.currentPlayerIndex) return false;
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (!currentPlayer || !currentPlayer.id) return false;
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
    const sumGuesses = gameState.players.reduce((sum, player) => {
        if (player.id !== playerId && player.guess !== null) {
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
        return [1];
    } else {
        const possibleGuesses = Array.from({length: currentRound + 1}, (_, i) => i);
        const allowedGuesses = possibleGuesses.filter(guess => (guess + sumGuesses) !== currentRound);
        console.log(`Rodada ${currentRound}, palpites permitidos: ${allowedGuesses.join(', ')}`);
        return allowedGuesses;
    }
}
function setupMinimizeButtons() {
    minimizeButtons = document.querySelectorAll('.minimize-btn');
    maximizeButtons = document.querySelectorAll('.maximize-btn');
    console.log("Found minimize buttons:", minimizeButtons.length);
    console.log("Found maximize buttons:", maximizeButtons.length);
    minimizeButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const modalContent = btn.closest('.modal-content');
            const modal = modalContent.closest('.modal');
            modal.classList.add('minimized');
            if (modal.id === 'guess-modal') {
                modalPreferences.guessModalMinimized = true;
                updateConfirmButtonText(); 
            }
            if (modal.id === 'round-summary-modal') modalPreferences.roundSummaryMinimized = true;
            console.log(`Minimized modal: ${modal.id}`);
        });
    });
    maximizeButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const modalContent = btn.closest('.modal-content');
            const modal = modalContent.closest('.modal');
            modal.classList.remove('minimized');
            if (modal.id === 'guess-modal') modalPreferences.guessModalMinimized = false;
            if (modal.id === 'round-summary-modal') modalPreferences.roundSummaryMinimized = false;
            console.log(`Maximized modal: ${modal.id}`);
        });
    });
}
function ensureMinimizeButtonsSetup() {
    if (document.querySelectorAll('.minimize-btn').length === 0) {
        console.log("No minimize buttons found, waiting for DOM...");
        setTimeout(setupMinimizeButtons, 500);
    } else {
        setupMinimizeButtons();
    }
}
function updateCardHistory() {
    if (!gameState) return;
    if (gameState.phase === 'guess' && gameState.semiRounds === 0) {
        cardHistoryEl.innerHTML = '<div class="history-empty-message">O histórico de jogadas aparecerá aqui durante a rodada.</div>';
        return;
    }
    if (gameState.cardHistory && gameState.cardHistory.length > 0) {
        cardHistoryEl.innerHTML = '';
        const sortedHistory = [...gameState.cardHistory].reverse();
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
        Object.values(groupedHistory).forEach(group => {
            const historyItem = document.createElement('div');
            historyItem.className = 'play-history-item';
            const roundHeader = document.createElement('div');
            roundHeader.className = 'play-history-round';
            roundHeader.textContent = `Rodada ${group.round}, Jogada ${group.semiRound}`;
            historyItem.appendChild(roundHeader);
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
            cardHistoryEl.appendChild(historyItem);
        });
        if (cardHistoryEl.children.length === 0) {
            cardHistoryEl.innerHTML = '<div class="history-empty-message">O histórico de jogadas aparecerá aqui durante a rodada.</div>';
        }
    } else if (gameState.phase === 'play') {
        if (!cardHistoryEl.querySelector('.history-empty-message')) {
            cardHistoryEl.innerHTML = '<div class="history-empty-message">O histórico de jogadas aparecerá aqui durante a rodada.</div>';
        }
    }
}
function updatePlayerGuessHUD(player) {
    let playerGuessEl = document.getElementById('player-guess-hud');
    if (!playerGuessEl) {
        playerGuessEl = document.createElement('div');
        playerGuessEl.id = 'player-guess-hud';
        playerGuessEl.className = 'player-guess-hud';
        playerLivesEl.parentNode.insertBefore(playerGuessEl, playerLivesEl.nextSibling);
    }
    let playerGuess = player.guess;
    if (playerGuess !== null && typeof playerGuess === 'object' && playerGuess.guess !== undefined) {
        playerGuess = playerGuess.guess;
    }
    if (playerGuess !== null && (gameState.phase === 'play' || gameState.phase === 'roundEnd')) {
        playerGuessEl.innerHTML = `Seu palpite: <span>${playerGuess}</span> | Ganhou: <span>${player.wins || 0}</span>`;
        playerGuessEl.style.display = 'block';
    } else {
        playerGuessEl.style.display = 'none';
    }
}
function requestSyncAfterReconnect() {
    setTimeout(() => {
        console.log('Iniciando sequência de sincronização após reconexão');
        setTimeout(() => {
            if (roomId) {
                console.log('Solicitação #1: requestGameState');
                socket.emit('requestGameState');
            }
        }, 1000);
        setTimeout(() => {
            if (roomId) {
                console.log('Solicitação #2: requestFullSync');
                socket.emit('requestFullSync');
            }
        }, 2000);
        setTimeout(() => {
            if (roomId && (!gameState || Object.keys(gameState).length === 0)) {
                console.log('Solicitação #3: requestFullSync (retry)');
                socket.emit('requestFullSync');
                monitorReconnectionSuccess();
            }
        }, 4000);
    }, 500);
}
function attemptReconnect(savedSession, maxRetries = 3) {
    let reconnectAttempt = 0;
    const reconnectInterval = 2000; 
    const reconnectingOverlay = showReconnectingOverlay();
    function tryReconnect() {
        reconnectAttempt++;
        console.log(`Reconnection attempt ${reconnectAttempt}/${maxRetries}`);
        const statusElement = reconnectingOverlay.querySelector('p');
        if (statusElement) {
            statusElement.textContent = `Attempting to reconnect to your game (${reconnectAttempt}/${maxRetries})...`;
        }
        socket.emit('joinRoom', { 
            playerName: savedSession.playerName, 
            roomId: savedSession.roomId,
            previousSocketId: savedSession.socketId,
            persistentId: savedSession.persistentId || getPersistentPlayerId(),
            isReconnecting: true
        });
        const timeoutId = setTimeout(() => {
            if (!roomId && reconnectAttempt < maxRetries) {
                tryReconnect();
            } else if (!roomId) {
                console.error('Maximum reconnection attempts reached without success');
                hideReconnectingOverlay();
                clearSessionState();
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
                document.getElementById('return-home-btn').addEventListener('click', () => {
                    window.location.reload();
                });
            }
        }, reconnectInterval);
        const clearTimeoutFn = () => {
            clearTimeout(timeoutId);
            socket.off('playerJoined', clearTimeoutFn);
        };
        socket.once('playerJoined', clearTimeoutFn);
    }
    tryReconnect();
}
function monitorReconnectionSuccess(timeout = 10000) {
    let reconnected = false;
    const startTime = Date.now();
    function checkReconnection() {
        if (roomId && gameState) {
            console.log('Reconnection successful:', {
                room: roomId, 
                playerId: playerId,
                gamePhase: gameState.phase
            });
            reconnected = true;
            hideReconnectingOverlay();
            setTimeout(() => {
                checkAndShowModals();
                scheduleModalChecks();
                socket.emit('requestFullSync');
                addSystemMessage("Reconnection successful! Welcome back.");
            }, 1000);
            return true;
        }
        if (Date.now() - startTime > timeout) {
            console.warn('Timeout in reconnection monitoring.');
            return false;
        }
        setTimeout(checkReconnection, 500);
        return false;
    }
    checkReconnection();
}
