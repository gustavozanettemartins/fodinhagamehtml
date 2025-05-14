# Implementação do Sistema de Sala Única Multiplayer para o Jogo Fodinha

Este documento descreve a implementação do sistema de sala única multiplayer para o jogo de cartas Fodinha.

## Arquivos Implementados

1. **simple-lobby.html**: Interface da sala de espera multiplayer.
2. **lobby.css**: Estilos para a interface da sala.
3. **simple-lobby.js**: Script do cliente para gerenciar a sala e conexões.
4. **simple-server.js**: Servidor WebSocket para gerenciar jogadores e o jogo.
5. **game-client.js**: Adaptação do jogo original para funcionar em modo multiplayer.

## Estrutura do Sistema

O sistema multiplayer foi projetado com uma arquitetura cliente-servidor usando WebSockets, com um único lobby central:

```
    ┌─────────────┐     WebSocket     ┌─────────────┐
    │             │    Conexão        │             │
    │   Cliente   │<----------------->│   Servidor  │
    │             │                   │             │
    └─────────────┘                   └─────────────┘
      /        \                              |
     /          \                             |
┌─────────┐ ┌─────────┐                ┌─────────────┐
│  Lobby  │ │  Jogo   │                │  Sala Única │
│Interface│ │Interface│                │    Lobby    │
└─────────┘ └─────────┘                └─────────────┘
```

## Funcionalidades Implementadas

### Lobby Único

- **Perfil de Jogador**: Avatar, nome e estatísticas básicas.
- **Sala de Espera**: Interface para aguardar que a sala tenha jogadores suficientes.
- **Chat de Jogo**: Sistema de comunicação entre os jogadores.
- **Controles de Host**: O primeiro jogador a entrar se torna o host e pode iniciar o jogo.
- **Configurações de Jogo**: Opções para personalizar a partida (vidas iniciais, regras).

### Servidor

- **Gerenciamento de Jogadores**: Registro, status e sincronização de jogadores.
- **Gestão da Sala Única**: Controle de entrada e saída de jogadores.
- **Controle de Host**: Transferência automática se o host sair.
- **Sincronização de Estado**: Manter todos os clientes atualizados.
- **Controle de Jogo**: Iniciar e gerenciar o estado do jogo para todos os jogadores.

### Cliente de Jogo

- **Adaptação Multiplayer**: Modificações no jogo original para comunicação com o servidor.
- **Sincronização**: Manter o estado do jogo consistente entre todos os jogadores.
- **Tratamento de Eventos**: Receber e processar atualizações do servidor.

## Como Funciona

1. O jogador acessa a página e configura seu perfil (nome e avatar).
2. Ao entrar no lobby, o jogador vê todos os demais jogadores conectados.
3. O primeiro jogador a entrar se torna o host e tem acesso ao botão de iniciar o jogo.
4. Quando houver pelo menos 2 jogadores, o host pode iniciar o jogo.
5. O servidor envia as informações iniciais para todos os jogadores.
6. Durante o jogo, todas as ações são enviadas ao servidor, que as valida e retransmite para todos os jogadores.
7. Ao final do jogo, os jogadores retornam ao lobby.

## Fluxo de Comunicação

1. **Entrada no Lobby**:
   - Cliente -> Servidor: `joinLobby` (nome, avatar)
   - Servidor -> Cliente: `lobbyJoined` (dados da sala, jogadores)
   - Servidor -> Outros: `playerJoined` (novo jogador)

2. **Chat**:
   - Cliente -> Servidor: `chatMessage` (texto)
   - Servidor -> Todos: `chatMessage` (remetente, texto, horário)

3. **Início do Jogo**:
   - Host -> Servidor: `startGame` (configurações)
   - Servidor -> Todos: `gameStarted` (dados iniciais)
   - Servidor -> Cada jogador: `dealCards` (cartas específicas)

4. **Durante o Jogo**:
   - Cliente -> Servidor: `makeGuess` (palpite)
   - Cliente -> Servidor: `playCard` (índice da carta)
   - Servidor -> Todos: `playerGuessed`, `cardPlayed`, etc.

5. **Saída de Jogador**:
   - Servidor -> Todos: `playerLeft` (jogador que saiu)
   - Servidor -> Novo Host: `becameHost` (se aplicável)

## Requisitos para Implantação

- **Frontend**: Navegador moderno com suporte a WebSockets.
- **Backend**: Node.js com as seguintes dependências:
  - Socket.io (para comunicação WebSocket)
  - HTTP (para servidor base)

## Próximos Passos

1. **Aprimorar tratamento de erros**: Melhorar a robustez para desconexões.
2. **Adicionar funcionalidades ao chat**: Emojis, histórico, etc.
3. **Implementar sistema de bot**: Substituir jogadores que saem durante a partida.
4. **Adicionar página de regras**: Tutorial integrado ao lobby.
5. **Implementar efeitos sonoros**: Notificações para eventos do jogo e chat.

## Considerações de Segurança

- Validar todas as ações no servidor para evitar trapaças.
- Implementar timeout para jogadores inativos.
- Considerar usar HTTPS em produção para proteger a comunicação.

## Conclusão

Este sistema de sala única multiplayer fornece uma implementação mais simples e direta para transformar o jogo Fodinha em uma experiência multiplayer online. A arquitetura cliente-servidor com WebSockets permite comunicação em tempo real eficiente entre os jogadores, mantendo apenas uma sala central que simplifica o gerenciamento e facilita que os amigos joguem juntos.