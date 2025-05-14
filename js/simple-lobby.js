// simple-lobby.js - Sistema de lobby único multiplayer para o jogo Fodinha

// Variáveis globais
let socket = null;
let currentUser = null;
let isHost = false;
let selectedAvatarId = 1;
let connectedPlayers = [];
let lobbyJoined = false;

// Elementos do DOM
const elements = {
    // Perfil
    playerAvatar: document.getElementById('player-avatar'),
    playerNickname: document.getElementById('player-nickname'),
    gamesPlayed: document.getElementById('games-played'),
    gamesWon: document.getElementById('games-won'),
    changeAvatarBtn: document.getElementById('change-avatar-btn'),
    updateProfileBtn: document.getElementById('update-profile-btn'),
    joinLobbyBtn: document.getElementById('join-lobby-btn'),
    
    // Sala de espera
    waitingRoom: document.getElementById('waiting-room'),
    playerCount: document.getElementById('player-count'),
    maxPlayers: document.getElementById('max-players'),
    waitingMessage: document.getElementById('waiting-message'),
    waitingPlayersList: document.getElementById('waiting-players-list'),
    hostControls: document.getElementById('host-controls'),
    startGameBtn: document.getElementById('start-game-btn'),
    
    // Opções do jogo
    initialLives: document.getElementById('initial-lives'),
    firstRoundHidden: document.getElementById('first-round-hidden'),
    
    // Chat
    chatMessages: document.getElementById('chat-messages'),
    chatInput: document.getElementById('chat-input'),
    sendMessageBtn: document.getElementById('send-message-btn'),
    
    // Modal de avatar
    avatarModal: document.getElementById('avatar-modal'),
    avatarsGrid: document.getElementById('avatars-grid'),
    cancelAvatarBtn: document.getElementById('cancel-avatar-btn')
};

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    initLobby();
    setupEventListeners();
});

// Inicialização do lobby
function initLobby() {
    // Carregar perfil do localStorage (se existir)
    loadUserProfile();
    
    // Inicializar interface
    setupAvatarGrid();
    
    // Conectar ao servidor (quando implementado)
    connectToServer();
}

// Carregar perfil do usuário do localStorage
function loadUserProfile() {
    const savedProfile = localStorage.getItem('fodinhaProfile');
    if (savedProfile) {
        try {
            const profile = JSON.parse(savedProfile);
            currentUser = profile;
            elements.playerNickname.value = profile.name || '';
            elements.gamesPlayed.textContent = profile.gamesPlayed || 0;
            elements.gamesWon.textContent = profile.gamesWon || 0;
            
            // Definir avatar
            selectedAvatarId = profile.avatar || 1;
            elements.playerAvatar.src = `img/avatars/avatar${selectedAvatarId}.png`;
        } catch (e) {
            console.error('Erro ao carregar perfil:', e);
            resetUserProfile();
        }
    } else {
        resetUserProfile();
    }
}

// Resetar perfil do usuário para valores padrão
function resetUserProfile() {
    currentUser = {
        id: 'local_' + Date.now(),
        name: '',
        avatar: 1,
        gamesPlayed: 0,
        gamesWon: 0
    };
    selectedAvatarId = 1;
    elements.playerAvatar.src = `img/avatars/avatar1.png`;
}

// Salvar perfil do usuário no localStorage
function saveUserProfile() {
    if (!currentUser) return;
    
    currentUser.name = elements.playerNickname.value.trim() || `Jogador${Math.floor(Math.random() * 1000)}`;
    currentUser.avatar = selectedAvatarId;
    
    localStorage.setItem('fodinhaProfile', JSON.stringify(currentUser));
    
    // Atualizar interface
    elements.playerNickname.value = currentUser.name;
}

// Configurar grid de seleção de avatares
function setupAvatarGrid() {
    elements.avatarsGrid.innerHTML = '';
    
    // Criar 8 opções de avatar
    for (let i = 1; i <= 8; i++) {
        const avatarOption = document.createElement('div');
        avatarOption.className = `avatar-option ${i === selectedAvatarId ? 'selected' : ''}`;
        avatarOption.dataset.avatarId = i;
        
        const avatarImg = document.createElement('img');
        avatarImg.src = `img/avatars/avatar${i}.png`;
        avatarImg.alt = `Avatar ${i}`;
        
        avatarOption.appendChild(avatarImg);
        elements.avatarsGrid.appendChild(avatarOption);
        
        // Adicionar evento de clique
        avatarOption.addEventListener('click', () => {
            document.querySelectorAll('.avatar-option').forEach(opt => opt.classList.remove('selected'));
            avatarOption.classList.add('selected');
            selectedAvatarId = i;
        });
    }
}

// Conectar ao servidor WebSocket
function connectToServer() {
    // Este é um placeholder para quando tivermos um servidor real
    console.log('Conectando ao servidor...');
    
    // Em um cenário real, conectaríamos com algo como:
    // socket = io('http://localhost:3000');
    
    // Simulando conexão bem-sucedida
    setTimeout(() => {
        console.log('Conectado ao servidor (simulação)');
        // Configurar event listeners para os eventos do socket
        setupSocketEvents();
    }, 1000);
}

// Configurar eventos do Socket.io
function setupSocketEvents() {
    // Placeholder para eventos do socket
    
    // Em um cenário real, teriam eventos como:
    /*
    socket.on('connect', () => {
        console.log('Conectado ao servidor');
    });
    
    socket.on('lobbyJoined', (data) => {
        handleLobbyJoined(data);
    });
    
    socket.on('playerJoined', (player) => {
        addPlayerToLobby(player);
    });
    
    socket.on('playerLeft', (playerId) => {
        removePlayerFromLobby(playerId);
    });
    
    socket.on('hostChanged', (newHostId) => {
        updateLobbyHost(newHostId);
    });
    
    socket.on('chatMessage', (message) => {
        addChatMessage(message);
    });
    
    socket.on('gameStarting', (gameData) => {
        startGame(gameData);
    });
    
    socket.on('disconnect', () => {
        console.log('Desconectado do servidor');
        showDisconnectMessage();
    });
    */
}

// Entrar no lobby
function joinLobby() {
    if (lobbyJoined) return;
    
    // Validar nome do jogador
    if (!currentUser.name) {
        alert('Por favor, digite seu nome antes de entrar na sala.');
        elements.playerNickname.focus();
        return;
    }
    
    console.log('Entrando no lobby...');
    
    // Em um cenário real, enviaríamos para o servidor:
    /*
    socket.emit('joinLobby', {
        name: currentUser.name,
        avatar: currentUser.avatar,
        gamesPlayed: currentUser.gamesPlayed,
        gamesWon: currentUser.gamesWon
    });
    */
    
    // Para demonstração, simular a resposta do servidor
    simulateJoinLobby();
}

// Simulação de entrada no lobby (para demonstração)
function simulateJoinLobby() {
    // Simular alguns jogadores
    connectedPlayers = [
        {
            id: 'server_123',
            name: 'João',
            avatar: 3,
            isHost: true
        },
        {
            id: 'server_456',
            name: 'Maria',
            avatar: 2,
            isHost: false
        }
    ];
    
    // Adicionar o jogador atual
    const myPlayer = {
        id: currentUser.id,
        name: currentUser.name,
        avatar: currentUser.avatar,
        isHost: connectedPlayers.length === 0 // É host se for o primeiro jogador
    };
    
    connectedPlayers.push(myPlayer);
    
    // Definir se o jogador atual é o host
    isHost = myPlayer.isHost;
    
    // Mostrar a sala de espera
    lobbyJoined = true;
    showWaitingRoom();
    
    // Adicionar mensagem de boas-vindas no chat
    addChatMessage({
        id: 'system',
        sender: 'Sistema',
        text: `Bem-vindo à sala, ${currentUser.name}!`,
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
    });
}

// Mostrar sala de espera
function showWaitingRoom() {
    // Ocultar área de perfil e mostrar sala de espera
    elements.waitingRoom.style.display = 'flex';
    
    // Atualizar contagem de jogadores
    elements.playerCount.textContent = connectedPlayers.length;
    
    // Verificar se podemos iniciar o jogo (mínimo 2 jogadores)
    const canStart = connectedPlayers.length >= 2;
    elements.startGameBtn.disabled = !canStart;
    
    if (canStart) {
        elements.waitingMessage.textContent = 'Pronto para iniciar!';
        elements.waitingMessage.style.color = '#6bff6b';
    } else {
        elements.waitingMessage.textContent = 'Aguardando mais jogadores...';
        elements.waitingMessage.style.color = '#ff9900';
    }
    
    // Mostrar/ocultar controles de host
    elements.hostControls.style.display = isHost ? 'block' : 'none';
    
    // Renderizar lista de jogadores
    renderWaitingPlayers();
}

// Renderizar jogadores na sala de espera
function renderWaitingPlayers() {
    elements.waitingPlayersList.innerHTML = '';
    
    // Adicionar cada jogador à lista
    connectedPlayers.forEach(player => {
        const playerElement = document.createElement('div');
        playerElement.className = 'player-item';
        
        // Verificar se é o jogador atual
        const isCurrentUser = player.id === currentUser.id;
        
        playerElement.innerHTML = `
            <img src="img/avatars/avatar${player.avatar}.png" alt="Avatar">
            <div class="player-name">${player.name} ${isCurrentUser ? '(Você)' : ''}</div>
            ${player.isHost ? '<span class="host-badge">Host</span>' : ''}
        `;
        
        elements.waitingPlayersList.appendChild(playerElement);
    });
}

// Adicionar mensagem ao chat
function addChatMessage(message) {
    const messageElement = document.createElement('div');
    
    // Determinar se é uma mensagem própria ou de outro jogador
    const isOwnMessage = message.id === currentUser.id;
    const isSystemMessage = message.id === 'system';
    
    if (isSystemMessage) {
        messageElement.className = 'chat-message system';
        messageElement.innerHTML = `
            <div class="message-text">${message.text}</div>
            <div class="message-time">${message.time}</div>
        `;
    } else {
        messageElement.className = `chat-message ${isOwnMessage ? 'own' : 'other'}`;
        messageElement.innerHTML = `
            ${!isOwnMessage ? `<div class="message-sender">${message.sender}</div>` : ''}
            <div class="message-text">${message.text}</div>
            <div class="message-time">${message.time}</div>
        `;
    }
    
    elements.chatMessages.appendChild(messageElement);
    
    // Scroll para a última mensagem
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

// Enviar mensagem de chat
function sendChatMessage() {
    const text = elements.chatInput.value.trim();
    if (!text) return;
    
    const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    // Em um cenário real, enviaríamos para o servidor:
    /*
    socket.emit('chatMessage', {
        text: text
    });
    */
    
    // Para demonstração, adicionar diretamente
    addChatMessage({
        id: currentUser.id,
        sender: currentUser.name,
        text: text,
        time: time
    });
    
    // Limpar o campo de entrada
    elements.chatInput.value = '';
}

// Iniciar jogo
function startGame() {
    if (!isHost) return;
    
    // Obter configurações do jogo
    const initialLives = parseInt(elements.initialLives.value) || 5;
    const firstRoundHidden = elements.firstRoundHidden.checked;
    
    console.log('Iniciando jogo com as configurações:', {
        initialLives,
        firstRoundHidden,
        players: connectedPlayers.length
    });
    
    // Em um cenário real, enviaríamos para o servidor:
    /*
    socket.emit('startGame', {
        initialLives: initialLives,
        firstRoundHidden: firstRoundHidden
    });
    */
    
    // Para demonstração, mostrar um alerta
    alert('Jogo iniciado! (Esta é uma simulação - aqui integraríamos com o jogo principal)');
}

// Adicionar jogador ao lobby (quando outro jogador entra)
function addPlayerToLobby(player) {
    // Adicionar à lista de jogadores
    connectedPlayers.push(player);
    
    // Atualizar a interface
    showWaitingRoom();
    
    // Adicionar mensagem no chat
    addChatMessage({
        id: 'system',
        text: `${player.name} entrou na sala.`,
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
    });
}

// Remover jogador do lobby (quando outro jogador sai)
function removePlayerFromLobby(playerId) {
    // Encontrar índice do jogador
    const playerIndex = connectedPlayers.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return;
    
    // Obter informações do jogador antes de remover
    const player = connectedPlayers[playerIndex];
    
    // Remover da lista
    connectedPlayers.splice(playerIndex, 1);
    
    // Verificar se era o host
    if (player.isHost && connectedPlayers.length > 0) {
        // Promover o próximo jogador a host
        connectedPlayers[0].isHost = true;
        
        // Atualizar o status de host do jogador atual
        if (connectedPlayers[0].id === currentUser.id) {
            isHost = true;
        }
    }
    
    // Atualizar a interface
    showWaitingRoom();
    
    // Adicionar mensagem no chat
    addChatMessage({
        id: 'system',
        text: `${player.name} saiu da sala.`,
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
    });
}

// Atualizar o host do lobby
function updateLobbyHost(newHostId) {
    // Atualizar o status de host de todos os jogadores
    connectedPlayers.forEach(player => {
        player.isHost = player.id === newHostId;
    });
    
    // Atualizar o status de host do jogador atual
    isHost = currentUser.id === newHostId;
    
    // Atualizar a interface
    showWaitingRoom();
    
    // Obter o nome do novo host
    const newHost = connectedPlayers.find(p => p.id === newHostId);
    
    // Adicionar mensagem no chat
    if (newHost) {
        addChatMessage({
            id: 'system',
            text: `${newHost.name} agora é o host da sala.`,
            time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
        });
    }
}

// Mostrar mensagem de desconexão
function showDisconnectMessage() {
    alert('Você foi desconectado do servidor. A página será recarregada.');
    window.location.reload();
}

// Configurar todos os event listeners
function setupEventListeners() {
    // Perfil do jogador
    elements.changeAvatarBtn.addEventListener('click', () => {
        elements.avatarModal.style.display = 'flex';
    });
    
    elements.cancelAvatarBtn.addEventListener('click', () => {
        elements.avatarModal.style.display = 'none';
    });
    
    elements.updateProfileBtn.addEventListener('click', () => {
        saveUserProfile();
        
        // Mostrar confirmação
        elements.updateProfileBtn.textContent = 'Salvo!';
        setTimeout(() => {
            elements.updateProfileBtn.textContent = 'Salvar Perfil';
        }, 1500);
    });
    
    elements.joinLobbyBtn.addEventListener('click', () => {
        saveUserProfile();
        joinLobby();
    });
    
    // Controles do jogo
    elements.startGameBtn.addEventListener('click', () => {
        startGame();
    });
    
    // Chat
    elements.sendMessageBtn.addEventListener('click', () => {
        sendChatMessage();
    });
    
    elements.chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });
    
    // Fechar modal quando clicar fora
    window.addEventListener('click', (e) => {
        if (e.target === elements.avatarModal) {
            elements.avatarModal.style.display = 'none';
        }
    });
}