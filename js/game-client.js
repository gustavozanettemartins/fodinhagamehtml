// game-client.js - Adaptação do jogo para funcionar com o lobby único

// Manter a conexão de socket como variável global
let socket = null;
let gameData = null;
let localPlayerId = null;

// Função para conectar ao servidor de WebSocket
function connectToGameServer() {
    console.log('Conectando ao servidor de jogo...');
    
    // Em produção, isso seria o endereço do seu servidor real
    socket = io('http://localhost:3000');
    
    // Configurar event listeners para eventos do jogo
    setupGameSocketEvents();
}

// Configurar eventos específicos do jogo
function setupGameSocketEvents() {
    // Evento de conexão estabelecida
    socket.on('connect', () => {
        console.log('Conectado ao servidor de jogo!');
        localPlayerId = socket.id;
    });
    
    // Evento de jogo iniciado
    socket.on('gameStarted', (data) => {
        console.log('Jogo iniciado:', data);
        gameData = data;
        
        // Inicializar o jogo com os dados recebidos
        initializeMultiplayerGame(data);
        
        // Ocultar interface do lobby
        hideWaitingRoom();
    });
    
    // Evento de cartas distribuídas
    socket.on('dealCards', (data) => {
        console.log('Cartas recebidas:', data);
        
        // Atualizar a mão do jogador local
        updatePlayerHand(data.hand, data.firstRoundHidden);
    });
    
    // Evento de rodada iniciada
    socket.on('roundStarted', (roundData) => {
        console.log('Rodada iniciada:', roundData);
        
        // Atualizar a interface para a nova rodada
        startNewRound(roundData);
    });
    
    // Evento de jogador deu palpite
    socket.on('playerGuessed', (data) => {
        console.log('Jogador deu palpite:', data);
        
        // Atualizar a interface com o palpite do jogador
        updatePlayerGuess(data.playerId, data.guess);
    });
    
    // Evento de jogador jogou carta
    socket.on('cardPlayed', (data) => {
        console.log('Jogador jogou carta:', data);
        
        // Atualizar a interface com a carta jogada
        updatePlayedCard(data.playerId, data.card);
    });
    
    // Evento de troca de fase
    socket.on('phaseChanged', (data) => {
        console.log('Fase alterada para:', data.phase);
        
        // Atualizar a fase do jogo
        game.phase = data.phase;
        updateGameUI();
    });
    
    // Evento de troca de turno
    socket.on('turnChanged', (data) => {
        console.log('Turno alterado para jogador:', data.currentTurn);
        
        // Atualizar o jogador atual
        game.currentPlayerIndex = data.currentTurn;
        updateGameUI();
    });
    
    // Evento de resultado da rodada
    socket.on('roundResult', (resultData) => {
        console.log('Resultado da rodada:', resultData);
        
        // Mostrar o resultado da rodada
        showRoundResult(resultData);
    });
    
    // Evento de jogo finalizado
    socket.on('gameEnded', (endData) => {
        console.log('Jogo finalizado:', endData);
        
        // Mostrar o resultado final do jogo
        showGameResult(endData);
    });
    
    // Evento de jogador saiu
    socket.on('playerLeft', (playerId) => {
        console.log('Jogador saiu:', playerId);
        
        // Atualizar o jogo quando um jogador sai
        handlePlayerLeft(playerId);
    });
    
    // Evento de desconexão
    socket.on('disconnect', () => {
        console.log('Desconectado do servidor de jogo');
        
        // Mostrar mensagem de erro e voltar para o lobby
        showDisconnectMessage();
    });
    
    // Evento de erro
    socket.on('error', (error) => {
        console.error('Erro do servidor:', error);
        
        // Mostrar mensagem de erro
        showErrorMessage(error.message);
    });
}

// Ocultar sala de espera
function hideWaitingRoom() {
    const waitingRoom = document.getElementById('waiting-room');
    if (waitingRoom) {
        waitingRoom.style.display = 'none';
    }
    
    // Mostrar o jogo
    const gameContainer = document.getElementById('game-container');
    if (gameContainer) {
        gameContainer.style.display = 'block';
    }
}

// Inicializar o jogo multiplayer
function initializeMultiplayerGame(gameData) {
    // Inicializar o jogo
    game = new MultiplayerGame(gameData);
    
    // Atualizar a interface
    updateGameUI();
}

// Classe para o jogo multiplayer
class MultiplayerGame extends Game {
    constructor(gameData) {
        // Não chamar o construtor da classe pai, inicializar diretamente
        // Isso evita a inicialização local do jogo
        
        // Inicializar jogadores
        this.players = [];
        this.initializePlayers(gameData.players);
        
        // Inicializar outros parâmetros
        this.currentRound = gameData.round || 1;
        this.phase = 'guess';
        this.currentPlayerIndex = 0;
        this.dealerIndex = 0;
        this.semiRounds = 0;
        this.trumpCard = null;
        this.sumGuesses = 0;
        this.roundDetails = {};
        this.firstRound = gameData.settings.firstRoundHidden;
        this.isMultiplayer = true;
    }
    
    // Inicializar jogadores a partir dos dados recebidos
    initializePlayers(playersData) {
        this.players = [];
        
        for (const playerData of playersData) {
            const player = new Player(playerData.name, playerData.id === localPlayerId);
            player.id = playerData.id;
            player.score = playerData.score || 5;
            this.players.push(player);
        }
    }
    
    // Sobrescrever métodos para comunicação com o servidor
    
    makeHumanGuess(guessValue) {
        // Enviar palpite para o servidor
        socket.emit('makeGuess', { guess: guessValue });
    }
    
    playHumanCard(cardIndex) {
        // Enviar jogada para o servidor
        socket.emit('playCard', { cardIndex: cardIndex });
    }
    
    // Não precisamos implementar a lógica de jogo local, pois tudo será
    // controlado pelo servidor e sincronizado para todos os clientes
}

// Atualizar a mão do jogador com as cartas recebidas
function updatePlayerHand(handData, firstRoundHidden) {
    const humanPlayer = game.getHumanPlayer();
    if (!humanPlayer) return;
    
    // Limpar a mão atual
    humanPlayer.hand = [];
    
    // Adicionar as novas cartas
    for (const cardData of handData) {
        const card = new Card(cardData.value, cardData.suit);
        humanPlayer.hand.push(card);
    }
    
    // Atualizar a primeira rodada com cartas ocultas
    game.firstRound = firstRoundHidden;
    
    // Atualizar a interface
    updatePlayerHandUI();
}

// Iniciar nova rodada
function startNewRound(roundData) {
    // Atualizar o estado do jogo
    game.currentRound = roundData.round;
    game.phase = 'guess';
    game.trumpCard = new Card(roundData.trumpCard.value, roundData.trumpCard.suit);
    
    // Resetar jogadores para nova rodada
    for (const player of game.players) {
        player.resetForNewRound();
    }
    
    // Atualizar a interface
    updateGameUI();
}

// Atualizar o palpite de um jogador
function updatePlayerGuess(playerId, guessValue) {
    const player = game.players.find(p => p.id === playerId);
    if (!player) return;
    
    player.makeGuess(guessValue);
    
    // Atualizar a interface
    updateGameUI();
}

// Atualizar a carta jogada por um jogador
function updatePlayedCard(playerId, cardData) {
    const player = game.players.find(p => p.id === playerId);
    if (!player) return;
    
    // Encontrar e remover a carta da mão (caso seja o jogador local)
    if (player.isHuman) {
        const cardIndex = player.hand.findIndex(c => 
            c.value === cardData.value && c.suit === cardData.suit);
        
        if (cardIndex !== -1) {
            player.playCard(cardIndex);
        }
    } else {
        // Para jogadores CPU, apenas definir a carta jogada
        const card = new Card(cardData.value, cardData.suit);
        player.playedCard = card;
    }
    
    // Atualizar a interface
    updateGameUI();
}

// Mostrar o resultado da rodada
function showRoundResult(resultData) {
    // Atualizar o estado do jogo com os resultados
    game.roundDetails = {};
    
    for (const playerResult of resultData.players) {
        const player = game.players.find(p => p.id === playerResult.id);
        if (!player) continue;
        
        // Atualizar dados do jogador
        player.wins = playerResult.wins;
        player.score = playerResult.score;
        
        // Adicionar aos detalhes da rodada
        game.roundDetails[player.name] = {
            healthBefore: playerResult.healthBefore,
            damageValue: playerResult.damage,
            health: playerResult.score,
            guessValue: playerResult.guess,
            wins: playerResult.wins
        };
    }
    
    // Mostrar o resumo da rodada
    showRoundSummary();
}

// Mostrar o resultado final do jogo
function showGameResult(endData) {
    // Encontrar o vencedor
    const winner = endData.winner ? game.players.find(p => p.id === endData.winner.id) : null;
    
    // Mostrar o modal de fim de jogo
    showGameOver(winner ? winner.name : "Ninguém");
    
    // Atualizar estatísticas do jogador local
    updatePlayerStats(endData);
}

// Atualizar estatísticas do jogador
function updatePlayerStats(endData) {
    const localPlayer = endData.players.find(p => p.id === localPlayerId);
    if (!localPlayer) return;
    
    // Obter perfil atual do localStorage
    const savedProfile = localStorage.getItem('fodinhaProfile');
    if (!savedProfile) return;
    
    try {
        const profile = JSON.parse(savedProfile);
        
        // Atualizar estatísticas
        profile.gamesPlayed = (profile.gamesPlayed || 0) + 1;
        if (localPlayer.id === endData.winner.id) {
            profile.gamesWon = (profile.gamesWon || 0) + 1;
        }
        
        // Salvar de volta no localStorage
        localStorage.setItem('fodinhaProfile', JSON.stringify(profile));
    } catch (e) {
        console.error('Erro ao atualizar estatísticas:', e);
    }
}

// Lidar com saída de jogador durante o jogo
function handlePlayerLeft(playerId) {
    // Encontrar jogador
    const playerIndex = game.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return;
    
    // Mostrar mensagem
    const playerName = game.players[playerIndex].name;
    
    // Opcional: Remover o jogador da lista
    // game.players.splice(playerIndex, 1);
    
    // Atualizar a interface
    updateGameUI();
    
    // Mostrar notificação
    showNotification(`${playerName} saiu do jogo.`);
}

// Mostrar mensagem de desconexão
function showDisconnectMessage() {
    alert('Você foi desconectado do servidor. A página será recarregada.');
    window.location.reload();
}

// Mostrar mensagem de erro
function showErrorMessage(message) {
    alert(`Erro: ${message}`);
}

// Mostrar notificação na interface
function showNotification(message) {
    // Implementar sistema de notificação na interface
    console.log('Notificação:', message);
    
    // Exemplo: criar um elemento temporário
    const notification = document.createElement('div');
    notification.className = 'game-notification';
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Remover após alguns segundos
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 500);
    }, 3000);
}

// Conectar ao servidor quando o documento estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    // Verificar se estamos em uma página de jogo (não no lobby)
    const isGamePage = document.getElementById('game-container') !== null;
    
    if (isGamePage) {
        // Conectar ao servidor de jogo
        connectToGameServer();
    }
});